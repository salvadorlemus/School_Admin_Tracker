import type {Enrollment, Notice, Price, Proof, Room, SchoolClass, Session, Student, Teacher} from './data';

/**
 * Helios: a real aerial dance studio's setup (one big room, its weekly schedule, prices and teacher
 * pay), with invented students. Their two months of history (from 26 Sep to today) are generated
 * from each student's plan, so attendance, payments and teacher pay add up the way they would.
 * Change the students below by hand; the history follows them.
 */

export const HELIOS = 'helios';
/** The first day with history: two months before today. */
export const HISTORY_FROM = '2026-09-26';

export const HELIOS_SCHOOL = {name: 'Helios', short: 'Helios'};

/** One big room, up to 30 people at the same time. */
export const HELIOS_ROOM: Room = {
    id: 'hel-salon',
    school: HELIOS,
    name: 'Salón principal',
    students: 30,
    futureSessions: 0
};

const teacher = (id: string, name: string, email: string, phone: string): Teacher =>
    ({id, schools: [HELIOS], name, email, phone, status: 'active', futureSessions: 0, emergency: []});

export const HELIOS_TEACHERS: Teacher[] = [
    teacher('cristina', 'Cristina Urzúa', 'cristina.urzua@correo.mx', '55 3141 5926'),
    teacher('miriam', 'Miriam Rodríguez', 'miriam.rodriguez@correo.mx', '55 2718 2818'),
    teacher('pablo', 'Pablo Olivares', 'pablo.olivares@correo.mx', '55 1618 0339'),
    teacher('dafne', 'Dafne Alexandra', 'dafne.alexandra@correo.mx', '55 1414 2135'),
    teacher('mariana-a', 'Mariana Alvarez', 'mariana.alvarez@correo.mx', '55 1732 0508'),
];

type Kind = 'aerial' | 'advanced' | 'kids' | 'mobility' | 'duet';

const KINDS: Record<string, Kind> = {};
/** How popular each class's hours are, for picking the ones each student usually comes to. */
const WEIGHTS: Record<string, number> = {};

function helios(id: string, name: string, teacher: string, kind: Kind, weight: number, slots: [number, string, string][], extra: Partial<SchoolClass> = {}): SchoolClass {
    KINDS[id] = kind;
    WEIGHTS[id] = weight;
    return {
        id, school: HELIOS, name, teacher, kind: 'weekly', from: '2026-08-03', until: '2027-07-31',
        slots: slots.map(([weekday, start, end]) => ({weekday, start, end, room: HELIOS_ROOM.id})),
        students: 0, inPackages: true, perVisit: true, ...extra,
    };
}

/** The school's week: each teacher's groups, as the school gives them. */
export const HELIOS_CLASSES: SchoolClass[] = [
    helios('h-cris-am', 'Danza aérea', 'cristina', 'aerial', 2, [[1, '10:30', '12:00'], [3, '10:30', '12:00'], [5, '10:30', '12:00']]),
    helios('h-cris-pm', 'Danza aérea', 'cristina', 'aerial', 2, [[2, '16:00', '18:00'], [4, '16:00', '18:00']]),
    helios('h-cris-dom', 'Danza aérea', 'cristina', 'aerial', 2, [[7, '12:00', '13:30']]),
    helios('h-movilidad', 'Movilidad y flexibilidad', 'cristina', 'mobility', 1, [[2, '16:30', '18:00'], [5, '10:30', '12:00']], {
        monthly: {
            sessions: 8,
            price: 600
        }
    }),
    helios('h-ninos', 'Danza aérea para niños', 'miriam', 'kids', 1, [[1, '16:00', '18:00'], [3, '16:00', '18:00'], [5, '16:00', '18:00']], {forKids: true}),
    helios('h-miriam', 'Danza aérea', 'miriam', 'aerial', 1, [[4, '14:00', '16:00'], [5, '14:00', '16:00']]),
    helios('h-pablo-6', 'Danza aérea', 'pablo', 'aerial', 4, [[1, '18:00', '20:00'], [3, '18:00', '20:00']]),
    helios('h-pablo-8', 'Danza aérea', 'pablo', 'aerial', 3, [[1, '20:00', '22:00'], [3, '20:00', '22:00'], [5, '20:00', '22:00']]),
    helios('h-pablo-mj', 'Danza aérea', 'pablo', 'aerial', 4, [[2, '18:30', '20:30'], [4, '18:30', '20:30']]),
    helios('h-pablo-dom', 'Danza aérea', 'pablo', 'aerial', 2, [[7, '13:30', '15:00']]),
    helios('h-avanzados', 'Danza aérea · solo avanzados', 'pablo', 'advanced', 3, [[3, '12:00', '14:00'], [5, '12:00', '14:00']]),
    helios('h-dueto', 'Dueto aéreo', 'pablo', 'duet', 1, [[4, '20:30', '22:00'], [5, '18:00', '20:00'], [6, '18:00', '20:00']], {
        monthly: {
            sessions: 12,
            price: 1000
        }
    }),
    helios('h-dafne-mj', 'Danza aérea', 'dafne', 'aerial', 3, [[2, '20:30', '22:30'], [4, '20:30', '22:30']]),
    helios('h-dafne-sab', 'Danza aérea', 'dafne', 'aerial', 3, [[6, '10:00', '12:00']]),
    helios('h-dafne-dom', 'Danza aérea', 'dafne', 'aerial', 1.5, [[7, '08:00', '10:00'], [7, '10:00', '12:00']]),
    helios('h-mariana', 'Danza aérea', 'mariana-a', 'aerial', 2, [[6, '08:00', '10:00']]),
];

