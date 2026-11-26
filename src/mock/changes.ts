import {live} from '../live/actions';
import {currentSchool} from '../state/school';
import {addDays, money, timeRange, weekdayOf, weekdayShort} from '../lib/format';
import {
    BOARD,
    CLASSES,
    classById,
    classesOf,
    BOARD_READERS,
    LAST_SAMPLE_DAY,
    PERSONAL,
    PRICES,
    PROOFS,
    ROOMS,
    PACKAGES,
    ENROLLMENTS,
    roomName,
    sessionById,
    SESSIONS,
    STUDENTS,
    studentById,
    studentsOf,
    teacherName,
    TEACHERS,
    TERMS_WAITING,
    TODAY,
    type Notice,
    type SchoolClass,
    type Session,
    type Slot,
} from './data';

/**
 * What the director changes in the prototype's calendar, kept in memory until the page reloads:
 * the sessions and classes change, and each change is posted on the board as the database would
 * (rule 23). Screens read the same arrays, so going back shows the change.
 */

let posted = 0;

function post(notice: Omit<Notice, 'id' | 'school' | 'date' | 'unread'>) {
    posted += 1;
    BOARD.unshift({id: `change-${posted}`, school: currentSchool(), date: TODAY, unread: true, ...notice});
}

/** A schedule change's heading: the class, and the session (written in the reader's language when shown). */
const sessionTitle = (session: Session) => classById(session.classId).name;
const sessionAt = (session: Session) => `${session.date} ${session.start}`;

const slotsText = (slots: Slot[]) => slots.map(slot => `${weekdayShort(slot.weekday)} ${timeRange(slot.start, slot.end)}, ${roomName(slot.room)}`).join(' · ');

const byTime = (a: Session, b: Session) => (a.date + a.start).localeCompare(b.date + b.start);

/** The class's sessions from a date on, from its weekly slots, up to its last date (and the sample's). */
function generate(item: SchoolClass, since: string) {
    for (let date = since < item.from ? item.from : since; date <= item.until && date <= LAST_SAMPLE_DAY; date = addDays(date, 1)) {
        for (const slot of item.slots.filter(slot => slot.weekday === weekdayOf(date))) {
            const id = `${item.id}-${date}-${slot.start}`;
            if (SESSIONS.some(session => session.id === id)) continue;
            SESSIONS.push({
                id,
                classId: item.id,
                date,
                start: slot.start,
                end: slot.end,
                room: slot.room,
                status: 'scheduled',
                expected: item.students
            });
        }
    }
    SESSIONS.sort(byTime);
}

/** Removes the class's sessions from a date on that nothing points at yet (no attendance, not cancelled). */
function dropFrom(classId: string, since: string) {
    for (let i = SESSIONS.length - 1; i >= 0; i--) {
        const session = SESSIONS[i];
        if (session.classId === classId && session.date >= since && session.status === 'scheduled' && !session.checkedIn && !session.replaces) SESSIONS.splice(i, 1);
    }
}

/** A new teacher from a date: the earlier sessions keep the teacher who gave them. */
function handOver(item: SchoolClass, teacher: string, since: string) {
    if (teacher === item.teacher) return;
    for (const session of SESSIONS) {
        if (session.classId === item.id && session.date < since && !session.teacher) session.teacher = item.teacher;
    }
    item.teacher = teacher;
}

/** Moving is a cancellation with its replacement linked to it (rule 17). */
export function moveSession(id: string, to: { date: string; start: string; end: string; room: string }) {
    live.moveSession(id, to);
    const session = sessionById(id);
    const newId = `${session.classId}-${to.date}-${to.start}-moved`;
    session.status = 'cancelled';
    session.replacementId = newId;
    SESSIONS.push({
        id: newId,
        classId: session.classId, ...to,
        status: 'scheduled',
        replaces: id,
        expected: session.expected,
        teacher: session.teacher
    });
    SESSIONS.sort(byTime);
    post({
        kind: 'schedule',
        classId: session.classId,
        title: sessionTitle(session), at: sessionAt(session),
        text: 'notice.moved',
        vars: {when: `${to.date} ${to.start}`, room: roomName(to.room)}
    });
}

