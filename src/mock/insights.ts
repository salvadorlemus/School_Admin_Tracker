import {attendanceOf, CLASSES, classById, pricesOf, PROOFS, rosterOf, schoolOfClass, type Session, SESSIONS, type Student, STUDENTS, studentsOf, teacherName, TODAY} from './data';
import {monthPayment, payRule, sessionPay} from './pay';

/**
 * The director's Resumen: six numbers about the school, each with last month's for the trend and a
 * breakdown. Colibrí's are invented but steady, like its teacher pay; Helios's are calculated from its
 * two months of history (loadInsights); the real ones come from the school's own
 * payments, attendance, enrollments and teacher pay, never another school's.
 */

/** Good for the school, worth watching, or bad: the colour each number is drawn in. */
export type Tone = 'good' | 'watch' | 'bad';

/** Higher is better: at or above `good` is good, below `bad` is bad, in between is worth watching. */
export const toneUp = (value: number, good: number, bad: number): Tone => value >= good ? 'good' : value < bad ? 'bad' : 'watch';
/** Lower is better. */
export const toneDown = (value: number, good: number, bad: number): Tone => value <= good ? 'good' : value > bad ? 'bad' : 'watch';

const ours = CLASSES.filter(item => item.kind === 'weekly' && schoolOfClass(item) === 'colibri' && !item.id.startsWith('sx') && !item.id.startsWith('mx'));

let seed = 7;
const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

// ---- 1. Margin per class: what it brings in, minus what its teacher is paid ----

export interface ClassMargin {
    classId: string;
    income: number;
    pay: number;
    margin: number;
    lastMargin: number;
}

export const MARGINS: ClassMargin[] = ours.map(item => {
    const income = Math.round((item.monthly?.price ?? 1400) * Math.max(3, Math.round(item.students * (0.7 + next() * 0.3))) / 50) * 50;
    const pay = Math.round(income * (0.45 + next() * 0.4) / 50) * 50;
    const margin = income - pay;
    return {classId: item.id, income, pay, margin, lastMargin: Math.round(margin * (0.85 + next() * 0.3) / 50) * 50};
}).sort((a, b) => a.margin / a.income - b.margin / b.income);

export const marginTotal = () => ({
    income: MARGINS.reduce((sum, row) => sum + row.income, 0),
    margin: MARGINS.reduce((sum, row) => sum + row.margin, 0),
    last: MARGINS.reduce((sum, row) => sum + row.lastMargin, 0),
});

/** A class keeping under 25% of what it brings in is bad; 40% or more is good. */
export const marginTone = (row: {
    income: number;
    margin: number
}) => toneUp(row.margin / Math.max(1, row.income), 0.4, 0.25);

// ---- 2. Trial classes that turned into an enrollment ----

export interface TrialRow {
    classId: string;
    trials: number;
    enrolled: number;
}

export const TRIALS: TrialRow[] = ours.slice(0, 7).map((item, index) => {
    const trials = 2 + Math.round(next() * 6);
    return {
        classId: item.id,
        trials,
        enrolled: Math.min(trials, Math.round(trials * [0.7, 0.5, 0.2, 0.6, 0.35, 0.8, 0.45][index]))
    };
}).sort((a, b) => a.enrolled / a.trials - b.enrolled / b.trials);

export const trialTotal = () => ({
    trials: TRIALS.reduce((sum, row) => sum + row.trials, 0),
    enrolled: TRIALS.reduce((sum, row) => sum + row.enrolled, 0),
    lastRate: LAST.trial,
});

export const trialTone = (rate: number) => toneUp(rate, 0.5, 0.3);

/** Per teacher: whose trials convert. */
export const trialsByTeacher = () => {
    const map = new Map<string, { trials: number; enrolled: number }>();
    for (const row of TRIALS) {
        const teacher = classById(row.classId).teacher;
        const sum = map.get(teacher) ?? {trials: 0, enrolled: 0};
        map.set(teacher, {trials: sum.trials + row.trials, enrolled: sum.enrolled + row.enrolled});
    }
    return [...map.entries()].map(([teacher, sum]) => ({teacher, name: teacherName(teacher), ...sum}));
};

