// The worker: sends the queued emails through Resend, removes deleted files and logins.
//
// pg_cron calls it every 2 minutes (`private.call_worker()`), with the shared WORKER_SECRET. It uses the
// secret key, so it runs only here, on Supabase's servers, never in the app.

import {createClient} from 'npm:@supabase/supabase-js@2.119.2';
import {render} from '../_shared/email.ts';

const env = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
};

/** The sender (EMAIL_FROM, as VetClinicTracker): Lyra's name on the verified domain unless set. */
const FROM = Deno.env.get('EMAIL_FROM') ?? 'Lyra <noreply@mail.kokoasoft.com>';

/** Compares the caller's password without telling, by its timing, how much of it was right. */
function sameSecret(given: string, expected: string): boolean {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
}

interface Queued {
    id: string;
    school_id: string | null;
    to_email: string;
    kind: string;
    vars: Record<string, unknown>;
}

Deno.serve(async request => {
    if (!sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${env('WORKER_SECRET')}`)) {
        return new Response('Forbidden', {status: 403});
    }
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false}});
    const appUrl = Deno.env.get('APP_URL') ?? 'https://lyra.kokoasoft.com';
    const report = {sent: 0, failed: 0, files: 0, logins: 0};

    // ---- Emails ----
    const {data: emails, error} = await db.rpc('next_emails', {how_many: 20});
    if (error) return new Response(error.message, {status: 500});
    for (const email of (emails ?? []) as Queued[]) {
        const message = render(email.kind, email.vars, appUrl);
        if (!message) {
            await db.rpc('email_sent', {email: email.id});
            continue;
        }
        const attachments: { filename: string; content: string }[] = [];
        // Only the email's own school's terms (the database sets that path; checked again before the secret key fetches it).
        const termsPath = email.vars.terms_path;
        const ownTerms = typeof termsPath === 'string' && email.school_id !== null
            && new RegExp(`^${email.school_id}/terms/[0-9a-f-]{36}\\.pdf$`).test(termsPath);
        if (ownTerms) {
            const {data: file} = await db.storage.from('lyra').download(String(termsPath));
            if (file) {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                attachments.push({filename: 'terminos-y-condiciones.pdf', content: btoa(binary)});
            }
        }
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                from: FROM,
                to: [email.to_email],
                subject: message.subject,
                html: message.html,
                attachments
            }),
        });
        const failure = response.ok ? null : `${response.status}: ${(await response.text()).slice(0, 300)}`;
        await db.rpc('email_sent', {email: email.id, error: failure});
        if (failure) report.failed += 1; else report.sent += 1;
    }

    // ---- Files of deleted students and schools ----
    const {data: files} = await db.from('file_deletion').select('path').limit(500);
    const paths = (files ?? []).map(row => row.path as string);
    if (paths.length) {
        const {error: removeError} = await db.storage.from('lyra').remove(paths);
        if (!removeError) {
            await db.from('file_deletion').delete().in('path', paths);
            report.files = paths.length;
        }
    }

    // ---- Logins of people left with no school ----
    const {data: logins} = await db.from('login_deletion').select('user_id').limit(100);
    for (const row of logins ?? []) {
        const {error: deleteError} = await db.auth.admin.deleteUser(row.user_id as string);
        if (!deleteError || deleteError.status === 404) {
            await db.from('login_deletion').delete().eq('user_id', row.user_id);
            report.logins += 1;
        }
    }

    return Response.json(report);
});