const price = (id: string, kind: Price['kind'], label: string, amount: number): Price =>
    ({id, school: HELIOS, kind, label, amount, from: '2026-08-01', history: []});

export const HELIOS_PRICES: Price[] = [
    {...price('h-fee', 'fee', 'Inscripción', 660), extra: '3'},
    price('h-pk2', 'package', '2 clases de aéreo + 1 complementaria', 1485),
    price('h-pk3', 'package', '3 clases de aéreo + 1 complementaria', 1635),
    price('h-pk4', 'package', '4 clases de aéreo + 1 complementaria', 1785),
    price('h-pk5', 'package', '5 clases de aéreo + 1 complementaria', 1935),
    price('h-m-movilidad', 'monthly', 'Movilidad y flexibilidad', 600),
    price('h-m-dueto', 'monthly', 'Dueto aéreo', 1000),
    // Wellhub and TotalPass cover every aerial class; the complementary ones are paid apart.
    price('h-m-extra', 'monthly', 'Complementarias con Wellhub o TotalPass', 850),
    price('h-visit', 'visit', 'Clase suelta', 290),
    price('h-trial', 'trial', 'Clase de prueba', 290),
];

/** The packages: so many aerial classes a week, plus one complementary, at any of the school's classes. */
export const HELIOS_PACKAGES = [2, 3, 4, 5].map(aerial => ({
    id: `h-pk${aerial}`, school: HELIOS, perWeek: aerial + 1, classes: HELIOS_CLASSES.map(item => item.id),
    price: HELIOS_PRICES.find(item => item.id === `h-pk${aerial}`)?.amount ?? 0,
}));

/** How a Helios student pays: a package (2–5 aerial + 1), Wellhub or TotalPass (with the complementary classes or not), one complementary class, or per class. */
type HeliosPlan =
    'pk2'
    | 'pk3'
    | 'pk4'
    | 'pk5'
    | 'wellhub'
    | 'wellhub+'
    | 'totalpass'
    | 'totalpass+'
    | 'mobility'
    | 'duet'
    | 'visit'
    | 'trial';

interface Row {
    id: string;
    name: string;
    age: number;
    plan: HeliosPlan;
    payday?: 15 | 30;
    /** When they joined; before the history unless it says otherwise. */
    since?: string;
    /** The last day they came, for a student who left. */
    until?: string;
    guardian?: string;
    health?: string;
}

/**
 * The students, by hand: name, age, plan, payment day. Students who joined in the last two months
 * took a trial class first and paid the registration fee; those who only tried a class are "trial".
 */
