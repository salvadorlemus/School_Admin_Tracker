import {attendanceOf, classById, guestsOf, NOW, PACKAGES, PRICES, type SchoolId, schoolOfClass, schoolOfSession, type Session, SESSIONS, studentById, TEACHERS, TODAY} from './data';
import {teacherOf} from './changes';
import {PROOFS} from './data';

/**
 * Whether a student's plan or package payment for this month is confirmed: what a teacher sees
 * beside their name. Per-visit payers pay each time, so they have nothing pending.
 */
export function monthPayment(studentId: string, month = TODAY.slice(0, 7)): 'confirmed' | 'uploaded' | 'rejected' | 'none' | 'visit' {
    const student = studentById(studentId);
    if (student.id !== studentId || student.plan === 'cash' || ((student.plan === 'totalpass' || student.plan === 'wellhub') && !student.passExtra)) return 'visit';
    const paid = PROOFS.filter(proof => proof.student === studentId && proof.school === (student.school ?? 'colibri') && proof.covers.endsWith(`· ${month}`))
        .sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt))[0];
    return paid?.state ?? 'none';
}

/**
 * How a school pays its teachers (a school setting, like the students' payment day): on which days,
 * and by which of three schemes. The prototype keeps it in memory until the page reloads.
 */
export type PayScheme = 'perSession' | 'percent' | 'tiers';

export interface Tier {
    from: number;
    /** Empty for the last range ("8 or more"). */
    to?: number;
    amount: number;
}

export interface PayRule {
    /** The 15th and the 30th (February: its last day), or once a month on the 30th. */
    days: 'half' | 'month';
    scheme: PayScheme;
    /** perSession: each teacher's amount for a session they give. */
    perSession: Record<string, number>;
    defaultPerSession: number;
    /** percent: the teacher's share of what their students paid for the sessions. */
    percent: number;
    /** What TotalPass pays the school for one visit: the base of a TotalPass student's share. */
    totalpassValue: number;
    /** tiers: a session's pay by how many students came. */
    tiers: Tier[];
    /** tiers: what a session nobody came to pays (0: it isn't paid). */
    emptyPay: number;
    /** A change applies from the period going on when it was saved; closed periods keep the rule they had. */
    since?: string;
    before?: PayRule;
}

export const PAY_RULES: Record<SchoolId, PayRule> = {
    colibri: {
        days: 'half', scheme: 'percent', perSession: {}, defaultPerSession: 450, percent: 70, totalpassValue: 150,
        tiers: [{from: 1, to: 3, amount: 350}, {from: 4, to: 7, amount: 550}, {from: 8, amount: 750}], emptyPay: 0,
    },
    ambar: {
        days: 'half',
        scheme: 'perSession',
        perSession: {mariana: 400},
        defaultPerSession: 400,
        percent: 70,
        totalpassValue: 150,
        tiers: [{from: 1, to: 3, amount: 300}, {from: 4, to: 7, amount: 500}, {from: 8, amount: 700}], emptyPay: 0,
    },
    // Helios: per class, by how many students came.
    helios: {
        days: 'half', scheme: 'tiers', perSession: {}, defaultPerSession: 275, percent: 70, totalpassValue: 150,
        tiers: [{from: 1, to: 1, amount: 110}, {from: 2, to: 2, amount: 165}, {from: 3, to: 5, amount: 275}, {from: 6, to: 7, amount: 385}, {from: 8, to: 9, amount: 440}, {from: 10, amount: 550}],
        emptyPay: 0,
    },
};

export const payRule = (school: SchoolId): PayRule => PAY_RULES[school] ?? PAY_RULES.colibri;

/** The rule a period was paid by. */
export function ruleFor(school: SchoolId, period: Period): PayRule {
    let rule = payRule(school);
    while (rule.since && rule.before && period.to < rule.since) rule = rule.before;
    return rule;
}