// ---- 3. How full the classes are, and the time slots that fill ----

export interface FillRow {
    classId: string;
    enrolled: number;
    max: number;
    /** Of the expected, how many came this month. */
    attendance: number;
}

export const FILL: FillRow[] = ours.map(item => {
    const max = item.max ?? 12;
    return {classId: item.id, max, enrolled: Math.min(max, item.students), attendance: 0.55 + next() * 0.4};
}).sort((a, b) => a.enrolled / a.max - b.enrolled / b.max);

export const fillTotal = () => ({
    rate: FILL.reduce((sum, row) => sum + row.enrolled, 0) / FILL.reduce((sum, row) => sum + row.max, 0),
    last: LAST.fill,
});

export const fillTone = (rate: number) => toneUp(rate, 0.8, 0.5);

/** Attendance by weekday and part of the day: the slots that fill, and the ones that don't. */
export const SLOTS: { weekday: number; part: 'morning' | 'afternoon' | 'evening'; rate: number }[] =
    [1, 2, 3, 4, 5, 6].flatMap(weekday => (['morning', 'afternoon', 'evening'] as const).map(part => ({
        weekday,
        part,
        rate: Math.round((0.3 + next() * 0.65) * 100) / 100
    })));

// ---- 4. Students about to leave ----

export type RiskReason = 'attendance' | 'unpaid' | 'missed' | 'ending';

export interface RiskRow {
    student: string;
    reasons: RiskReason[];
    lastSeen: string;
}

const RISK_ROWS: RiskRow[] = [
    {student: 'jimena', reasons: ['attendance', 'unpaid'], lastSeen: '2026-11-07'},
    {student: 'tomas', reasons: ['missed'], lastSeen: '2026-11-12'},
    {student: 'paula', reasons: ['unpaid'], lastSeen: '2026-11-24'},
    {student: 'lorena', reasons: ['attendance', 'missed'], lastSeen: '2026-11-03'},
    {student: 'regina', reasons: ['ending'], lastSeen: '2026-11-26'},
];

export const AT_RISK: RiskRow[] = RISK_ROWS.filter(row => STUDENTS.some(student => student.id === row.student));

export const riskTotal = () => ({
    count: AT_RISK.length,
    last: LAST.risk,
    students: LAST.students,
});

/** Under 5% of the students is fine; over 10% is bad. */
export const riskTone = (count: number, students: number) => toneDown(count / Math.max(1, students), 0.05, 0.1);

// ---- 5. Paying late: after the 5 days following their payment day ----

export const LATE: { student: string; days: number; times: number }[] = [
    {student: 'paula', days: 9, times: 3},
    {student: 'jimena', days: 7, times: 2},
    {student: 'hector', days: 12, times: 1},
    {student: 'camila', days: 6, times: 1},
].filter(row => STUDENTS.some(student => student.id === row.student));

export const lateTotal = () => LATE_TOTAL;

/** Under 10% paying late is good; over 20% is bad. */
export const lateTone = (rate: number) => toneDown(rate, 0.1, 0.2);

/** Late payments by month, for the trend. */
export const LATE_MONTHS = [{month: '2026-06', rate: 0.22}, {month: '2026-07', rate: 0.2}, {
    month: '2026-08',
    rate: 0.24
},
    {month: '2026-09', rate: 0.18}, {month: '2026-10', rate: 0.19}, {month: '2026-11', rate: 0.14}];

// ---- 6. Students still here 3 months after joining ----

export const COHORTS: { month: string; joined: number; after1: number; after3: number | null }[] = [
    {month: '2026-05', joined: 9, after1: 8, after3: 6},
    {month: '2026-06', joined: 7, after1: 6, after3: 4},
    {month: '2026-07', joined: 11, after1: 10, after3: 8},
    {month: '2026-08', joined: 14, after1: 12, after3: 10},
    {month: '2026-09', joined: 12, after1: 11, after3: null},
    {month: '2026-10', joined: 6, after1: 5, after3: null},
];

