import {DEFAULT_ZONE, instant} from '../lib/zone';
import {supabase} from '../lib/supabase';
import {CLASSES, PRICES, SCHOOLS, SESSIONS, studentById} from '../mock/data';
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
    decideProof: (id: string, confirmed: boolean, reason: string) =>
        send(() => supabase.rpc('decide_proof', {proof_id: id, confirmed, reason: reason || null})),
    cancelSession: (id: string) => send(() => supabase.rpc('cancel_session', {session_id: id})),
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