/** Saving the director's rule: it applies from the period going on today. */
export function saveRule(school: SchoolId, rule: PayRule) {
    const current = payRule(school);
    const since = periodsOf(current)[0].from;
    PAY_RULES[school] = {...rule, since, before: current.since === since ? current.before : current};
}

export interface Period {
    from: string;
    to: string;
    /** The day it's paid on: its last day. */
    payday: string;
    current: boolean;
}

const lastDay = (month: string) => `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;

/** The payday after a period's own: where a payment confirmed after it is paid. */
export function nextPayday(period: Period, rule: PayRule): string {
    const month = period.to.slice(0, 7);
    const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
    const following = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (rule.days === 'month') return lastDay(following);
    return period.to.endsWith('-15') ? lastDay(month) : `${following}-15`;
}

/** The period going on today and the two before it, newest first. */
export function periodsOf(rule: PayRule): Period[] {
    const out: Period[] = [];
    let month = TODAY.slice(0, 7);
    let second = rule.days === 'half' && Number(TODAY.slice(8)) > 15;
    while (out.length < 3) {
        const period = rule.days === 'month' ? {from: `${month}-01`, to: lastDay(month)}
            : second ? {from: `${month}-16`, to: lastDay(month)} : {from: `${month}-01`, to: `${month}-15`};
        out.push({...period, payday: period.to, current: period.from <= TODAY && TODAY <= period.to});
        if (rule.days === 'half' && second) second = false;
        else {
            const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1);
            month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            second = rule.days === 'half';
        }
    }
    return out;
}

/** Who came to a session, by how they pay. Trial classes are the school's; guest teachers are counted apart. */
export interface Turnout {
    plan: number;
    cash: number;
    totalpass: number;
    trial: number;
    guests: number;
    /** Plan or package students whose payment for the month isn't confirmed yet. */
    unpaid: number;
}

/** Who came, from the attendance records when the sample has them (Helios); otherwise invented, but steady: the same session always has the same turnout. */
function turnoutOf(session: Session): Turnout {
    const records = attendanceOf(session);
    if (records) {
        const plan = records.filter(entry => entry.as === 'plan');
        return {
            plan: plan.length, cash: records.filter(entry => entry.as === 'visit').length, totalpass: records.filter(entry => entry.as === 'pass').length,
            trial: records.filter(entry => entry.as === 'trial').length, guests: guestsOf(session),
            unpaid: plan.filter(entry => monthPayment(entry.student, session.date.slice(0, 7)) !== 'confirmed').length,
        };
    }
    let hash = 0;
    for (const char of session.id) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
    const came = session.checkedIn ?? Math.min(session.expected ?? 8, 2 + hash % 9);
    const totalpass = Math.min(came, hash % 3);
    const cash = Math.min(came - totalpass, (hash >> 2) % 2);
    const trial = hash % 5 === 0 && came - totalpass - cash > 0 ? 1 : 0;
    const plan = came - totalpass - cash - trial;
    return {plan, cash, totalpass, trial, guests: hash % 7 === 0 ? 1 : 0, unpaid: Math.min(plan, (hash >> 3) % 3)};
}

/** What one plan or package student's attendance is worth: the plan's price over the sessions it covers. */
function planValue(classId: string): number {
    const item = classById(classId);
    if (item.monthly) return item.monthly.price / item.monthly.sessions;
    const pack = PACKAGES.find(other => other.classes.includes(classId));
    return pack ? pack.price / (pack.perWeek * 4) : 0;
}

export interface SessionPay {
    session: Session;
    turnout: Turnout;
    /** The students that count for the teacher's pay: everyone but trial classes. */
    counted: number;
    amount: number;
    /** A share scheme: what the unconfirmed payments will add once the director confirms them. */
    pending: number;
}

export function sessionPay(session: Session, teacher: string, rule: PayRule): SessionPay {
    const turnout = turnoutOf(session);
    const counted = turnout.plan + turnout.cash + turnout.totalpass;
    const visit = PRICES.find(price => price.kind === 'visit' && (price.school ?? 'colibri') === schoolOfSession(session))?.amount ?? 0;
    let amount = 0;
    let pending = 0;
    if (rule.scheme === 'perSession') amount = rule.perSession[teacher] ?? rule.defaultPerSession;
    else if (rule.scheme === 'percent') {
        // Only confirmed payments count; the rest is added when the director confirms them.
        const share = (value: number) => Math.round(value * rule.percent / 100);
        amount = share((turnout.plan - turnout.unpaid) * planValue(session.classId) + turnout.cash * visit + turnout.totalpass * rule.totalpassValue);
        pending = share(turnout.unpaid * planValue(session.classId));
    } else {
        amount = counted === 0 ? rule.emptyPay : rule.tiers.find(tier => counted >= tier.from && (tier.to === undefined || counted <= tier.to))?.amount ?? 0;
    }
    return {session, turnout, counted, amount, pending};
}

export interface ClassPay {
    classId: string;
    sessions: SessionPay[];
    counted: number;
    trial: number;
    guests: number;
    unpaid: number;
    amount: number;
    pending: number;
}

/**
 * A teacher's pay for a period at a school: the sessions they gave (their own, and the ones they
 * covered as a substitute; not the ones someone covered for them), up to today, cancelled ones left out.
 */
export function teacherPay(teacher: string, school: SchoolId, period: Period, rule: PayRule = ruleFor(school, period)) {
    const given = SESSIONS.filter(session => schoolOfClass(classById(session.classId)) === school && session.status === 'scheduled'
        && session.date >= period.from && session.date <= period.to && (session.date < TODAY || (session.date === TODAY && session.end <= NOW))
        && (session.substitute ? session.substitute === teacher : teacherOf(session) === teacher));
    const byClass = new Map<string, SessionPay[]>();
    for (const session of given) byClass.set(session.classId, [...(byClass.get(session.classId) ?? []), sessionPay(session, teacher, rule)]);
    const classes: ClassPay[] = [...byClass.entries()].map(([classId, sessions]) => ({
        classId, sessions,
        counted: sessions.reduce((sum, item) => sum + item.counted, 0),
        trial: sessions.reduce((sum, item) => sum + item.turnout.trial, 0),
        guests: sessions.reduce((sum, item) => sum + item.turnout.guests, 0),
        unpaid: sessions.reduce((sum, item) => sum + item.turnout.unpaid, 0),
        amount: sessions.reduce((sum, item) => sum + item.amount, 0),
        pending: sessions.reduce((sum, item) => sum + item.pending, 0),
    }));
    return {
        classes,
        sessions: given.length,
        counted: classes.reduce((sum, item) => sum + item.counted, 0),
        amount: classes.reduce((sum, item) => sum + item.amount, 0),
        pending: classes.reduce((sum, item) => sum + item.pending, 0),
        unpaid: classes.reduce((sum, item) => sum + item.unpaid, 0),
        covered: given.filter(session => session.substitute === teacher).length,
    };
}

// ---- Paying teachers: the school records each payment, the teacher confirms it ----

export type TeacherPaymentState = 'paid' | 'confirmed' | 'flagged';

/**
 * A payment from the school to a teacher for a period, recorded by a director (never edited: a
 * correction is another entry). The teacher confirms they received it, or flags it with a note.
 */
export interface TeacherPayment {
    id: string;
    teacher: string;
    school: SchoolId;
    /** The period's first day. */
    period: string;
    amount: number;
    method: 'transfer' | 'cash';
    date: string;
    note?: string;
    receipt: boolean;
    /** The photo picked on the phone (the prototype keeps it in memory). */
    receiptUrl?: string;
    state: TeacherPaymentState;
    flagNote?: string;
}

let seeded: TeacherPayment[] | null = null;

/** The sample's payments: the last two closed periods at Colibrí and Helios. */
export function teacherPayments(): TeacherPayment[] {
    if (seeded) return seeded;
    const [, closed, older] = periodsOf(payRule('colibri'));
    const due = (teacher: string, period: Period) => teacherPay(teacher, 'colibri', period).amount;
    const entry = (teacher: string, period: Period, state: TeacherPaymentState, less = 0, flagNote?: string): TeacherPayment => ({
        id: `tp-${teacher}-${period.from}`, teacher, school: 'colibri', period: period.from, amount: due(teacher, period) - less,
        method: 'transfer', date: period.payday, receipt: true, state, flagNote,
    });
    seeded = [
        ...['mariana', 'diego', 'lucia', 'ana', 'fernanda', 'rodrigo'].filter(teacher => due(teacher, older) > 0).map(teacher => entry(teacher, older, 'confirmed')),
        entry('mariana', closed, 'confirmed'),
        entry('lucia', closed, 'flagged', 400, 'Falta la sesión del jueves 12, que di como suplente.'),
        entry('rodrigo', closed, 'paid'),
    ].filter(item => item.amount > 0);
    // Helios: the older period paid and confirmed; the last one paid to all but Mariana, and Dafne hasn't confirmed hers yet.
    const [, hClosed, hOlder] = periodsOf(payRule('helios'));
    const helios = TEACHERS.filter(teacher => teacher.schools?.includes('helios'));
    const paid = (teacher: string, period: Period, state: TeacherPaymentState): TeacherPayment => ({
        id: `tp-${teacher}-helios-${period.from}`, teacher, school: 'helios', period: period.from, amount: teacherPay(teacher, 'helios', period).amount,
        method: teacher === 'mariana-a' ? 'cash' : 'transfer', date: period.payday, receipt: true, state,
    });
    seeded.push(...helios.map(teacher => paid(teacher.id, hOlder, 'confirmed')),
        ...helios.filter(teacher => teacher.id !== 'mariana-a').map(teacher => paid(teacher.id, hClosed, teacher.id === 'dafne' ? 'paid' : 'confirmed')));
    seeded = seeded.filter(item => item.amount > 0);
    return seeded;
}

export const paymentsFor = (teacher: string, school: SchoolId, period: string) =>
    teacherPayments().filter(item => item.teacher === teacher && item.school === school && item.period === period);

/** Where a closed period stands for a teacher: nothing recorded, or the latest entry's state. */
export function paymentState(teacher: string, school: SchoolId, period: string): TeacherPaymentState | 'unpaid' {
    const entries = paymentsFor(teacher, school, period);
    return entries.length ? entries[entries.length - 1].state : 'unpaid';
}

export function recordTeacherPayment(payment: Omit<TeacherPayment, 'id' | 'state'>) {
    teacherPayments().push({...payment, id: `tp-${payment.teacher}-${payment.period}-${teacherPayments().length}`, state: 'paid'});
}

export function answerTeacherPayment(id: string, ok: boolean, note?: string) {
    const payment = teacherPayments().find(item => item.id === id);
    if (!payment) return;
    payment.state = ok ? 'confirmed' : 'flagged';
    payment.flagNote = ok ? undefined : note;
}

/**
 * The director's reminders about paying teachers: 5 days before the payday, the day before and on
 * the day, while the period's teachers haven't all been paid (rule 12's schedule, for the school).
 */
export function payReminders(school: SchoolId): { id: string; text: 'personal.teacherPayday'; vars: Record<string, string>; date: string; unread: boolean; school: SchoolId }[] {
    const period = periodsOf(payRule(school))[0];
    const days = Math.round((Date.parse(period.payday) - Date.parse(TODAY)) / 86400000);
    if (days < 0 || days > 5) return [];
    const teachers = TEACHERS.filter(teacher => teacher.status === 'active' && (teacher.schools ?? ['colibri']).includes(school) && teacherPay(teacher.id, school, period).amount > 0);
    const unpaid = teachers.filter(teacher => paymentState(teacher.id, school, period.from) === 'unpaid').length;
    if (unpaid === 0) return [];
    return [{id: `payday-${period.from}`, text: 'personal.teacherPayday', vars: {when: period.payday, n: String(unpaid)}, date: TODAY, unread: true, school}];
}