const ROWS: Row[] = [
    {id: 'h-andrea', name: 'Andrea Gutiérrez Luna', age: 34, plan: 'pk3', payday: 15},
    {id: 'h-valeria', name: 'Valeria Campos Rey', age: 31, plan: 'pk2', payday: 30},
    {id: 'h-fernanda', name: 'Fernanda Ibarra', age: 24, plan: 'pk4', payday: 15},
    {id: 'h-ximena', name: 'Ximena Robles', age: 22, plan: 'pk2', payday: 30},
    {
        id: 'h-daniela',
        name: 'Daniela Ochoa Pérez',
        age: 35,
        plan: 'pk3',
        payday: 30,
        health: 'Escoliosis leve; evitar cargar peso de un solo lado y avisarle antes de envolturas de cadera.'
    },
    {id: 'h-carolina', name: 'Carolina Méndez', age: 29, plan: 'pk5', payday: 15},
    {id: 'h-paola', name: 'Paola Cervantes', age: 26, plan: 'pk2', payday: 15},
    {id: 'h-natalia', name: 'Natalia Herrera Díaz', age: 33, plan: 'pk3', payday: 30},
    {id: 'h-mariana', name: 'Mariana Solís', age: 27, plan: 'pk2', payday: 30},
    {id: 'h-regina', name: 'Regina Aguilar', age: 21, plan: 'pk4', payday: 30},
    {id: 'h-itzel', name: 'Itzel Navarro', age: 30, plan: 'pk2', payday: 15},
    {id: 'h-alejandra', name: 'Alejandra Montes', age: 38, plan: 'pk3', payday: 15},
    {id: 'h-sofia', name: 'Sofía Treviño', age: 25, plan: 'pk2', payday: 30},
    {id: 'h-lucia', name: 'Lucía Zamora', age: 32, plan: 'pk3', payday: 30},
    {id: 'h-brenda', name: 'Brenda Castañeda', age: 41, plan: 'pk2', payday: 15, until: '2026-10-31'},
    {id: 'h-karla', name: 'Karla Villanueva', age: 23, plan: 'pk5', payday: 30},
    {id: 'h-diana', name: 'Diana Salazar', age: 36, plan: 'pk3', payday: 15},
    {id: 'h-montserrat', name: 'Montserrat Vega', age: 20, plan: 'pk2', payday: 30, since: '2026-10-12'},
    {id: 'h-renata', name: 'Renata Fuentes', age: 29, plan: 'pk4', payday: 15},
    {id: 'h-jessica', name: 'Jessica Domínguez', age: 34, plan: 'pk2', payday: 30},
    {id: 'h-gabriela', name: 'Gabriela Lara', age: 27, plan: 'pk3', payday: 15},
    {id: 'h-tania', name: 'Tania Medina', age: 31, plan: 'pk2', payday: 15},
    {id: 'h-miguel', name: 'Miguel Ángel Rosas', age: 30, plan: 'pk3', payday: 30},
    {id: 'h-emiliano', name: 'Emiliano Torres', age: 26, plan: 'pk2', payday: 15},
    {
        id: 'h-isabel',
        name: 'Isabel Cárdenas',
        age: 44,
        plan: 'pk3',
        payday: 30,
        health: 'Hipertensión controlada con medicamento; nada de invertidos prolongados. Si se marea, bajarla y que descanse sentada.'
    },
    {id: 'h-abril', name: 'Abril Sandoval', age: 19, plan: 'pk4', payday: 15, since: '2026-10-05'},
    {id: 'h-camila', name: 'Camila Esquivel', age: 24, plan: 'pk2', payday: 15, since: '2026-11-23'},
    {id: 'h-laura', name: 'Laura Pineda', age: 39, plan: 'pk3', payday: 15},
    {id: 'h-elisa', name: 'Elisa Moreno', age: 37, plan: 'pk5', payday: 30},
    {id: 'h-anapaula', name: 'Ana Paula Ríos', age: 22, plan: 'pk2', payday: 30, since: '2026-11-03'},
    {id: 'h-rodrigo', name: 'Rodrigo Arellano', age: 33, plan: 'wellhub'},
    {id: 'h-monica', name: 'Mónica Gallardo', age: 37, plan: 'wellhub'},
    {id: 'h-sandra', name: 'Sandra Olvera', age: 29, plan: 'wellhub+', payday: 15},
    {id: 'h-hector', name: 'Héctor Lozano', age: 41, plan: 'wellhub'},
    {id: 'h-paulina', name: 'Paulina Estrada', age: 26, plan: 'wellhub'},
    {id: 'h-veronica', name: 'Verónica Nieto', age: 35, plan: 'wellhub+', payday: 30},
    {id: 'h-adriana', name: 'Adriana Becerra', age: 30, plan: 'wellhub'},
    {id: 'h-julieta', name: 'Julieta Carrillo', age: 27, plan: 'totalpass'},
    {id: 'h-oscar', name: 'Óscar Mejía', age: 32, plan: 'totalpass'},
    {
        id: 'h-lorena',
        name: 'Lorena Quintero',
        age: 45,
        plan: 'totalpass+',
        payday: 30,
        health: 'Lesión de muñeca derecha (2025); usa muñequera y evita colgarse solo de esa mano.'
    },
    {id: 'h-cecilia', name: 'Cecilia Rangel', age: 28, plan: 'totalpass'},
    {id: 'h-pamela', name: 'Pamela Juárez', age: 23, plan: 'totalpass', since: '2026-10-20'},
    {id: 'h-raquel', name: 'Raquel Bautista', age: 36, plan: 'totalpass'},
    {
        id: 'h-silvia',
        name: 'Silvia Arriaga',
        age: 52,
        plan: 'mobility',
        payday: 15,
        health: 'Prótesis de cadera izquierda; solo los ejercicios de piso que aprobó su médico, sin aperturas forzadas.'
    },
    {id: 'h-teresa', name: 'Teresa Lugo', age: 47, plan: 'mobility', payday: 30},
    {id: 'h-santiago', name: 'Santiago Bravo', age: 29, plan: 'duet', payday: 30},
    {id: 'h-melissa', name: 'Melissa Ortega Cruz', age: 27, plan: 'duet', payday: 30},
    {id: 'h-daniel', name: 'Daniel Velasco', age: 31, plan: 'visit'},
    {id: 'h-viviana', name: 'Viviana Rocha', age: 25, plan: 'visit'},
    {id: 'h-mauricio', name: 'Mauricio Peña', age: 34, plan: 'visit'},
    {id: 'h-frida', name: 'Frida Contreras', age: 21, plan: 'visit', since: '2026-11-10'},
    {id: 'h-nadia', name: 'Nadia Serrano', age: 30, plan: 'visit'},
    {id: 'h-carla', name: 'Carla Fierro', age: 33, plan: 'pk2', payday: 15, since: '2026-05-04', until: '2026-07-31'},
    {id: 'h-ines', name: 'Inés Robledo', age: 28, plan: 'pk3', payday: 30, since: '2026-06-08', until: '2026-08-31'},
    {id: 'h-pedro', name: 'Pedro Alcalá', age: 40, plan: 'pk2', payday: 15, since: '2026-07-06', until: '2026-09-15'},
    {id: 'h-ivonne', name: 'Ivonne Lara', age: 28, plan: 'trial', since: '2026-10-17'},
    {id: 'h-marco', name: 'Marco Félix', age: 35, plan: 'trial', since: '2026-11-07'},
    {id: 'h-rebeca', name: 'Rebeca Ávila', age: 26, plan: 'trial', since: '2026-11-19'},
    // Children, in the kids' class three times a week (the 2 + 1 package), each with their guardian.
    {id: 'h-emma', name: 'Emma Gutiérrez', age: 8, plan: 'pk2', payday: 15, guardian: 'Andrea Gutiérrez Luna'},
    {id: 'h-luciana', name: 'Luciana Campos', age: 10, plan: 'pk2', payday: 30, guardian: 'Valeria Campos Rey'},
    {
        id: 'h-mia',
        name: 'Mía Robles',
        age: 7,
        plan: 'pk2',
        payday: 30,
        guardian: 'Karen Robles',
        health: 'Asma; su inhalador va en la bolsa de enfrente de la mochila.'
    },
    {id: 'h-sara', name: 'Sara Hernández', age: 11, plan: 'pk2', payday: 15, guardian: 'Patricia Hernández'},
    {id: 'h-julia', name: 'Julia Moreno', age: 9, plan: 'pk2', payday: 30, guardian: 'Elisa Moreno'},
    {id: 'h-victoria', name: 'Victoria Salgado', age: 12, plan: 'pk2', payday: 15, guardian: 'Claudia Salgado'},
    {id: 'h-renatai', name: 'Renata Ibáñez', age: 6, plan: 'pk2', payday: 30, guardian: 'Gloria Ibáñez'},
    {
        id: 'h-alexa',
        name: 'Alexa Duarte',
        age: 10,
        plan: 'pk2',
        payday: 15,
        guardian: 'Marcela Duarte',
        since: '2026-11-09'
    },
];

