import {loadAdmin} from './admin';
import {onAdminHost, onAppHost} from '../lib/hosts';
import type {User} from '@supabase/supabase-js';
import {supabase, supabaseReady} from '../lib/supabase';
import {LIVE} from './state';
import {loadLive} from './load';

/**
 * Signing in and out of the real app. One sign-in screen for everyone; after it, the person's
 * memberships decide where they land (rule: students and guardians never choose a school).
 */

export const ROLES = {director: false, teacher: false, student: false, guardian: false};
/** A student's or guardian's registration still to finish (card and terms). */
export const PENDING: { registration: boolean; terms: NewTerms | null; disabled: string[] } = {registration: false, terms: null, disabled: []};

/** A school's latest terms that someone this person answers for hasn't accepted yet. */
export interface NewTerms {
    school: string;
    students: { id: string; name: string }[];
}

/** The first school whose latest terms are still to accept, for the person or their children (active memberships). */
async function termsToAccept(roles: { role: string; status: string; school_id: string }[]): Promise<NewTerms | null> {
    const active = roles.filter(m => m.status === 'active' && (m.role === 'student' || m.role === 'guardian'));
    if (!active.length) return null;
    const schools = [...new Set(active.map(m => m.school_id))];
    const [{data: links}, {data: terms}] = await Promise.all([
        supabase.from('guardian_link').select('school_id, student_id').eq('guardian_id', LIVE.person).in('school_id', schools),
        supabase.from('terms').select('id, school_id, version').in('school_id', schools).order('version', {ascending: false}),
    ]);
    const children = (links ?? []) as { school_id: string; student_id: string }[];
    const latest = (terms ?? []) as { id: string; school_id: string }[];
    for (const school of schools) {
        const current = latest.find(item => item.school_id === school);
        if (!current) continue;
        const ids = [
            ...(active.some(m => m.school_id === school && m.role === 'student') ? [LIVE.person] : []),
            ...(active.some(m => m.school_id === school && m.role === 'guardian') ? children.filter(c => c.school_id === school).map(c => c.student_id) : []),
        ];
        const {data: accepted} = await supabase.from('terms_acceptance').select('student_id').eq('terms_id', current.id).in('student_id', ids);
        const done = new Set(((accepted ?? []) as { student_id: string }[]).map(a => a.student_id));
        const missing = ids.filter(id => !done.has(id));
        if (!missing.length) continue;
        const {data: people} = await supabase.from('person').select('id, full_name').in('id', missing);
        return {school, students: ((people ?? []) as { id: string; full_name: string }[]).map(p => ({id: p.id, name: p.full_name}))};
    }
    return null;
}

async function identify(user: User): Promise<void> {
    LIVE.email = user.email ?? '';
    const [{data: person}, {data: admin}] = await Promise.all([
        supabase.from('person').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('platform_admin').select('user_id').eq('user_id', user.id).maybeSingle(),
    ]);
    LIVE.person = (person as { id: string } | null)?.id ?? '';
    LIVE.admin = Boolean(admin);
    const {data: roles} = LIVE.person
        ? await supabase.from('membership').select('role, status, school_id').eq('person_id', LIVE.person)
        : {data: []};
    PENDING.registration = ((roles ?? []) as { role: string; status: string }[]).some(m => (m.role === 'student' || m.role === 'guardian') && m.status === 'invited');
    // Every school they belong to is disabled: the database returns nothing else, and the app says so.
    const mine = [...new Set(((roles ?? []) as { school_id: string; status: string }[]).filter(m => m.status !== 'inactive').map(m => m.school_id))];
    const {data: open} = mine.length ? await supabase.from('school').select('name, enabled').in('id', mine) : {data: []};
    const schools = (open ?? []) as { name: string; enabled: boolean }[];
    PENDING.disabled = schools.length && schools.every(x => !x.enabled) ? schools.map(x => x.name) : [];
    PENDING.terms = await termsToAccept((roles ?? []) as { role: string; status: string; school_id: string }[]);
    for (const key of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
        ROLES[key] = ((roles ?? []) as {
            role: string;
            status: string
        }[]).some(m => m.role === key && m.status !== 'inactive');
    }
    await loadLive();
    if (LIVE.admin) await loadAdmin();
}

/** After registering: the memberships changed, so who they are is read again. */
export async function refreshSession(): Promise<void> {
    const {data} = await supabase.auth.getUser();
    if (data.user) await identify(data.user);
}

/** On opening the page: a saved session goes straight to the live app. */
export async function restoreSession(): Promise<boolean> {
    if (!supabaseReady) return false;
    const {data} = await supabase.auth.getSession();
    if (!data.session) return false;
    await identify(data.session.user);
    return true;
}

/** Returns an error key, or null once signed in and loaded. */
export async function signIn(email: string, password: string): Promise<string | null> {
    if (!supabaseReady) return 'signIn.unavailable';
    const {data, error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
    if (error || !data.user) return 'signIn.wrong';
    await identify(data.user);
    return null;
}

export async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    location.hash = '#/';
    location.reload();
}

/** Where a signed-in person lands: their main role's home. */
export function homePath(): string {
    // The admin panel's address opens the panel; the app's never does.
    if (onAdminHost()) return LIVE.admin ? '/a/schools' : '/';
    if (PENDING.disabled.length && !LIVE.admin) return '/disabled';
    if ((PENDING.registration || PENDING.terms) && !ROLES.director && !ROLES.teacher) return '/register';
    if (ROLES.director) return '/d/home';
    if (ROLES.teacher) return '/t/schedule';
    if (ROLES.guardian) return '/g/home';
    if (ROLES.student) return '/s/home';
    if (LIVE.admin && !onAppHost()) return '/a/schools';
    return '/';
}