export const retentionTotal = () => {
    const closed = COHORTS.filter(row => row.after3 !== null);
    const rate = closed.reduce((sum, row) => sum + (row.after3 ?? 0), 0) / closed.reduce((sum, row) => sum + row.joined, 0);
    return {rate, last: LAST.retention};
};

export const retentionTone = (rate: number) => toneUp(rate, 0.75, 0.6);

// ---- Each school's numbers: Colibrí's sample, or calculated from the school's history ----

/** Last month's numbers for the trends. */
const LAST = {trial: 0.41, fill: 0.74, risk: 3, retention: 0.68, students: STUDENTS.filter(student => student.status === 'active').length};
const LATE_TOTAL = {rate: 0.14, last: 0.19, averageDays: 3.2, onTime: 0.86};

const replace = <T, >(list: T[], items: T[]) => list.splice(0, list.length, ...items);
const COLIBRI = {
    margins: [...MARGINS], trials: [...TRIALS], fill: [...FILL], slots: [...SLOTS], risk: [...AT_RISK], late: [...LATE],
    lateMonths: [...LATE_MONTHS], cohorts: [...COHORTS], last: {...LAST}, lateTotal: {...LATE_TOTAL},
};
let loaded = 'colibri';

/** Fills the Resumen with a school's numbers (redrawn on a school switch, so this runs once per school shown). */
export function loadInsights(school: string) {
    if (school === loaded) return;
    loaded = school;
    if (school !== 'helios') {
        replace(MARGINS, COLIBRI.margins);
        replace(TRIALS, COLIBRI.trials);
        replace(FILL, COLIBRI.fill);
        replace(SLOTS, COLIBRI.slots);
        replace(AT_RISK, COLIBRI.risk);
        replace(LATE, COLIBRI.late);
        replace(LATE_MONTHS, COLIBRI.lateMonths);
        replace(COHORTS, COLIBRI.cohorts);
        Object.assign(LAST, COLIBRI.last);
        Object.assign(LATE_TOTAL, COLIBRI.lateTotal);
        return;
    }
    calculate(school);
}

