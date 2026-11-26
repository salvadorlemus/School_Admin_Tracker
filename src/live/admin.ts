import {supabase} from '../lib/supabase';
import {
    ADMIN_LOG,
    BILLING_PAYMENTS,
    DETAILS,
    SCHOOL_ROWS,
    type AdminLogRow,
    type BillingPayment,
    type SchoolRow
} from '../mock/admin';
import {SCHOOL_LOGOS} from '../mock/data';
import {fileUrl, compressPhoto, uploadFile} from './files';
import {rows, num, str} from './query';

// The admin panel on the real data: schools with their counts (never their records), billing and
// the log. Writes go through the admin RPCs, which log each action.

const ZONES: Record<string, string> = {mx: 'America/Mexico_City', tj: 'America/Tijuana', cun: 'America/Cancun'};
export const zoneKey = (zone: string) => Object.entries(ZONES).find(([, value]) => value === zone)?.[0] ?? 'mx';

const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** Where a school's fee stands this month: paid (or in its trial), due on its billing day, or late after it. */
function standing(fee: number, day: number, trialEnds: string, paid: Set<string>): {
    billing: SchoolRow['billing'];
    due?: SchoolRow['due']
} {
    const now = today();
    const month = monthOf(now);
    if (fee <= 0 || (trialEnds && trialEnds >= now) || paid.has(month)) return {billing: 'ok'};
    const on = `${now.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    return {billing: now > on ? 'late' : 'soon', due: {month, on}};
}

export async function loadAdmin(): Promise<void> {
    const [schools, billing, members, people, payments, log, usage, emails] = await Promise.all([
        rows('school'), rows('school_billing'), rows('membership', 'school_id, person_id, role, status', q => q.eq('role', 'director')),
        rows('person', 'id, full_name, phone'), rows('billing_payment', '*', q => q.order('paid_on', {ascending: false})),
        rows('admin_log', '*', q => q.order('created_at', {ascending: false}).limit(200)),
        supabase.rpc('admin_usage').then(({data}) => (data ?? []) as Record<string, unknown>[]),
        supabase.rpc('admin_director_emails').then(({data}) => (data ?? []) as { school_id: string; person_id: string; email: string }[]),
    ]);
    const person = new Map(people.map(p => [str(p.id), p]));
    SCHOOL_ROWS.splice(0, SCHOOL_ROWS.length, ...schools.map((s): SchoolRow => {
        const id = str(s.id);
        const bill = billing.find(b => b.school_id === id);
        const used = usage.find(u => u.school_id === id);
        const paid = new Set(payments.filter(p => p.school_id === id).map(p => str(p.month)));
        const fee = num(bill?.monthly_fee);
        DETAILS[id] = {
            tz: zoneKey(str(s.time_zone)), billingDay: num(bill?.billing_day) || 1, trialEnd: str(bill?.trial_ends),
            tax: str(bill?.tax_details), notes: str(bill?.notes),
        };
        if (s.logo_path) void fileUrl(str(s.logo_path)).then(url => url && SCHOOL_LOGOS.set(id, url));
        return {
            id, name: str(s.name), enabled: Boolean(s.enabled), fee,
            ...standing(fee, DETAILS[id].billingDay, DETAILS[id].trialEnd, paid),
            students: num(used?.students), teachers: num(used?.teachers), classes: num(used?.classes),
            checkins: num(used?.check_ins), active: num(used?.active_people),
            storage: num(used?.storage_bytes) / 1e9,
            lastActivity: str(used?.last_activity).slice(0, 10) || str(s.created_at).slice(0, 10),
            directors: members.filter(m => m.school_id === id && m.status !== 'inactive').map(m => ({
                name: str(person.get(str(m.person_id))?.full_name),
                phone: str(person.get(str(m.person_id))?.phone),
                email: emails.find(e => e.school_id === id && e.person_id === m.person_id)?.email ?? '',
            })),
        };
    }).sort((a, b) => a.name.localeCompare(b.name)));
    BILLING_PAYMENTS.splice(0, BILLING_PAYMENTS.length, ...payments.map((p): BillingPayment => ({
        id: str(p.id),
        school: str(p.school_name),
        amount: num(p.amount),
        month: str(p.month),
        paidOn: str(p.paid_on),
        method: str(p.method),
    })));
    ADMIN_LOG.splice(0, ADMIN_LOG.length, ...log.map((l): AdminLogRow => ({
        id: str(l.id),
        action: str(l.action),
        school: str(l.school_name),
        details: (l.details ?? {}) as Record<string, unknown>,
        at: str(l.created_at),
    })));
}

type Problem = string | null;
const done = async (result: PromiseLike<{ error: { message: string } | null }>): Promise<Problem> => {
    const {error} = await result;
    if (!error) await loadAdmin().catch(() => undefined);
    return error ? error.message : null;
};

export const adminLive = {
    createSchool: (fields: {
        name: string;
        director: string;
        email: string;
        zone: string;
        fee: number;
        billingDay: number;
        trialEnd: string;
        tax: string;
        notes: string
    }) =>
        done((async () => {
            const {data, error} = await supabase.rpc('admin_create_school', {
                name: fields.name,
                director_name: fields.director,
                director_email: fields.email,
                time_zone: ZONES[fields.zone] ?? ZONES.mx,
                monthly_fee: fields.fee,
            });
            if (error) return {error};
            return supabase.from('school_billing').update({
                billing_day: fields.billingDay,
                trial_ends: fields.trialEnd || null,
                tax_details: fields.tax || null,
                notes: fields.notes || null,
            }).eq('school_id', String(data));
        })()),
    setEnabled: (school: string, enabled: boolean) => done(supabase.rpc('admin_set_enabled', {school, enabled})),
    deleteSchool: (school: string, typed: string) => done(supabase.rpc('admin_delete_school', {
        school,
        typed_name: typed
    })),
    saveDetails: (school: string, fields: {
        name: string;
        zone: string;
        fee: number;
        billingDay: number;
        trialEnd: string;
        tax: string;
        notes: string
    }) =>
        done((async () => {
            const {error} = await supabase.from('school').update({
                name: fields.name,
                time_zone: ZONES[fields.zone] ?? ZONES.mx
            }).eq('id', school);
            if (error) return {error};
            return supabase.from('school_billing').update({
                monthly_fee: fields.fee,
                billing_day: fields.billingDay,
                trial_ends: fields.trialEnd || null,
                tax_details: fields.tax || null,
                notes: fields.notes || null,
            }).eq('school_id', school);
        })()),
    /** The school's logo: the row names the new file, then it goes up (only the admin uploads logos). */
    saveLogo: (school: string, file: File) => done((async () => {
        const path = `${school}/logo/${crypto.randomUUID()}.jpg`;
        const {error} = await supabase.from('school').update({logo_path: path}).eq('id', school);
        if (error) return {error};
        const problem = await uploadFile(path, await compressPhoto(file));
        return {error: problem ? {message: problem} : null};
    })()),
    recordPayment: (school: string, amount: number, month: string, paidOn: string, method: string, paidBy: string) =>
        done(supabase.rpc('admin_record_payment', {
            school,
            amount,
            month,
            paid_on: paidOn,
            method,
            paid_by: paidBy || null
        })),
    inviteDirector: (school: string, name: string, email: string) => done(supabase.rpc('admin_invite_director', {school, full_name: name, email})),
    /** Sends the director's invitation again (a new link; the old one stops working). */
    resendDirector: (schoolName: string) => done((async () => {
        const school = SCHOOL_ROWS.find(row => row.name === schoolName);
        const {data} = await supabase.from('membership').select('id').eq('school_id', school?.id ?? '').eq('role', 'director').eq('status', 'invited')
            .order('created_at', {ascending: false}).limit(1).maybeSingle();
        if (!data) return {error: {message: 'not found'}};
        return supabase.rpc('resend_invitation', {membership: (data as { id: string }).id});
    })()),
};