/** A student who goes over their package once this month (6 a week, came 7). */
const OVER_PLAN = {student: 'h-karla', session: 'h-pablo-8-2026-11-18-20:00', count: '7 / 6'};
/** Students who haven't accepted the terms yet. */
const TERMS_PENDING = new Set(['h-pamela', 'h-frida']);

const CONTACT_FIRST = ['Laura', 'Jorge', 'Rosa', 'Miguel', 'Carmen', 'Luis', 'Patricia', 'Ricardo', 'Elena', 'Arturo'];
const CONTACT_RELATION = ['mother', 'partner', 'sister', 'father', 'husband', 'brother', 'friend', 'wife'];

// ---- A steady random: the same student always gets the same week and the same history ----

function hash(text: string): number {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return value >>> 0;
}

function random(seed: string): () => number {
    let state = hash(seed) || 1;
    return () => {
        state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909);
        state ^= state >>> 16;
        return (state >>> 0) / 4294967296;
    };
}

const chance = (seed: string) => random(seed)();

// ---- Dates ----

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date: string, days: number) => {
    const day = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
    day.setDate(day.getDate() + days);
    return iso(day);
};
/** A month's payment day: the 15th, or the 30th (February: its last day). */
const paydayOf = (month: string, day: 15 | 30) =>
    day === 15 ? `${month}-15` : `${month}-${pad(Math.min(30, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()))}`;
