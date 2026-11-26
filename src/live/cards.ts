import {supabase} from '../lib/supabase';
import type {FamilyPerson} from '../mock/data';
import {saveCardPhoto} from './files';
import {loadLive} from './load';
import {LIVE} from './state';

// Editing a card on the real data (rule 18): the database logs each change and notifies the
// school's directors. The person's own phone is theirs at every school; a new email is the sign-in,
// and changes only once they open the confirmation link sent to it.

export interface CardEdit {
    name: string;
    birth: string;
    health: string;
    /** An adult's own phone and email (undefined for a minor's card). */
    phone?: string;
    email?: string;
    photo?: File;
}

/** Saves a student's card at a school; an adult's emergency contacts are saved as listed. Null when it worked. */
export async function saveCardEdit(school: string, student: string, values: CardEdit, contacts: FamilyPerson[] | null): Promise<string | null> {
    const {data, error} = await supabase.from('student_card').update({
        full_name: values.name.trim(),
        birth_date: values.birth || null,
        health_notes: values.health.trim() || null,
        declared_at: new Date().toISOString(),
    }).eq('school_id', school).eq('student_id', student).select('id').single();
    if (error) return error.message;
    const card = (data as { id: string }).id;
    if (contacts) {
        const removed = await supabase.from('emergency_contact').delete().eq('card_id', card);
        if (removed.error) return removed.error.message;
        const rows = contacts.filter(p => p.emergency && p.phone).map(p => ({
            card_id: card,
            name: p.name,
            relation: p.relation,
            phone: p.phone
        }));
        if (rows.length) {
            const added = await supabase.from('emergency_contact').insert(rows);
            if (added.error) return added.error.message;
        }
    }
    if (values.phone !== undefined) {
        const phone = await supabase.from('person').update({phone: values.phone.trim() || null}).eq('id', LIVE.person);
        if (phone.error) return phone.error.message;
    }
    if (values.email && values.email.trim().toLowerCase() !== LIVE.email.toLowerCase()) {
        const changed = await supabase.auth.updateUser({email: values.email.trim()});
        if (changed.error) return changed.error.message;
    }
    if (values.photo) {
        const problem = await saveCardPhoto(school, student, values.photo);
        if (problem) return problem;
    }
    await loadLive().catch(() => undefined);
    return null;
}

/** Emails a link to choose a new password (the password is never changed inside the app's screens). */
export async function sendPasswordLink(email: string): Promise<string | null> {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: `${window.location.origin}/`});
    return error ? error.message : null;
}
