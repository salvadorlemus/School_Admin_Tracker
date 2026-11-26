import {onAdminHost, onAppHost} from '../lib/hosts';
import type {User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import {LIVE} from './state';
import {loadLive} from './load';

/**
 * Signing in and out of the real app. One sign-in screen for everyone; after it, the person's
 * memberships decide where they land (rule: students and guardians never choose a school).
 */

export const ROLES = {director: false, teacher: false, student: false, guardian: false};

async function identify(user: User): Promise<void> {
    LIVE.email = user.email ?? '';
    const [{data: person}, {data: admin}] = await Promise.all([
        supabase.from('person').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('platform_admin').select('user_id').eq('user_id', user.id).maybeSingle(),
    ]);
    LIVE.person = (person as { id: string } | null)?.id ?? '';
    LIVE.admin = Boolean(admin);
    const {data: roles} = LIVE.person
        ? await supabase.from('membership').select('role, status').eq('person_id', LIVE.person)
        : {data: []};
    for (const key of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
        ROLES[key] = ((roles ?? []) as {
            role: string;
            status: string
        }[]).some(m => m.role === key && m.status !== 'inactive');
    }
    await loadLive();
}

/** On opening the page: a saved session goes straight to the live app. */
export async function restoreSession(): Promise<boolean> {
    const {data} = await supabase.auth.getSession();
    if (!data.session) return false;
    await identify(data.session.user);
    return true;
}

/** Returns an error key, or null once signed in and loaded. */
export async function signIn(email: string, password: string): Promise<string | null> {
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
    if (ROLES.director) return '/d/home';
    if (ROLES.teacher) return '/t/schedule';
    if (ROLES.guardian) return '/g/home';
    if (ROLES.student) return '/s/home';
    if (LIVE.admin && !onAppHost()) return '/a/schools';
    return '/';
}