const clockMinus = (start: string, minutes: number) => {
    const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) - minutes;
    return `${Math.floor(total / 60)}:${pad(total % 60)}`;
};

// ---- The students as the app keeps them ----

const isPackage = (plan: HeliosPlan) => plan.startsWith('pk');
const isPass = (plan: HeliosPlan) => plan.startsWith('wellhub') || plan.startsWith('totalpass');

export const HELIOS_STUDENTS: Student[] = ROWS.map((row, index) => {
    const minor = Boolean(row.guardian);
    const contact = minor
        ? {
            name: row.guardian ?? '',
            relation: 'mother',
            phone: `55 ${pad(10 + index)}${pad(hash(row.id) % 100)} ${pad(hash(row.name) % 100)}${pad(index)}`
        }
        : {
            name: `${CONTACT_FIRST[index % 10]} ${row.name.split(' ')[1] ?? ''}`.trim(),
            relation: CONTACT_RELATION[index % 8],
            phone: `55 ${pad(20 + index % 70)}${pad(hash(row.id) % 100)} ${pad(hash(row.name) % 100)}${pad(index)}`
        };
    const plan: Student['plan'] = isPackage(row.plan) ? 'package' : row.plan.startsWith('wellhub') ? 'wellhub' : row.plan.startsWith('totalpass') ? 'totalpass'
        : row.plan === 'mobility' || row.plan === 'duet' ? 'monthly' : 'cash';
    return {
        id: row.id,
        school: HELIOS,
        name: row.name,
        age: row.age,
        minor: minor || undefined,
        guardian: row.guardian,
        plan,
        packageId: isPackage(row.plan) ? `h-${row.plan}` : undefined,
        passExtra: row.plan.endsWith('+') || undefined,
        planLabel: row.plan === 'mobility' ? 'Movilidad y flexibilidad' : row.plan === 'duet' ? 'Dueto aéreo' : '',
        paymentDay: row.payday ?? 30,
        since: row.since ?? '2026-0' + (1 + hash(row.id) % 8) + '-0' + (1 + hash(row.name) % 9),
        status: row.until && row.until < '2026-11-26' ? 'inactive' : 'active',
        left: row.until,
        termsPending: TERMS_PENDING.has(row.id) || undefined,
        overPlan: row.id === OVER_PLAN.student ? OVER_PLAN.count : undefined,
        // Camila joined this week: the director hasn't seen the enrollment, and the fee isn't paid yet.
        newEnrollment: row.id === 'h-camila' ? {what: HELIOS_PRICES.find(item => item.id === `h-${row.plan}`)?.label ?? '', when: row.since ?? ''} : undefined,
        feeOwed: row.id === 'h-camila' || undefined,
        health: row.health,
        emergency: index % 5 === 4 && !minor ? [] : [contact],
        pickup: minor ? [row.guardian ?? ''] : undefined,
    };
});

// ---- Each student's usual week ----

interface SlotRef {
    key: string;
    classId: string;
    weekday: number;
    start: string;
    end: string;
    kind: Kind;
    weight: number;
    part: 'morning' | 'evening' | 'weekend';
}

const slotKey = (classId: string, weekday: number, start: string) => `${classId}|${weekday}|${start}`;

const SLOTS: SlotRef[] = HELIOS_CLASSES.flatMap(item => item.slots.map(slot => ({
    key: slotKey(item.id, slot.weekday, slot.start),
    classId: item.id,
    weekday: slot.weekday,
    start: slot.start,
    end: slot.end,
    kind: KINDS[item.id],
    weight: WEIGHTS[item.id],
    part: slot.weekday >= 6 ? 'weekend' as const : slot.start < '15:00' ? 'morning' as const : 'evening' as const,
})));

const overlaps = (a: SlotRef, b: SlotRef) => a.weekday === b.weekday && a.start < b.end && b.start < a.end;

