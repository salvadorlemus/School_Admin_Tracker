import {CLASSES, classById, schoolOfClass, STUDENTS, teacherName} from './data';

/**
 * The director's Resumen: six numbers about the school, each with last month's for the trend and a
 * breakdown. Invented but steady, like the teacher pay; the real ones come from the school's own
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
    lastRate: 0.41,
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
    last: 0.74,
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

export const AT_RISK = RISK_ROWS.filter(row => STUDENTS.some(student => student.id === row.student));

export const riskTotal = () => ({
    count: AT_RISK.length,
    last: 3,
    students: STUDENTS.filter(student => student.status === 'active').length
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

export const lateTotal = () => ({rate: 0.14, last: 0.19, averageDays: 3.2, onTime: 0.86});

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
    return {rate, last: 0.68};
};

export const retentionTone = (rate: number) => toneUp(rate, 0.75, 0.6);
