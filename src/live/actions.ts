import {DEFAULT_ZONE, instant} from '../lib/zone';
import {supabase} from '../lib/supabase';
import {CLASSES, ENROLLMENTS, PRICES, SCHOOLS, SESSIONS, studentById} from '../mock/data';
import {currentSchool} from '../state/school';
import {LIVE} from './state';
import {loadLive} from './load';

/**
 * The live app's writes. The screens change the in-memory data at once (as the prototype does), and
 * these send the change to the database, then reload what the person sees, so a refused change
 * comes back as it was. The database checks every rule again (a tampered screen can't skip them).
 */

/** The school's zone, for a time picked on its screens. */
const zoneOf = (school: string) => SCHOOLS[school]?.zone ?? DEFAULT_ZONE;
const at = (date: string, time: string) => instant(date, time, zoneOf(currentSchool()));

const listeners = new Set<(message: string) => void>();

/** The app shows a refused or failed change (the screens subscribe once). */
export function onLiveError(listener: (message: string) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Shows a refused change the screens didn't wait for. */
export const liveProblem = (message: string) => listeners.forEach(listener => listener(message));

/** Sends one change; then everything is reloaded either way. */
export function send(change: () => PromiseLike<{ error: { message: string } | null }>): void {
    if (!LIVE.on) return;
    void (async () => {
        const {error} = await change();
        if (error) listeners.forEach(listener => listener(error.message));
        await loadLive().catch(reason => listeners.forEach(listener => listener(String(reason))));
    })();
}

export const live = {
    /** New terms: the row names the file (the database numbers the version and notifies the students), then the PDF goes up. */
    publishTerms: (school: string, file: File) => send(async () => {
        const id = crypto.randomUUID();
        const path = `${school}/terms/${id}.pdf`;
        const {error} = await supabase.from('terms').insert({id, school_id: school, file_path: path});
        if (error) return {error};
        const {error: fileError} = await supabase.storage.from('lyra').upload(path, file, {
            contentType: 'application/pdf',
            upsert: false
        });
        return {error: fileError};
    }),
    decideProof: (id: string, confirmed: boolean, reason: string) =>
        send(() => supabase.rpc('decide_proof', {proof_id: id, confirmed, reason: reason || null})),
    cancelSession: (id: string) => send(() => supabase.rpc('cancel_session', {session_id: id})),
    setVacationDates: async (dates: string[], vacation: boolean): Promise<boolean> => {
        if (!LIVE.on) return true;
        try {
            const {error} = await supabase.rpc('set_vacation_dates', {
                requested_school: currentSchool(),
                vacation_dates: dates,
                is_vacation: vacation,
            });
            if (error) {
                liveProblem(error.message);
                await loadLive().catch(reason => liveProblem(String(reason)));
                return false;
            }
            await loadLive().catch(reason => liveProblem(String(reason)));
            return true;
        } catch (reason) {
            liveProblem(String(reason));
            await loadLive().catch(loadError => liveProblem(String(loadError)));
            return false;
        }
    },
    moveSession: (id: string, to: { date: string; start: string; end: string; room: string }) =>
        send(() => supabase.rpc('move_session', {
            session_id: id,
            new_start: at(to.date, to.start),
            new_end: at(to.date, to.end),
            new_room: to.room
        })),
    setSubstitute: (id: string, teacher: string | null) => send(() => supabase.rpc('set_substitute', {
        session_id: id,
        substitute: teacher
    })),
    changeTeacher: (classId: string, teacher: string, since: string) => {
        const from = SESSIONS.find(s => s.classId === classId && s.date >= since && s.status === 'scheduled');
        if (from) send(() => supabase.rpc('change_teacher', {class_id: classId, from_session: from.id, teacher}));
    },
    endClass: (classId: string, last: string) => {
        const session = [...SESSIONS].reverse().find(s => s.classId === classId && s.date <= last && s.status === 'scheduled');
        if (session) send(() => supabase.rpc('end_class', {class_id: classId, last_session: session.id}));
    },
    schedulePrice: (id: string, amount: number, from: string) => {
        const price = PRICES.find(p => p.id === id);
        if (!price) return;
        const school = price.school ?? currentSchool();
        const kind = price.kind;
        send(() => supabase.from('price').insert({
            school_id: school, kind, amount, starts_on: from,
            class_id: kind === 'monthly' ? id.replace(/^m-/, '') : null, offer_id: kind === 'package' ? id : null,
            attendants: kind === 'free' ? Number(price.label) || 1 : null,
        }));
    },
    setStudentStatus: (id: string, status: 'active' | 'inactive') => {
        const school = studentById(id).school ?? currentSchool();
        send(() => supabase.from('membership').update({status}).eq('school_id', school).eq('person_id', id).eq('role', 'student'));
    },
    addAttendance: (session: string, students: string[]) => send(() => supabase.rpc('add_attendance', {
        session_id: session,
        students
    })),
    markFeeDone: (student: string) => send(async () => {
        const {data} = await supabase.from('registration_fee').select('id').eq('student_id', student).eq('school_id', currentSchool()).is('done_at', null).limit(1);
        const fee = data?.[0] as { id: string } | undefined;
        return fee ? supabase.rpc('mark_fee_done', {fee_id: fee.id}) : {error: null};
    }),
    recordTeacherPayment: (teacher: string, period: string, amount: number, date: string, method: 'transfer' | 'cash', note?: string) =>
        send(() => supabase.rpc('record_teacher_payment', {
            school: currentSchool(),
            teacher,
            period_start: period,
            amount,
            paid_on: date,
            method,
            note: note ?? null
        })),
    answerTeacherPayment: (id: string, received: boolean, note?: string) =>
        send(() => supabase.rpc('answer_teacher_payment', {payment_id: id, received, note: note ?? null})),
    postNotice: (classId: string | undefined, body: string) =>
        send(() => supabase.from('announcement').insert({
            school_id: currentSchool(),
            class_id: classId ?? null,
            kind: 'note',
            body
        })),
    classSchool: (classId: string) => CLASSES.find(c => c.id === classId)?.school ?? currentSchool(),
};

// ---- Invitations (the database sends the email through the worker; whoever invites never sees the link) ----

export interface Invite {
    school: string;
    role: 'student' | 'guardian' | 'teacher';
    email: string;
    fullName: string;
    paymentDay?: 15 | 30;
    children?: string[];
}

/** Registers someone at the school and queues their invitation. Null when it went, the reason otherwise. */
export async function invitePerson(invite: Invite): Promise<string | null> {
    const {error} = await supabase.rpc('invite', {
        school: invite.school,
        role: invite.role,
        email: invite.email.trim(),
        full_name: invite.fullName.trim(),
        payment_day: invite.paymentDay ?? null,
        children: (invite.children ?? []).filter(name => name.trim()).map(name => ({full_name: name.trim(), payment_day: invite.paymentDay ?? 30})),
    });
    if (!error) await loadLive().catch(() => undefined);
    return error ? error.message : null;
}

/** Sends someone's invitation again (a new link; the old one stops working), found by their role and name at the school. */
export async function resendInvite(school: string, role: Invite['role'], fullName: string): Promise<string | null> {
    const {data: people} = await supabase.from('person').select('id').eq('full_name', fullName.trim());
    const ids = ((people ?? []) as { id: string }[]).map(p => p.id);
    const {data: member} = ids.length
        ? await supabase.from('membership').select('id').eq('school_id', school).eq('role', role).eq('status', 'invited').in('person_id', ids)
            .order('created_at', {ascending: false}).limit(1).maybeSingle()
        : {data: null};
    if (!member) return 'not found';
    const {error} = await supabase.rpc('resend_invitation', {membership: (member as { id: string }).id});
    return error ? error.message : null;
}

// ---- The school's setup ----

type Fields = {
    name: string; teacher: string; slots: { weekday: number; start: string; end: string; room: string }[]; from: string; until: string;
    max?: number; inPackages: boolean; perVisit?: boolean; monthly?: { sessions: number; price: number };
};
type Result = { error: { message: string } | null };
const ok: Result = {error: null};
const first = (...results: Result[]): Result => results.find(r => r.error) ?? ok;
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const schoolToday = (school: string) => new Intl.DateTimeFormat('en-CA', {timeZone: zoneOf(school)}).format(new Date());

const slotRow = (school: string, classId: string, slot: Fields['slots'][number], firstDate: string, lastDate: string) => ({
    school_id: school, class_id: classId, weekday: slot.weekday, start_time: slot.start, end_time: slot.end,
    first_date: firstDate, last_date: lastDate, room_id: slot.room,
});

/** A class in the school's packages (all of them) or in none. */
async function setInPackages(school: string, classId: string, on: boolean): Promise<Result> {
    const {data} = await supabase.from('package_offer').select('id').eq('school_id', school).is('retired_at', null);
    const offers = ((data ?? []) as { id: string }[]).map(o => o.id);
    if (!offers.length) return ok;
    if (!on) return supabase.from('package_offer_class').delete().eq('class_id', classId).in('offer_id', offers);
    const {data: have} = await supabase.from('package_offer_class').select('offer_id').eq('class_id', classId);
    const missing = offers.filter(id => !((have ?? []) as { offer_id: string }[]).some(h => h.offer_id === id));
    return missing.length ? supabase.from('package_offer_class').insert(missing.map(offer_id => ({offer_id, class_id: classId}))) : ok;
}

/** A new weekly class: the class, its weekly slots (the database makes its sessions), its monthly price, its packages. */
export async function createClassLive(school: string, fields: Fields): Promise<string | null> {
    const id = crypto.randomUUID();
    const made = await supabase.from('class').insert({
        id, school_id: school, name: fields.name.trim(), teacher_id: fields.teacher, kind: 'weekly', max_students: fields.max ?? null,
        monthly_sessions: fields.monthly?.sessions ?? null, per_visit: fields.perVisit ?? !fields.monthly,
    });
    if (made.error) return made.error.message;
    const result = first(
        await supabase.from('schedule').insert(fields.slots.map(slot => slotRow(school, id, slot, fields.from, fields.until))),
        fields.monthly ? await supabase.from('price').insert({school_id: school, kind: 'monthly', class_id: id, amount: fields.monthly.price, starts_on: schoolToday(school)}) : ok,
        fields.inPackages ? await setInPackages(school, id, true) : ok,
    );
    await loadLive().catch(() => undefined);
    return result.error?.message ?? null;
}

/**
 * Editing a weekly class from one of its sessions on (`since`): the sessions before it never change.
 * New days or times end the old slots the day before and start the new ones that day.
 */
export async function editClassLive(classId: string, before: Fields, fields: Fields, since: string): Promise<string | null> {
    const school = CLASSES.find(c => c.id === classId)?.school ?? currentSchool();
    const results: Result[] = [];
    results.push(await supabase.from('class').update({
        name: fields.name.trim(), max_students: fields.max ?? null, monthly_sessions: fields.monthly?.sessions ?? null,
        per_visit: fields.perVisit ?? !fields.monthly,
    }).eq('id', classId));
    if (fields.teacher !== before.teacher) {
        const from = SESSIONS.find(s => s.classId === classId && s.date >= since && s.status === 'scheduled');
        if (from) results.push(await supabase.rpc('change_teacher', {class_id: classId, from_session: from.id, teacher: fields.teacher}));
    }
    const key = (slots: Fields['slots']) => slots.map(x => `${x.weekday} ${x.start} ${x.end} ${x.room}`).sort().join('|');
    const {data} = await supabase.from('schedule').select('id, first_date').eq('class_id', classId);
    const schedules = (data ?? []) as { id: string; first_date: string }[];
    if (key(before.slots) === key(fields.slots)) {
        if (fields.until !== before.until) results.push(await supabase.from('schedule').update({last_date: fields.until}).eq('class_id', classId));
    } else {
        const waiting = [...fields.slots];
        for (const old of schedules) {
            if (old.first_date < since) results.push(await supabase.from('schedule').update({last_date: dayBefore(since)}).eq('id', old.id));
            else {
                // A slot that hasn't started yet takes one of the new ones (or ends on its first day).
                const slot = waiting.shift();
                results.push(await supabase.from('schedule').update(slot
                    ? {weekday: slot.weekday, start_time: slot.start, end_time: slot.end, room_id: slot.room, last_date: fields.until}
                    : {last_date: old.first_date}).eq('id', old.id));
            }
        }
        if (waiting.length) results.push(await supabase.from('schedule').insert(waiting.map(slot => slotRow(school, classId, slot, since, fields.until))));
    }
    if (fields.monthly && fields.monthly.price !== before.monthly?.price) {
        results.push(await supabase.from('price').insert({school_id: school, kind: 'monthly', class_id: classId, amount: fields.monthly.price, starts_on: schoolToday(school)}));
    }
    if (fields.inPackages !== before.inPackages) results.push(await setInPackages(school, classId, fields.inPackages));
    await loadLive().catch(() => undefined);
    return first(...results).error?.message ?? null;
}

export const setup = {
    saveRoom: (id: string | undefined, fields: { name: string; classesAtOnce?: number; students?: number }) => send(() => {
        const row = {name: fields.name, classes_at_once: fields.classesAtOnce ?? null, max_students: fields.students ?? null};
        return id ? supabase.from('room').update(row).eq('id', id) : supabase.from('room').insert({...row, school_id: currentSchool()});
    }),
    archiveRoom: (id: string) => send(() => supabase.from('room').update({archived_at: new Date().toISOString()}).eq('id', id)),
    /** A package: its name, sessions a week and classes; a new one also gets its price. */
    savePackage: (fields: { label: string; perWeek: number; classes: string[] }, id?: string, amount?: number) => send(async () => {
        const school = currentSchool();
        const offer = id ?? crypto.randomUUID();
        const saved = id
            ? await supabase.from('package_offer').update({name: fields.label, per_week: fields.perWeek}).eq('id', id)
            : await supabase.from('package_offer').insert({id: offer, school_id: school, name: fields.label, per_week: fields.perWeek});
        if (saved.error) return saved;
        const {data} = await supabase.from('package_offer_class').select('class_id').eq('offer_id', offer);
        const had = ((data ?? []) as { class_id: string }[]).map(c => c.class_id);
        const gone = had.filter(c => !fields.classes.includes(c));
        const added = fields.classes.filter(c => !had.includes(c));
        return first(
            gone.length ? await supabase.from('package_offer_class').delete().eq('offer_id', offer).in('class_id', gone) : ok,
            added.length ? await supabase.from('package_offer_class').insert(added.map(class_id => ({offer_id: offer, class_id}))) : ok,
            !id ? await supabase.from('price').insert({school_id: school, kind: 'package', offer_id: offer, amount: amount ?? 0, starts_on: schoolToday(school)}) : ok,
        );
    }),
    /** One nobody holds is deleted; one in use stops being offered (whoever has it keeps it). */
    removePackage: (id: string, inUse: boolean) => send(() => inUse
        ? supabase.from('package_offer').update({retired_at: new Date().toISOString()}).eq('id', id)
        : supabase.from('package_offer').delete().eq('id', id)),
    offerPackageAgain: (id: string) => send(() => supabase.from('package_offer').update({retired_at: null}).eq('id', id)),
    savePayRule: (school: string, rule: {
        days: 'half' | 'month'; scheme: 'perSession' | 'percent' | 'tiers'; perSession: Record<string, number>; defaultPerSession: number;
        percent: number; totalpassValue: number; tiers: { from: number; to?: number; amount: number }[]; emptyPay: number;
    }) => send(() => supabase.rpc('save_pay_rule', {
        school, days: rule.days, scheme: rule.scheme === 'perSession' ? 'per_session' : rule.scheme,
        default_per_session: rule.defaultPerSession, percent: rule.percent, pass_value: rule.totalpassValue, empty_pay: rule.emptyPay,
        rates: Object.entries(rule.perSession).map(([teacher_id, amount]) => ({teacher_id, amount})),
        tiers: rule.scheme === 'tiers' ? rule.tiers.map(x => ({from: x.from, to: x.to ?? null, amount: x.amount})) : [],
    })),
    /**
     * Ends an enrollment or a package (found by its id, its class or package, or the class's name): a director ends it on
     * the day given; a student leaving stays until the end of the month paid, which the database works out.
     */
    endEnrollment: (student: string, what: string, until: string, byStudent = false) => {
        const found = ENROLLMENTS.find(e => e.student === student && (e.id === what || e.classId === what || e.packageId === what
            || CLASSES.find(c => c.id === e.classId)?.name === what));
        if (!found) return;
        const ids = found.how === 'package' ? {enrollment_id: null, package_id: found.id} : {enrollment_id: found.id, package_id: null};
        send(() => byStudent ? supabase.rpc('leave', ids) : supabase.rpc('end_enrollment', {...ids, last_day: until}));
    },
    deactivateTeacher: (id: string) => send(() => supabase.from('membership').update({status: 'inactive'})
        .eq('school_id', currentSchool()).eq('person_id', id).eq('role', 'teacher')),
};