/** Picks `count` of the slots, weighted by how popular they are and the student's usual time of day, never two at once. */
function pick(count: number, kinds: Kind[], next: () => number, part: SlotRef['part'], taken: SlotRef[]): SlotRef[] {
    const chosen: SlotRef[] = [];
    for (let i = 0; i < count; i++) {
        const free = SLOTS.filter(slot => kinds.includes(slot.kind) && ![...taken, ...chosen].some(other => other.key === slot.key || overlaps(other, slot)));
        // One aerial class a day when the week allows it.
        const spread = free.filter(slot => ![...taken, ...chosen].some(other => other.weekday === slot.weekday));
        const pool = spread.length ? spread : free;
        if (!pool.length) break;
        const weights = pool.map(slot => slot.weight * (slot.part === part ? 3 : 1));
        let roll = next() * weights.reduce((sum, weight) => sum + weight, 0);
        const index = weights.findIndex(weight => (roll -= weight) < 0);
        chosen.push(pool[index < 0 ? pool.length - 1 : index]);
    }
    return chosen;
}

/** Their usual week, and how likely they are to come to each of those classes. */
function weekOf(row: Row): { slots: SlotRef[]; odds: number } {
    const next = random(`week:${row.id}`);
    const roll = next();
    const part: SlotRef['part'] = roll < 0.25 ? 'morning' : roll < 0.85 ? 'evening' : 'weekend';
    const advanced = row.plan === 'pk4' || row.plan === 'pk5' || next() < 0.15;
    const aerial: Kind[] = advanced ? ['aerial', 'advanced'] : ['aerial'];
    if (row.guardian) return {slots: SLOTS.filter(slot => slot.kind === 'kids'), odds: 0.88};
    if (isPackage(row.plan)) {
        const classes = pick(Number(row.plan.slice(2)), aerial, next, part, []);
        return {slots: [...classes, ...pick(1, ['mobility', 'duet'], next, part, classes)], odds: 0.86};
    }
    if (isPass(row.plan)) {
        const classes = pick(next() < 0.5 ? 2 : 3, aerial, next, part, []);
        return {
            slots: row.plan.endsWith('+') ? [...classes, ...pick(1, ['mobility', 'duet'], next, part, classes)] : classes,
            odds: 0.72
        };
    }
    if (row.plan === 'mobility') return {slots: SLOTS.filter(slot => slot.kind === 'mobility'), odds: 0.88};
    // The duet partners come together, Friday and Saturday.
    if (row.plan === 'duet') return {slots: SLOTS.filter(slot => slot.kind === 'duet' && slot.weekday >= 5), odds: 0.9};
    if (row.plan === 'visit') return {slots: pick(1, ['aerial'], next, part, []), odds: 0.4};
    return {slots: [], odds: 0};
}

const WEEKS = new Map(ROWS.map(row => [row.id, weekOf(row)]));
const activeOn = (row: Row, date: string, since: string) => since <= date && (!row.until || date <= row.until);

// ---- The history ----

export interface Attendance {
    student: string;
    at: string;
    by?: 'guardian';
    /** How they pay, as the teacher's pay counts it: plan or package, Wellhub/TotalPass, per class, a trial. */
    as: 'plan' | 'pass' | 'visit' | 'trial';
}

export interface HeliosHistory {
    /** Who's expected at each session (their usual week), by session id. */
    expected: Map<string, string[]>;
    /** Who came, by session id: only sessions already given. */
    attended: Map<string, Attendance[]>;
    /** Teachers who came to another teacher's class, by session id. */
    guests: Map<string, string[]>;
    proofs: Proof[];
    enrollments: Enrollment[];
    board: Notice[];
}

const METHODS: Proof['method'][] = ['transfer', 'transfer', 'card', 'cash'];