export function cancelSession(id: string) {
    live.cancelSession(id);
    const session = sessionById(id);
    session.status = 'cancelled';
    post({kind: 'cancelled', classId: session.classId, title: sessionTitle(session), at: sessionAt(session), text: 'notice.cancelledOnly'});
}

/** Picking the session's own teacher again takes the substitute away. */
export function giveToSubstitute(id: string, teacher: string) {
    const session = sessionById(id);
    live.setSubstitute(id, teacher === teacherOf(session) ? null : teacher);
    if (teacher === teacherOf(session)) {
        session.substitute = undefined;
        post({kind: 'teacher', classId: session.classId, title: sessionTitle(session), at: sessionAt(session), text: 'notice.noSubstitute', vars: {name: teacherName(teacher)}});
        return;
    }
    session.substitute = teacher;
    post({
        kind: 'substitute',
        classId: session.classId,
        title: sessionTitle(session), at: sessionAt(session),
        text: 'notice.substitute',
        vars: {name: teacherName(teacher)}
    });
}

export function changeTeacher(classId: string, teacher: string, since: string) {
    live.changeTeacher(classId, teacher, since);
    const item = classById(classId);
    handOver(item, teacher, since);
    post({
        kind: 'teacher',
        classId,
        title: item.name,
        text: 'notice.newTeacher',
        vars: {when: since, name: teacherName(teacher)}
    });
}

export type ClassFields = Pick<SchoolClass, 'name' | 'teacher' | 'slots' | 'from' | 'until' | 'max' | 'inPackages' | 'perVisit' | 'monthly'>;

/** Editing a weekly class from one of its sessions on: those sessions are made again, earlier ones stay (rule: past sessions never change). */
export function editClass(classId: string, fields: ClassFields, since: string) {
    const item = classById(classId);
    const timesChanged = slotsText(item.slots) !== slotsText(fields.slots);
    const teacherChanged = fields.teacher !== item.teacher;
    handOver(item, fields.teacher, since);
    Object.assign(item, {...fields, from: item.from <= TODAY ? item.from : fields.from});
    dropFrom(classId, since);
    generate(item, since);
    if (timesChanged) post({
        kind: 'schedule',
        classId,
        title: item.name,
        text: 'notice.schedule',
        vars: {when: since, slots: slotsText(item.slots)}
    });
    if (teacherChanged) post({
        kind: 'teacher',
        classId,
        title: item.name,
        text: 'notice.newTeacher',
        vars: {when: since, name: teacherName(item.teacher)}
    });
}

/** Ending a class on one of its sessions: the later ones go; its enrollments end with it. */
export function endClass(classId: string, last: string) {
    live.endClass(classId, last);
    const item = classById(classId);
    item.until = last;
    item.ending = true;
    dropFrom(classId, addDays(last, 1));
    post({kind: 'ended', classId, title: item.name, text: 'notice.ended', vars: {when: last}});
}

/**
 * A new weekly class; with `replaces`, the old class's students who read the prototype get a
 * personal notice about it (they enroll themselves, rule 4).
 */
export function createClass(fields: ClassFields, replaces?: string): SchoolClass {
    const item: SchoolClass = {id: `new-${CLASSES.length}`, kind: 'weekly', students: 0, ...fields};
    CLASSES.push(item);
    generate(item, item.from);
    if (replaces) {
        const old = classById(replaces);
        for (const role of ['s', 'g'] as const) {
            if (!(BOARD_READERS[role] ?? []).some(student => classesOf(student).includes(replaces))) continue;
            PERSONAL[role].unshift({
                id: `new-class-${item.id}-${role}`,
                school: 'colibri',
                date: TODAY,
                unread: true,
                text: 'personal.newClass',
                vars: {old: old.name, name: item.name, when: item.from},
            });
        }
    }
    return item;
}

/** Who teaches a session: the class's teacher then (it may have changed since), unless a substitute gives it. */
export const teacherOf = (session: Session) => session.teacher ?? classById(session.classId).teacher;

// ---- People, rooms, prices, terms, screenshots ----

/** A teacher's sessions ahead at the school: the ones they give, and the ones they cover as a substitute. */
export const futureSessionsOf = (teacher: string) => SESSIONS.filter(session => session.date >= TODAY && session.status === 'scheduled'
    && (session.substitute === teacher || (!session.substitute && teacherOf(session) === teacher)));

