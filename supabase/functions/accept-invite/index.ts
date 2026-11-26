// The invitation page's two calls, before the person has a session:
//   {token, peek: true}      → who invited them, to which school, as what (nothing is spent: a mail
//                              scanner opening the link doesn't use it up);
//   {token, password}        → creates their login (or checks the one they have) and spends the link.
// The answer looks the same whether the person was new or already had a login.

import {createClient} from 'npm:@supabase/supabase-js@2.119.2';

const env = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
};

/** The sites allowed to call it (APP_ORIGINS, comma-separated): the app and the local dev server unless set. */
const ORIGINS = (Deno.env.get('APP_ORIGINS') ?? 'https://lyra.kokoasoft.com,http://localhost:5174,http://127.0.0.1:5174').split(',').map(origin => origin.trim());

function cors(request: Request): HeadersInit {
    const origin = request.headers.get('Origin') ?? '';
    return {
        'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
    };
}

interface Peek {
    ok: boolean;
    expired: boolean;
    used: boolean;
    cancelled: boolean;
    email: string;
    inviter: string | null;
    school: string;
    role: string;
    name: string;
    has_login: boolean;
}

Deno.serve(async request => {
    const headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, {headers});
    const reply = (body: unknown, status = 200) => Response.json(body, {status, headers});

    const {token, password, peek} = await request.json().catch(() => ({})) as {
        token?: string;
        password?: string;
        peek?: boolean
    };
    if (!token || typeof token !== 'string' || token.length > 100) return reply({error: 'link'}, 400);

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false}});
    const {data, error} = await admin.rpc('invitation_peek', {token});
    const invitation = data as Peek | null;
    if (error || !invitation) return reply({error: 'link'}, 404);
    if (!invitation.ok) return reply({error: invitation.used ? 'used' : invitation.expired ? 'expired' : 'cancelled'}, 410);

    // What the page shows: never whether they already had a login.
    if (peek) return reply({
        school: invitation.school,
        inviter: invitation.inviter,
        role: invitation.role,
        name: invitation.name,
        email: invitation.email
    });

    if (!password || password.length < 8 || password.length > 72) return reply({error: 'password_short'}, 400);

    let userId: string;
    if (invitation.has_login) {
        // Already has a login (another school): the password must be theirs.
        const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {auth: {persistSession: false}});
        const {data: signedIn, error: signInError} = await anon.auth.signInWithPassword({
            email: invitation.email,
            password
        });
        if (signInError || !signedIn.user) return reply({error: 'password_existing'}, 401);
        userId = signedIn.user.id;
    } else {
        const {data: created, error: createError} = await admin.auth.admin.createUser({
            email: invitation.email,
            password,
            email_confirm: true
        });
        if (createError || !created.user) return reply({error: 'create'}, 500);
        userId = created.user.id;
    }

    const {error: redeemError} = await admin.rpc('redeem_invitation', {token, login: userId});
    if (redeemError) return reply({error: 'link'}, 409);
    // The app signs in with the email and password right after.
    return reply({ok: true, email: invitation.email});
});