const DAY = 86400000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);
const addMonths = (month: string, n: number) => {
    const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const dueOf = (student: Student, month: string) => `${month}-${student.paymentDay === 15 ? '15' : month.endsWith('-02') ? '28' : '30'}`;
const round = (value: number, to = 10) => Math.round(value / to) * to;

function calculate(school: string) {
    const students = studentsOf(school);
    const prices = pricesOf(school);
    const rule = payRule(school);
    const visit = prices.find(price => price.kind === 'visit')?.amount ?? 0;
    const classes = CLASSES.filter(item => schoolOfClass(item) === school);
    const given = SESSIONS.filter(session => schoolOfClass(classById(session.classId)) === school && attendanceOf(session));
    const thisMonth = monthOf(TODAY);
    const lastMonth = addMonths(thisMonth, -1);
    // The same days of each month, so a month going on compares fairly with the one before.
    const span = (session: Session, month: string) => session.date >= `${month}-01` && session.date < `${month}-${TODAY.slice(8)}`;

    // 1. Margin: what each class brought in (a monthly payment shared among the classes it paid for) minus its teacher's pay.
    const monthlyPrice = (student: Student) => student.plan === 'package' ? prices.find(price => price.id === student.packageId)?.amount ?? 0
        : student.plan === 'monthly' ? prices.find(price => price.kind === 'monthly' && price.label === student.planLabel)?.amount ?? 0
            : student.passExtra ? prices.find(price => price.id === 'h-m-extra')?.amount ?? 0 : 0;
    const uses = new Map<string, number>();
    for (const session of given) for (const entry of attendanceOf(session) ?? []) {
        if (entry.as === 'plan') uses.set(`${entry.student}|${monthOf(session.date)}`, (uses.get(`${entry.student}|${monthOf(session.date)}`) ?? 0) + 1);
    }
    const valueOf = (session: Session) => (attendanceOf(session) ?? []).reduce((sum, entry) => {
        if (entry.as === 'pass') return sum + rule.totalpassValue;
        if (entry.as !== 'plan') return sum + visit;
        const student = students.find(item => item.id === entry.student);
        return sum + (student ? monthlyPrice(student) / Math.max(1, uses.get(`${entry.student}|${monthOf(session.date)}`) ?? 1) : 0);
    }, 0);
    const marginOf = (classId: string, month: string) => {
        const sessions = given.filter(session => session.classId === classId && span(session, month));
        const income = sessions.reduce((sum, session) => sum + valueOf(session), 0);
        const pay = sessions.reduce((sum, session) => sum + sessionPay(session, classById(classId).teacher, rule).amount, 0);
        return {income: round(income), pay: round(pay)};
    };
    replace(MARGINS, classes.map(item => {
        const now = marginOf(item.id, thisMonth);
        const before = marginOf(item.id, lastMonth);
        return {classId: item.id, income: now.income, pay: now.pay, margin: now.income - now.pay, lastMargin: before.income - before.pay};
    }).filter(row => row.income > 0 || row.pay > 0).sort((a, b) => a.margin / Math.max(1, a.income) - b.margin / Math.max(1, b.income)));

    // 2. Trial classes, and whether the student came back (or took a plan).
    const trials = given.flatMap(session => (attendanceOf(session) ?? []).filter(entry => entry.as === 'trial').map(entry => ({session, student: entry.student})));
    const stayed = (student: string) => given.some(session => (attendanceOf(session) ?? []).some(entry => entry.student === student && entry.as !== 'trial'))
        || students.some(item => item.id === student && item.plan !== 'cash');
    const byClass = new Map<string, TrialRow>();
    for (const trial of trials.filter(item => monthOf(item.session.date) === thisMonth)) {
        const row = byClass.get(trial.session.classId) ?? {classId: trial.session.classId, trials: 0, enrolled: 0};
        row.trials += 1;
        if (stayed(trial.student)) row.enrolled += 1;
        byClass.set(trial.session.classId, row);
    }
    replace(TRIALS, [...byClass.values()].sort((a, b) => a.enrolled / a.trials - b.enrolled / b.trials));
    const before = trials.filter(item => monthOf(item.session.date) === lastMonth);
    LAST.trial = before.length ? before.filter(item => stayed(item.student)).length / before.length : 0;

    // 3. How full: the students each class usually has, and how many of the expected came this month.
    const came = (sessions: Session[]) => sessions.reduce((sum, session) => sum + (attendanceOf(session)?.length ?? 0), 0)
        / Math.max(1, sessions.reduce((sum, session) => sum + (session.expected ?? 0), 0));
    replace(FILL, classes.filter(item => item.students > 0).map(item => {
        const max = item.max ?? 12;
        return {classId: item.id, max, enrolled: Math.min(max, item.students), attendance: came(given.filter(session => session.classId === item.id && span(session, thisMonth)))};
    }).sort((a, b) => a.enrolled / a.max - b.enrolled / b.max));
    LAST.fill = fillTotal().rate;
    const part = (start: string) => start < '12:00' ? 'morning' as const : start < '18:00' ? 'afternoon' as const : 'evening' as const;
    const weekday = (date: string) => ((new Date(`${date}T12:00:00`).getDay() + 6) % 7) + 1;
    replace(SLOTS, [1, 2, 3, 4, 5, 6, 7].flatMap(day => (['morning', 'afternoon', 'evening'] as const).map(name => {
        const sessions = given.filter(session => span(session, thisMonth) && weekday(session.date) === day && part(session.start) === name);
        return {weekday: day, part: name, rate: sessions.length ? Math.round(came(sessions) * 100) / 100 : -1};
    })));

    // 4. About to leave: coming much less than usual, gone for two weeks, or a payment pending.
    const riskOn = (today: string) => students.filter(student => student.status === 'active' && student.plan !== 'cash').flatMap(student => {
        const recent = given.filter(session => session.date < today && session.date >= shift(today, -21) && rosterOf(session).some(entry => entry.student === student.id));
        if (recent.length < 2) return [];
        const seen = recent.filter(session => rosterOf(session).some(entry => entry.student === student.id && entry.at));
        const last = given.filter(session => session.date < today && rosterOf(session).some(entry => entry.student === student.id && entry.at)).pop();
        const reasons: RiskReason[] = [];
        if (seen.length / recent.length < 0.5) reasons.push('attendance');
        if (!last || last.date < shift(today, -14)) reasons.push('missed');
        if (today === TODAY && monthPayment(student.id) === 'rejected') reasons.push('unpaid');
        return reasons.length ? [{student: student.id, reasons, lastSeen: last?.date ?? student.since ?? today}] : [];
    });
    replace(AT_RISK, riskOn(TODAY));
    LAST.risk = riskOn(shift(TODAY, -31)).length;
    LAST.students = students.filter(student => student.status === 'active').length;

    // 5. Paying late: a monthly payment sent more than 5 days after the payment day.
    const monthly = (month: string) => students.flatMap(student => {
        const first = PROOFS.filter(proof => proof.student === student.id && proof.covers.endsWith(`· ${month}`)).sort((a, b) => a.sent.localeCompare(b.sent))[0];
        return first && (student.since ?? '') <= dueOf(student, month) ? [{student: student.id, days: daysBetween(dueOf(student, month), first.sent)}] : [];
    });
    const rate = (month: string) => {
        const rows = monthly(month);
        return rows.length ? rows.filter(row => row.days > 5).length / rows.length : 0;
    };
    const both = [...monthly(lastMonth), ...monthly(thisMonth)];
    const lateRows = new Map<string, { student: string; days: number; times: number }>();
    for (const row of both.filter(item => item.days > 5)) {
        const sum = lateRows.get(row.student) ?? {student: row.student, days: 0, times: 0};
        lateRows.set(row.student, {student: row.student, days: Math.max(sum.days, row.days), times: sum.times + 1});
    }
    replace(LATE, [...lateRows.values()].sort((a, b) => b.days - a.days));
    const lateDays = both.filter(row => row.days > 0);
    Object.assign(LATE_TOTAL, {
        rate: rate(thisMonth), last: rate(lastMonth), onTime: 1 - rate(thisMonth),
        averageDays: lateDays.length ? Math.round(lateDays.reduce((sum, row) => sum + row.days, 0) / lateDays.length * 10) / 10 : 0,
    });
    replace(LATE_MONTHS, [{month: lastMonth, rate: rate(lastMonth)}, {month: thisMonth, rate: rate(thisMonth)}]);

    // 6. Still here 1 and 3 months after joining, by the month they joined.
    const stillOn = (student: Student, date: string) => student.status === 'active' || (student.left ?? '') >= date;
    replace(COHORTS, Array.from({length: 6}, (_, index) => addMonths(thisMonth, index - 7)).map(month => {
        const joined = students.filter(student => monthOf(student.since ?? '') === month && student.plan !== 'cash');
        const after = (n: number) => addMonths(month, n) > lastMonth ? null : joined.filter(student => stillOn(student, `${addMonths(month, n)}-28`)).length;
        return {month, joined: joined.length, after1: after(1) ?? joined.length, after3: after(3)};
    }));
    const closed = COHORTS.filter(row => row.after3 !== null);
    const earlier = closed.slice(0, -1);
    LAST.retention = earlier.length ? earlier.reduce((sum, row) => sum + (row.after3 ?? 0), 0) / Math.max(1, earlier.reduce((sum, row) => sum + row.joined, 0)) : retentionTotal().rate;
}