/**
 * Before a teacher leaves: each of their classes goes to a new teacher from a date, and the
 * sessions they'd cover as a substitute go back to their own teacher.
 */
export function reassignTeacher(from: string, to: Record<string, string>, since: string) {
    for (const [classId, teacher] of Object.entries(to)) changeTeacher(classId, teacher, since);
    for (const session of SESSIONS.filter(session => session.substitute === from && session.date >= since)) giveToSubstitute(session.id, teacherOf(session));
}

export function deactivateTeacher(id: string) {
    const teacher = TEACHERS.find(item => item.id === id);
    if (teacher) teacher.status = 'inactive';
}

/** The room's sessions ahead (a room is archived only once they move). */
export const futureSessionsIn = (room: string) => SESSIONS.filter(session => session.room === room && session.date >= TODAY && session.status === 'scheduled');

export function archiveRoom(id: string) {
    const room = ROOMS.find(item => item.id === id);
    if (room) room.archived = true;
}

/** Enrollments that were ended, by student and what they're in: the date they end (the end of the month paid). */
export const ENDED_ENROLLMENTS = new Map<string, string>();

export function endEnrollment(student: string, what: string, until: string) {
    ENDED_ENROLLMENTS.set(`${student}:${what}`, until);
}

export function setStudentStatus(id: string, status: 'active' | 'inactive') {
    live.setStudentStatus(id, status);
    const student = studentById(id);
    if (student.id === id) student.status = status;
}

/** A new price from a date: the current one stays until then (never edited), posted as important. */
export function schedulePrice(id: string, amount: number, from: string) {
    live.schedulePrice(id, amount, from);
    const price = PRICES.find(item => item.id === id);
    if (!price) return;
    price.next = {amount, from};
    post({kind: 'price', title: price.label, priceId: price.id, text: 'notice.price', vars: {from: money(price.amount), to: money(amount), when: from}});
}

const FIRST = ['Alma', 'Benjamín', 'Clara', 'Diego', 'Eva', 'Félix', 'Gloria', 'Iker', 'Jimena', 'Leo', 'Mía', 'Omar', 'Paula', 'Renata', 'Saúl'];
const LAST = ['Aguirre', 'Bravo', 'Cortés', 'Durán', 'Esquivel', 'Fuentes', 'Galván', 'Juárez', 'Lara', 'Mejía'];

/** Colibrí's 58 current students by name: the sample's, the ones still to accept, and more to fill the count. */
const ROSTER: string[] = (() => {
    const names = [...new Set([...STUDENTS.filter(student => student.status === 'active').map(student => student.name), ...TERMS_WAITING])];
    for (let i = 0; names.length < 58; i++) names.push(`${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`);
    return names.slice(0, 58);
})();

/**
 * Each school's terms: who hasn't accepted the current version, by name. Publishing a version makes
 * every current student accept it again. Students who were deactivated don't count: they no longer
 * use the school.
 */
function termsOf(version: number, uploaded: string, pending: string[], earlier: { version: number; uploaded: string }[], roster: () => string[], gone: () => Set<string>) {
    return {
        version, uploaded, pending, earlier, roster,
        get students() {
            const left = gone();
            return roster().filter(name => !left.has(name)).length;
        },
        get waiting() {
            const left = gone();
            return this.pending.filter(name => !left.has(name));
        },
        get accepted() {
            return this.students - this.waiting.length;
        },
    };
}

const goneFrom = (school: string) => () => new Set(studentsOf(school).filter(student => student.status === 'inactive').map(student => student.name));

const TERMS = {
    colibri: termsOf(3, '2026-11-20', [...STUDENTS.filter(student => student.termsPending).map(student => student.name), ...TERMS_WAITING],
        [{version: 2, uploaded: '2026-03-02'}, {version: 1, uploaded: '2025-08-15'}], () => ROSTER, goneFrom('colibri')),
    helios: termsOf(1, '2026-08-01', studentsOf('helios').filter(student => student.termsPending).map(student => student.name), [],
        () => studentsOf('helios').filter(student => student.status === 'active').map(student => student.name), goneFrom('helios')),
};