export function heliosHistory(sessions: Session[], today: string, now: string, className: (id: string) => string): HeliosHistory {
    const expected = new Map<string, string[]>();
    const attended = new Map<string, Attendance[]>();
    const guests = new Map<string, string[]>();
    const proofs: Proof[] = [];
    const sinceOf = new Map(HELIOS_STUDENTS.map(student => [student.id, student.since ?? '2026-01-01']));
    const ours = sessions.filter(session => session.classId.startsWith('h-') && session.date >= HISTORY_FROM && session.status === 'scheduled');
    const given = (session: Session) => session.date < today || (session.date === today && session.end <= now);
    let counter = 0;
    const proof = (fields: Omit<Proof, 'id' | 'school' | 'sentAt'>, seed: string) => {
        const next = random(`sent:${seed}`);
        proofs.push({
            id: `hp${++counter}`,
            school: HELIOS,
            sentAt: `${pad(8 + Math.floor(next() * 15))}:${pad(Math.floor(next() * 60))}`, ...fields
        });
    };
    // Recent screenshots are still waiting for the director; older ones were checked.
    const stateOf = (sent: string): Proof['state'] => sent < addDays(today, -6) ? 'confirmed' : 'uploaded';

    for (const session of ours) {
        const slot = slotKey(session.classId, ((new Date(`${session.date}T12:00:00`).getDay() + 6) % 7) + 1, session.start);
        const rows = ROWS.filter(row => activeOn(row, session.date, sinceOf.get(row.id) ?? '') && WEEKS.get(row.id)?.slots.some(item => item.key === slot));
        expected.set(session.id, rows.map(row => row.id));
        if (!given(session)) continue;
        const came: Attendance[] = [];
        for (const row of rows) {
            if (chance(`came:${row.id}:${session.id}`) >= (WEEKS.get(row.id)?.odds ?? 0)) continue;
            const as = row.plan === 'visit' ? 'visit' : isPass(row.plan) && KINDS[session.classId] !== 'mobility' && KINDS[session.classId] !== 'duet' ? 'pass' : 'plan';
            came.push({
                student: row.id,
                at: clockMinus(session.start, Math.floor(chance(`at:${row.id}:${session.id}`) * 12)),
                by: row.guardian ? 'guardian' : undefined,
                as
            });
        }
        if (session.id === OVER_PLAN.session) came.push({
            student: OVER_PLAN.student,
            at: clockMinus(session.start, 4),
            as: 'plan'
        });
        attended.set(session.id, came);
        // Dafne comes to the advanced class every other week; Mariana to Pablo's Sunday class now and then.
        const guest = session.classId === 'h-avanzados' && session.date.endsWith('3') ? 'dafne'
            : session.classId === 'h-pablo-dom' && chance(`guest:${session.id}`) < 0.3 ? 'mariana-a' : null;
        if (guest) guests.set(session.id, [guest]);
    }

    // Trial classes: the week before joining (and the people who only tried one).
    for (const row of ROWS.filter(item => item.since && (item.since >= HISTORY_FROM))) {
        const since = sinceOf.get(row.id) ?? '';
        const kind: Kind = row.guardian ? 'kids' : 'aerial';
        const before = row.plan === 'trial' ? since : addDays(since, -4);
        const session = ours.find(item => item.date >= addDays(before, -3) && item.date <= before && KINDS[item.classId] === kind && given(item));
        if (!session) continue;
        attended.get(session.id)?.push({
            student: row.id,
            at: clockMinus(session.start, 7),
            by: row.guardian ? 'guardian' : undefined,
            as: 'trial'
        });
        proof({
            student: row.id,
            covers: `${className(session.classId)} · ${session.date}`,
            method: 'cash',
            amount: 290,
            sent: session.date,
            state: stateOf(session.date)
        }, `trial:${row.id}`);
    }

    // Per class and Wellhub/TotalPass: a screenshot for each class they came to.
    for (const session of ours) {
        for (const entry of attended.get(session.id) ?? []) {
            const row = ROWS.find(item => item.id === entry.student);
            if (!row || entry.as === 'trial' || entry.as === 'plan') continue;
            const method: Proof['method'] = row.plan.startsWith('wellhub') ? 'wellhub' : row.plan.startsWith('totalpass') ? 'totalpass' : 'cash';
            proof({
                student: row.id,
                covers: `${className(session.classId)} · ${session.date}`,
                method,
                amount: method === 'cash' ? 290 : 0,
                sent: session.date,
                state: stateOf(session.date)
            }, `${row.id}:${session.id}`);
        }
    }

    // Monthly payments, October and November, around each student's payment day (some pay late).
    const late = new Set(['h-natalia', 'h-jessica', 'h-emiliano', 'h-renatai']);
    for (const row of ROWS) {
        const monthly = isPackage(row.plan) ? `h-${row.plan}` : row.plan === 'mobility' ? 'Movilidad y flexibilidad' : row.plan === 'duet' ? 'Dueto aéreo'
            : row.plan.endsWith('+') ? 'Complementarias con Wellhub o TotalPass' : null;
        if (!monthly) continue;
        const amount = isPackage(row.plan) ? HELIOS_PRICES.find(item => item.id === `h-${row.plan}`)?.amount ?? 0 : row.plan === 'mobility' ? 600 : row.plan === 'duet' ? 1000 : 850;
        const since = sinceOf.get(row.id) ?? '';
        for (const month of ['2026-10', '2026-11']) {
            if (since.slice(0, 7) > month || (row.until && row.until < `${month}-01`)) continue;
            const due = paydayOf(month, row.payday ?? 30);
            // Joining mid-month: that month in full, due on the first payment day after joining.
            const firstDue = since > due ? paydayOf(month === '2026-10' ? '2026-11' : '2026-12', row.payday ?? 30) : due;
            const offset = late.has(row.id) ? 6 + Math.floor(chance(`late:${row.id}:${month}`) * 4) : Math.floor(chance(`pay:${row.id}:${month}`) * 9) - 4;
            const sent = since > due ? since : addDays(firstDue, offset);
            if (sent > today) continue;
            const method = METHODS[hash(`${row.id}${month}`) % METHODS.length];
            if (row.id === 'h-alejandra' && month === '2026-11') {
                proof({
                    student: row.id,
                    covers: `${monthly} · ${month}`,
                    method,
                    amount,
                    sent: '2026-11-14',
                    state: 'rejected',
                    reason: 'La imagen está borrosa, sube otra por favor.'
                }, `${row.id}:${month}:a`);
                proof({
                    student: row.id,
                    covers: `${monthly} · ${month}`,
                    method,
                    amount,
                    sent: '2026-11-16',
                    state: 'confirmed'
                }, `${row.id}:${month}:b`);
                continue;
            }
            if (row.id === 'h-tania' && month === '2026-11') {
                proof({
                    student: row.id,
                    covers: `${monthly} · ${month}`,
                    method,
                    amount: 1200,
                    sent: '2026-11-21',
                    state: 'rejected',
                    reason: 'El monto no coincide con tu paquete.'
                }, `${row.id}:${month}`);
                continue;
            }
            proof({
                student: row.id,
                covers: `${monthly} · ${month}`,
                method,
                amount,
                sent,
                state: stateOf(sent)
            }, `${row.id}:${month}`);
        }
        // New students paid the registration fee when they joined.
        if (since >= HISTORY_FROM && row.id !== 'h-camila') proof({
            student: row.id,
            covers: 'Inscripción',
            method: 'transfer',
            amount: 660,
            sent: since,
            state: stateOf(since)
        }, `fee:${row.id}`);
    }

    const enrollments: Enrollment[] = ROWS.flatMap<Enrollment>(row => isPackage(row.plan)
        ? [{
            id: `he-${row.id}`,
            student: row.id,
            packageId: `h-${row.plan}`,
            how: 'package' as const,
            from: sinceOf.get(row.id) ?? ''
        }]
        : row.plan === 'mobility' || row.plan === 'duet' ? [{
            id: `he-${row.id}`,
            student: row.id,
            classId: row.plan === 'mobility' ? 'h-movilidad' : 'h-dueto',
            how: 'monthly' as const,
            from: sinceOf.get(row.id) ?? ''
        }] : []);

    const board: Notice[] = [
        {
            id: 'h-n1',
            school: HELIOS,
            date: '2026-11-24',
            kind: 'note',
            classId: 'h-dueto',
            title: 'Dueto aéreo',
            author: 'Pablo Olivares',
            body: 'El sábado 12 de diciembre presentamos los duetos al final de la clase. Las dos semanas antes ensayamos la secuencia completa; vengan con su pareja.',
        },
        {
            id: 'h-n2',
            school: HELIOS,
            date: '2026-11-20',
            kind: 'note',
            title: 'Wellhub y TotalPass',
            author: 'La dirección',
            body: 'Para registrar su clase, traigan la app de Wellhub o TotalPass abierta con el código del día. Si quieren tomar Movilidad o Dueto, pregunten por las complementarias.',
        },
    ];
    return {expected, attended, guests, proofs, enrollments, board};
}

/** The sample's exceptions: the holiday (16 Nov, no classes), a substitute in October and one this Saturday. */
export function heliosExceptions(sessions: Session[]): Notice[] {
    for (const session of sessions) if (session.classId.startsWith('h-') && session.date === '2026-11-16') session.status = 'cancelled';
    const october = sessions.find(session => session.id === 'h-pablo-6-2026-10-21-18:00');
    if (october) october.substitute = 'dafne';
    const saturday = sessions.find(session => session.id === 'h-dafne-sab-2026-11-28-10:00');
    if (saturday) saturday.substitute = 'mariana-a';
    return [
        {
            id: 'h-n3',
            school: HELIOS,
            date: '2026-11-25',
            kind: 'substitute',
            classId: 'h-dafne-sab',
            title: 'Danza aérea',
            at: '2026-11-28 10:00',
            text: 'notice.substitute',
            vars: {name: 'Mariana Alvarez'},
            unread: true,
        },
        {
            id: 'h-n4',
            school: HELIOS,
            date: '2026-11-10',
            kind: 'note',
            title: 'Lunes 16 sin clases',
            author: 'La dirección',
            body: 'El lunes 16 de noviembre es día feriado: no hay clases. Las clases del martes 17 siguen normales.',
        },
    ];
}