/** The terms of the school a director is working in (Colibrí's for students: the sample's). */
/** The live app's terms, by school (from the database). */
export const LIVE_TERMS: Record<string, ReturnType<typeof termsOf>> = {};
export function setLiveTerms(school: string, version: number, uploaded: string, pending: string[], earlier: { version: number; uploaded: string }[], roster: string[]) {
    LIVE_TERMS[school] = termsOf(version, uploaded, pending, earlier, () => roster, () => new Set());
}

export const termsState = () => LIVE_TERMS[currentSchool()] ?? (currentSchool() === 'helios' ? TERMS.helios : TERMS.colibri);
export const TERMS_STATE = TERMS.colibri;

export function publishTerms() {
    const terms = termsState();
    terms.earlier.unshift({version: terms.version, uploaded: terms.uploaded});
    terms.version += 1;
    terms.uploaded = TODAY;
    terms.pending = [...terms.roster()];
}

export function acceptTerms(name: string) {
    TERMS.colibri.pending = TERMS.colibri.pending.filter(other => other !== name);
}

/** A director's decision on a screenshot; the student (or guardian) gets a personal notice (rule 10). */
export function decideProof(id: string, state: 'confirmed' | 'rejected', reason: string) {
    live.decideProof(id, state === 'confirmed', reason);
    const proof = PROOFS.find(item => item.id === id);
    if (!proof) return;
    proof.state = state;
    if (reason) proof.reason = reason;
    const role = BOARD_READERS.g.includes(proof.student) ? 'g' : BOARD_READERS.s.includes(proof.student) ? 's' : null;
    if (role) PERSONAL[role].unshift({
        id: `proof-${id}`, school: proof.school, date: TODAY, unread: true,
        text: state === 'rejected' ? 'personal.rejected' : 'personal.confirmedProof', vars: {what: proof.covers},
    });
}

/** Minors registered again as adults: once that registration is done, a to-do asks to delete the minor one. */
export const GROWN = new Set<string>();

/**
 * To-dos that are only to know about (a card changed, a new enrollment, a student over their plan)
 * clear once the director has seen them, by opening the student's file (or its change history).
 */
export const SEEN = new Set<string>();

/** Registration fees the director has marked as paid. */
export const FEES_DONE = new Set<string>();

// ---- Packages: the director creates and changes them; one nobody has can be deleted, one in use stops being offered ----

/** Who has a package now: their enrollment in it, or (Helios) their plan. */
export const packageHolders = (id: string) => [...new Set([
    ...ENROLLMENTS.filter(enrollment => enrollment.packageId === id).map(enrollment => enrollment.student),
    ...studentsOf(currentSchool()).filter(student => student.packageId === id && student.status === 'active').map(student => student.id),
])].filter(student => !ENDED_ENROLLMENTS.has(`${student}:${id}`));

export function savePackage(fields: { label: string; perWeek: number; classes: string[] }, id?: string, amount?: number): string {
    const pack = id ? PACKAGES.find(item => item.id === id) : undefined;
    const price = id ? PRICES.find(item => item.id === id) : undefined;
    if (pack && price) {
        Object.assign(pack, {perWeek: fields.perWeek, classes: fields.classes});
        price.label = fields.label;
        return pack.id;
    }
    const school = currentSchool();
    const newId = `pk-${school}-${PACKAGES.length + 1}`;
    PACKAGES.push({id: newId, school: school === 'colibri' ? undefined : school, perWeek: fields.perWeek, classes: fields.classes, price: amount ?? 0});
    PRICES.push({id: newId, school: school === 'colibri' ? undefined : school, kind: 'package', label: fields.label, amount: amount ?? 0, from: TODAY, history: []});
    post({kind: 'price', title: fields.label, priceId: newId, text: 'notice.newPackage', vars: {amount: money(amount ?? 0), n: String(fields.perWeek)}});
    return newId;
}

export function removePackage(id: string) {
    const pack = PACKAGES.find(item => item.id === id);
    if (!pack) return;
    if (packageHolders(id).length) {
        pack.retired = true;
        return;
    }
    PACKAGES.splice(PACKAGES.indexOf(pack), 1);
    const price = PRICES.findIndex(item => item.id === id);
    if (price >= 0) PRICES.splice(price, 1);
}

export function offerPackageAgain(id: string) {
    const pack = PACKAGES.find(item => item.id === id);
    if (pack) pack.retired = false;
}
