import {LIVE, LIVE_STUDENTS} from '../live/state';
/**
 * Invented sample data for the clickable prototype (docs/design/claude-design-brief.md). Nothing
 * here comes from the database; this folder goes away once the screens read Supabase. Today is
 * Thursday 26 November 2026, Mexico City time.
 *
 * Names, classes, rooms and what people typed (health notes, reasons, posts) are data and stay in
 * Spanish. Texts the app writes itself are keys into the texts files.
 */

import {currentSchool} from '../state/school';
import {HELIOS_CLASSES, HELIOS_PACKAGES, HELIOS_PRICES, HELIOS_ROOM, HELIOS_SCHOOL, HELIOS_STUDENTS, HELIOS_TEACHERS, heliosExceptions, heliosHistory, type Attendance} from './helios';
import type {TextKey} from '../lib/texts';

/**
 * Stress data, for testing the screens with a lot in them: open the prototype as
 * http://localhost:5174/?stress#/... to add schools (7 in all), a teacher and a student in 7
 * schools, a guardian with 7 children, 50+ students, and very long names and texts.
 */
/** Logos the admin uploaded, by school (the prototype keeps them in memory). */
export const SCHOOL_LOGOS = new Map<SchoolId, string>();

export const STRESS = typeof location !== 'undefined' && new URLSearchParams(location.search).has('stress');

export let TODAY = '2026-11-26';
/** The prototype's clock: today at 10:15. */
export let NOW = '10:15';

/** The live app's clock: today and now in the school's time zone (the prototype keeps its fixed day). */
export function setClock(today: string, now: string) {
    TODAY = today;
    NOW = now;
}

const minutes = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
};
const clock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/**
 * Where a session stands now: the QR works from 10 minutes before the start to 30 after it
 * (rule 6), and a teacher can add attendance from then until 1 hour after the end (rule 7).
 */
export function sessionWindow(session: { date: string; start: string; end: string }) {
    const now = session.date < TODAY ? Infinity : session.date > TODAY ? -Infinity : minutes(NOW);
    const opens = minutes(session.start) - 10;
    const addUntil = minutes(session.end) + 60;
    return {
        before: now < opens,
        qrOpen: now >= opens && now <= minutes(session.start) + 30,
        addOpen: now >= opens && now <= addUntil,
        opensAt: clock(opens),
        qrUntil: clock(minutes(session.start) + 30),
        addUntil: clock(addUntil),
    };
}

export type SchoolId = string;

/** Each school's name, short name and time zone (the prototype's are all in Mexico City). */
export const SCHOOLS: Record<SchoolId, { name: string; short: string; zone?: string }> = {
    colibri: {name: 'Estudio Aéreo Colibrí', short: 'Colibrí'},
    ambar: {name: 'Ámbar Danza Aérea', short: 'Ámbar'},
    helios: HELIOS_SCHOOL,
};

/** The stress schools; the first has a very long name. */
const STRESS_SCHOOLS: Record<string, { name: string; short: string }> = {
    bajio: {name: 'Academia Internacional de Artes Circenses y Danza Aérea Contemporánea del Bajío', short: 'Academia Internacional del Bajío'},
    lumbre: {name: 'Casa de la Lumbre', short: 'Lumbre'},
    trazo: {name: 'Vuelo Libre Escuela de Aéreos', short: 'Vuelo Libre'},
    pigmentos: {name: 'Giros del Norte', short: 'Giros'},
    barro: {name: 'Cuerda y Aro Estudio de Circo', short: 'Cuerda y Aro'},
};
if (STRESS) Object.assign(SCHOOLS, STRESS_SCHOOLS);
const STRESS_IDS = Object.keys(STRESS_SCHOOLS);

export interface Room {
    id: string;
    school?: SchoolId;
    name: string;
    classesAtOnce?: number;
    students?: number;
    archived?: boolean;
    futureSessions: number;
}

export const ROOMS: Room[] = [
    {id: 's1', name: 'Sala aérea 1', classesAtOnce: 3, students: 30, futureSessions: 38},
    {id: 's2', name: 'Sala aérea 2', classesAtOnce: 2, students: 16, futureSessions: 21},
    {id: 'cer', name: 'Sala de piso', classesAtOnce: 1, students: 10, futureSessions: 9},
    {id: 'patio', name: 'Patio techado junto a la bodega de aparatos y colchonetas (planta baja)', futureSessions: 4},
    {id: 'old', name: 'Sala aérea 3 (antes de la remodelación)', archived: true, futureSessions: 0},
    {id: 'ta', school: 'ambar', name: 'Sala A', futureSessions: 6},
    {id: 'tb', school: 'ambar', name: 'Sala B', futureSessions: 6},
    HELIOS_ROOM,
];

/** The rooms of the school a director is working in. */
export const roomsHere = () => ROOMS.filter(room => (room.school ?? 'colibri') === currentSchool());

// Stress data: thirty more rooms at Colibrí.
if (STRESS) for (let i = 1; i <= 30; i++) ROOMS.push({id: `r${i}`, name: i === 7 ? 'Sala de aparatos con doble altura y puntos de anclaje certificados (segundo piso, ala norte)' : `Sala ${i}`, classesAtOnce: i % 3 ? 1 : undefined, students: i % 3 ? 12 : undefined, futureSessions: i % 5});

export interface Teacher {
    id: string;
    /** The schools they teach at; Colibrí when not given. */
    schools?: SchoolId[];
    name: string;
    email: string;
    phone: string;
    status: 'active' | 'invited' | 'inactive';
    director?: boolean;
    /** The schools they direct, when they direct several (the school switch lists them). */
    directs?: SchoolId[];
    futureSessions: number;
    emergency: { name: string; relation: string; phone: string }[];
    health?: string;
}

/** The person signed in for each staff role in the sample data. */
/** The person signed in for each staff role (the live loader sets the real one). */
export const STAFF_ME: Record<'t' | 'd', string> = {t: 'mariana-a', d: 'ana'};

export const TEACHERS: Teacher[] = [
    {
        id: 'mariana', schools: ['colibri', 'ambar'], name: 'Mariana Ruiz', email: 'mariana.ruiz@correo.mx', phone: '55 2345 6789', status: 'active',
        futureSessions: 24, emergency: [{name: 'Óscar Ruiz', relation: 'husband', phone: '55 3456 7890'}],
    },
    {
        id: 'diego', name: 'Diego Herrera', email: 'diego.herrera@correo.mx', phone: '55 4567 8901', status: 'active',
        futureSessions: 12, emergency: [{name: 'Elena Herrera', relation: 'sister', phone: '55 5678 9012'}],
        health: 'Diabetes tipo 1; trae glucómetro y jugo en su mochila. Si se ve confundido o sudoroso, darle el jugo y llamar a su contacto.',
    },
    {
        id: 'lucia', name: 'Lucía Ortega', email: 'lucia.ortega@correo.mx', phone: '55 6789 0123', status: 'active',
        futureSessions: 18, emergency: [],
    },
    {
        id: 'rodrigo', name: 'Rodrigo Salas', email: 'rodrigo.salas@correo.mx', phone: '55 7890 1234', status: 'active',
        futureSessions: 3, emergency: [{name: 'Marta Salas', relation: 'mother', phone: '55 8901 2345'}],
    },
    {
        id: 'ana',
        name: 'Ana Torres',
        email: 'ana.torres@correo.mx',
        phone: '55 9012 3456',
        status: 'active',
        director: true,
        schools: ['helios'],
        directs: ['helios'],
        futureSessions: 5,
        emergency: [{name: 'Pablo Méndez', relation: 'businessPartner', phone: '55 0123 4567'}],
    },
    {
        id: 'fernanda', name: 'Fernanda Gil', email: 'fernanda.gil@correo.mx', phone: '55 1357 2468', status: 'active',
        futureSessions: 7, emergency: [{name: 'Raúl Gil', relation: 'father', phone: '55 2468 1357'}],
    },
    {
        id: 'tomas', schools: ['ambar'], name: 'Tomás Rivas', email: 'tomas.rivas@correo.mx', phone: '55 4321 8765', status: 'active',
        futureSessions: 6, emergency: [],
    },
    {
        id: 'sergio', name: 'Sergio Luna', email: 'sergio.luna@correo.mx', phone: '', status: 'invited',
        futureSessions: 0, emergency: [],
    },
    ...HELIOS_TEACHERS,
];

if (STRESS) {
    // Mariana teaches in every school; one more teacher has a very long name.
    TEACHERS[0].schools = ['colibri', 'ambar', ...STRESS_IDS];
    TEACHERS.push({
        id: 'larga', name: 'María de los Ángeles Guadalupe Hernández-Villaseñor de la Garza', email: 'maria.de.los.angeles.hernandez.villasenor@correo-de-ejemplo-muy-largo.mx',
        phone: '55 1111 2222', status: 'active', futureSessions: 8, emergency: [],
    });
}

// Stress data: thirty more teachers at Colibrí.
const STRESS_TEACHER_NAMES = ['Abril', 'Bruno', 'Camila', 'Darío', 'Emilia', 'Fausto', 'Gala', 'Héctor', 'Inés', 'Julián'];
if (STRESS) for (let i = 0; i < 30; i++) TEACHERS.push({
    id: `t${i}`, name: `${STRESS_TEACHER_NAMES[i % 10]} ${['Mora', 'Vidal', 'Ochoa', 'Campos', 'Rangel'][i % 5]}${i >= 10 ? ` ${['Ibáñez', 'Quiroga'][i % 2]}` : ''}`,
    email: `profe${i}@colibri.mx`, phone: '55 0000 0000', status: i % 8 === 7 ? 'invited' : 'active', futureSessions: i, emergency: i % 4 ? [{name: 'Contacto', relation: 'partner', phone: '55 1111 1111'}] : [],
});

/** A teacher as shown in lists, cards and sentences: first name and first surname (their own card keeps the full name). */
export const teacherName = (id: string) => {
    const full = TEACHERS.find(teacher => teacher.id === id)?.name ?? id;
    const words = full.trim().split(/\s+/).filter(word => !['de', 'del', 'la', 'las', 'los', 'y'].includes(word.toLowerCase()));
    return words.length < 3 ? full : `${words[0]} ${words[words.length - 2]}`;
};

export interface Slot {
    weekday: number; // 1 Monday ... 7 Sunday
    start: string;
    end: string;
    room: string;
}

export interface SchoolClass {
    id: string;
    /** Colibrí when not given. */
    school?: SchoolId;
    /** Students can't enroll once it's full. */
    max?: number;
    forKids?: boolean;
    name: string;
    teacher: string;
    kind: 'weekly' | 'free';
    slots: Slot[];
    from: string;
    until: string;
    students: number;
    inPackages: boolean;
    monthly?: { sessions: number; price: number };
    perVisit?: boolean;
    /** Ended by the director on its `until` date: no new enrollments. */
    ending?: boolean;
}

export const CLASSES: SchoolClass[] = [
    {
        id: 'figura', max: 12,
        name: 'Telas aéreas intermedio',
        teacher: 'mariana',
        kind: 'weekly',
        from: '2026-09-01',
        until: '2026-12-19',
        slots: [{weekday: 2, start: '10:00', end: '12:00', room: 's1'}, {
            weekday: 4,
            start: '10:00',
            end: '12:00',
            room: 's1'
        }],
        students: 10,
        inPackages: true,
    },
    {
        id: 'acuarela', max: 14, name: 'Aro aéreo', teacher: 'lucia', kind: 'weekly', from: '2026-09-01', until: '2026-12-19',
        slots: [{weekday: 1, start: '17:00', end: '19:00', room: 's2'}, {
            weekday: 3,
            start: '17:00',
            end: '19:00',
            room: 's2'
        }],
        students: 12, inPackages: true, monthly: {sessions: 4, price: 1400},
    },
    {
        id: 'oleo', max: 18, name: 'Trapecio', teacher: 'ana', kind: 'weekly', from: '2026-09-05', until: '2026-12-19',
        slots: [{weekday: 6, start: '10:00', end: '13:00', room: 's1'}], students: 16, inPackages: true, perVisit: true,
    },
    {
        id: 'retrato', max: 18,
        name: 'Pole dance',
        teacher: 'lucia',
        kind: 'weekly',
        from: '2026-09-05',
        until: '2026-12-19',
        slots: [{weekday: 6, start: '13:00', end: '15:00', room: 's1'}],
        students: 18,
        inPackages: false,
        monthly: {sessions: 4, price: 1400},
    },
    {
        id: 'ceramica', max: 10,
        name: 'Telas aéreas básico',
        teacher: 'diego',
        kind: 'weekly',
        from: '2026-09-03',
        until: '2026-12-17',
        slots: [{weekday: 4, start: '12:00', end: '14:00', room: 'cer'}],
        students: 8,
        inPackages: false,
        monthly: {sessions: 4, price: 1600},
    },
    {
        id: 'infantil', forKids: true, max: 14,
        name: 'Aéreo infantil',
        teacher: 'mariana',
        kind: 'weekly',
        from: '2026-09-03',
        until: '2026-12-17',
        slots: [{weekday: 4, start: '16:00', end: '17:30', room: 's2'}],
        students: 12,
        inPackages: false,
        monthly: {sessions: 4, price: 1200},
    },
    {
        id: 'escultura', max: 10,
        name: 'Acondicionamiento',
        teacher: 'diego',
        kind: 'weekly',
        from: '2026-09-01',
        until: '2026-12-15',
        slots: [{weekday: 2, start: '17:00', end: '19:00', room: 'cer'}],
        students: 7,
        inPackages: false,
        monthly: {sessions: 4, price: 1500},
    },
    {
        id: 'botanica', max: 8,
        name: 'Telas aéreas: secuencias, caídas y transiciones al aro (nivel intermedio)',
        teacher: 'fernanda',
        kind: 'weekly',
        from: '2026-10-02',
        until: '2026-12-18',
        slots: [{weekday: 5, start: '10:00', end: '13:00', room: 'patio'}],
        students: 6,
        inPackages: false,
        monthly: {sessions: 4, price: 1700},
    },
    {
        id: 'grabado', forKids: true, max: 16,
        name: 'Aéreo juvenil',
        teacher: 'fernanda',
        kind: 'weekly',
        from: '2026-12-05',
        until: '2027-03-27',
        slots: [{weekday: 6, start: '16:00', end: '18:00', room: 's1'}],
        students: 14,
        inPackages: false,
        monthly: {sessions: 4, price: 1200},
    },
    {
        // Thursdays 17:00, while Aéreo infantil (16:00–17:30) is on: Mateo and Valentina can't take both.
        id: 'pintura', forKids: true, max: 12, name: 'Acrobacia de piso para niños', teacher: 'lucia', kind: 'weekly',
        from: '2026-09-03', until: '2026-12-17', slots: [{weekday: 4, start: '17:00', end: '18:30', room: 's2'}],
        students: 6, inPackages: false, monthly: {sessions: 4, price: 1100}, perVisit: true,
    },
    {
        id: 'libre', max: 4,
        name: 'Práctica libre en aparatos',
        teacher: 'fernanda',
        kind: 'free',
        from: '2026-11-27',
        until: '2026-11-27',
        slots: [],
        students: 3,
        inPackages: false,
    },
    {
        id: 'amb-ceramica', school: 'ambar', name: 'Hamaca aérea', teacher: 'tomas', kind: 'weekly', from: '2026-09-02', until: '2026-12-16',
        slots: [{weekday: 3, start: '18:00', end: '20:00', room: 'tb'}], students: 10, max: 10, inPackages: false, monthly: {sessions: 4, price: 1400},
    },
    {
        id: 'amb-bocetaje', school: 'ambar', name: 'Flexibilidad', teacher: 'mariana', kind: 'weekly', from: '2026-09-05', until: '2026-12-19',
        slots: [{weekday: 6, start: '09:00', end: '11:00', room: 'ta'}], students: 7, max: 12, inPackages: false, monthly: {sessions: 4, price: 1100}, perVisit: true,
    },
    ...HELIOS_CLASSES,
];

if (STRESS) {
    CLASSES.push({
        id: 'larga', max: 20, name: 'Taller intensivo de telas aéreas: caídas, envolturas y coreografía para presentación (nivel avanzado)', teacher: 'larga',
        kind: 'weekly', from: '2026-09-01', until: '2026-12-19', slots: [{weekday: 3, start: '10:00', end: '13:00', room: 's1'}],
        students: 18, inPackages: false, monthly: {sessions: 4, price: 1800}, perVisit: true,
    });
    // One class in each stress school, given by Mariana, so her school switch has something in each.
    STRESS_IDS.forEach((school, index) => CLASSES.push({
        id: `cl-${school}`, school, max: 12, name: index === 0 ? 'Composición coreográfica y presencia escénica para números aéreos' : `Aéreo ${SCHOOLS[school]?.short ?? school}`,
        teacher: 'mariana', kind: 'weekly', from: '2026-09-01', until: '2026-12-19',
        slots: [{weekday: (index % 5) + 1, start: '19:00', end: '21:00', room: 's1'}], students: 8, inPackages: false, monthly: {sessions: 4, price: 1000 + index * 100},
    }));
}

if (STRESS) {
    // A class for kids in three stress schools (Mateo takes all three, Valentina two): the guardian's school filter has something to filter.
    STRESS_IDS.slice(0, 3).forEach((school, index) => {
        CLASSES.push({
            id: `ck-${school}`, school, forKids: true, max: 10, name: `Aéreo infantil ${SCHOOLS[school]?.short ?? school}`, teacher: 'mariana', kind: 'weekly',
            from: '2026-09-01', until: '2026-12-19', slots: [{weekday: index + 2, start: '16:00', end: '17:30', room: 's1'}], students: 6, inPackages: false,
            monthly: {sessions: 4, price: 1100},
        });
    });
}

if (STRESS) {
    // Thirty more classes at Colibrí, across the week, with the stress teachers and rooms.
    const subjects = ['Telas', 'Aro', 'Trapecio', 'Pole', 'Hamaca', 'Cuerda', 'Flexibilidad', 'Acondicionamiento', 'Acrobacia', 'Coreografía'];
    for (let i = 0; i < 30; i++) CLASSES.push({
        id: `sx${i}`, max: 10 + (i % 6), name: `${subjects[i % 10]} ${['inicial', 'intermedio', 'avanzado'][i % 3]}`, teacher: `t${i}`, kind: 'weekly',
        from: '2026-09-01', until: '2026-12-19', slots: [{weekday: (i % 6) + 1, start: `${String(8 + (i % 12)).padStart(2, '0')}:00`, end: `${String(10 + (i % 12)).padStart(2, '0')}:00`, room: `r${(i % 30) + 1}`}],
        students: 4 + (i % 8), inPackages: i % 3 === 0, monthly: {sessions: 4, price: 1000 + (i % 5) * 100}, perVisit: i % 2 === 0,
    });
    // Eleven classes Mariana gives on Thursdays (today), one an hour from 7:00.
    for (let i = 0; i < 11; i++) CLASSES.push({
        id: `mx${i}`, max: 8, name: i === 4 ? 'Telas aéreas: subidas, llaves y descensos controlados (sesión larga)' : `Calentamiento ${i + 1}`, teacher: 'mariana', kind: 'weekly',
        from: '2026-09-01', until: '2026-12-19', slots: [{weekday: 4, start: `${String(7 + i).padStart(2, '0')}:30`, end: `${String(8 + i).padStart(2, '0')}:20`, room: `r${i + 1}`}],
        students: 3 + (i % 5), inPackages: false, monthly: {sessions: 4, price: 900}, perVisit: true,
    });
}

export const schoolOfClass = (item: SchoolClass): SchoolId => item.school ?? 'colibri';
export const teacherSchools = (teacher: Teacher): SchoolId[] => teacher.schools ?? ['colibri'];

export const classById = (id: string) => CLASSES.find(item => item.id === id) ?? CLASSES[0];
export const roomName = (id: string) => ROOMS.find(room => room.id === id)?.name ?? id;

export interface Session {
    id: string;
    classId: string;
    date: string;
    start: string;
    end: string;
    room: string;
    status: 'scheduled' | 'cancelled';
    substitute?: string;
    /** The class's teacher when this session was given, once the class has changed teacher since. */
    teacher?: string;
    replacementId?: string;
    replaces?: string;
    expected?: number;
    checkedIn?: number;
}

/** The last day the sample sessions reach: the calendars show November and December. */
export const LAST_SAMPLE_DAY = '2026-12-31';

/** November's and December's sessions (Helios: from 26 Sep, for its history): each weekly slot on its weekdays, then today's exceptions. */
function buildSessions(): Session[] {
    const sessions: Session[] = [];
    for (let day = new Date(2026, 8, 26); day <= new Date(2026, 11, 31); day.setDate(day.getDate() + 1)) {
        const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const weekday = ((day.getDay() + 6) % 7) + 1;
        for (const item of CLASSES) {
            if (date < item.from || date > item.until || (date < '2026-11-01' && item.school !== 'helios')) continue;
            for (const slot of item.slots) {
                if (slot.weekday !== weekday) continue;
                sessions.push({
                    id: `${item.id}-${date}-${slot.start}`, classId: item.id, date, start: slot.start, end: slot.end,
                    room: slot.room, status: 'scheduled', expected: item.students,
                });
            }
        }
    }
    const find = (id: string) => sessions.find(session => session.id === id);
    const today = find('figura-2026-11-26-10:00');
    if (today) today.checkedIn = 7;
    const ceramic = find('ceramica-2026-11-26-12:00');
    if (ceramic) ceramic.substitute = 'rodrigo';
    const figureTue = find('figura-2026-12-01-10:00');
    if (figureTue) figureTue.substitute = 'lucia';
    const oil = find('oleo-2026-11-28-10:00');
    if (oil) {
        oil.status = 'cancelled';
        oil.replacementId = 'oleo-2026-12-02-10:00';
    }
    sessions.push({
        id: 'oleo-2026-12-02-10:00', classId: 'oleo', date: '2026-12-02', start: '10:00', end: '13:00', room: 's1',
        status: 'scheduled', replaces: 'oleo-2026-11-28-10:00', expected: 16, checkedIn: 9,
    });
    sessions.push({
        id: 'libre-2026-11-27-18:00', classId: 'libre', date: '2026-11-27', start: '18:00', end: '20:00', room: 's1',
        status: 'scheduled', expected: 3,
    });
    HELIOS_NOTICES.push(...heliosExceptions(sessions));
    return sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

const HELIOS_NOTICES: Notice[] = [];

export const SESSIONS = buildSessions();
export const sessionById = (id: string) => SESSIONS.find(session => session.id === id) ?? SESSIONS[0];
export const schoolOfSession = (session: Session): SchoolId => schoolOfClass(classById(session.classId));
export const sessionsOn = (date: string, school: SchoolId = currentSchool()) =>
    SESSIONS.filter(session => session.date === date && schoolOfSession(session) === school);

// ---- Students ----

export type PlanKind = 'package3' | 'package2' | 'package' | 'monthly' | 'totalpass' | 'wellhub' | 'cash';

export interface Student {
    id: string;
    /** Colibrí when not given. */
    school?: SchoolId;
    name: string;
    age: number;
    minor?: boolean;
    guardian?: string;
    plan: PlanKind;
    /** plan 'package': which of the school's packages. */
    packageId?: string;
    /** Wellhub or TotalPass, plus the complementary classes paid monthly. */
    passExtra?: boolean;
    /** When they joined the school. */
    since?: string;
    /** The last day they came, once they left. */
    left?: string;
    planLabel: string;
    paymentDay: 15 | 30;
    termsPending?: boolean;
    overPlan?: string;
    feeOwed?: boolean;
    turns18?: string;
    /** An enrollment the director hasn't looked at yet: the class and when the student enrolled. */
    newEnrollment?: { what: string; when: string };
    status: 'active' | 'invited' | 'inactive';
    health?: string;
    emergency: { name: string; relation: string; phone: string }[];
    pickup?: string[];
}

export const STUDENTS: Student[] = [
    {
        id: 'sofia',
        name: 'Sofía Ramírez Castro',
        age: 27,
        plan: 'package3',
        planLabel: '',
        paymentDay: 15,
        status: 'active',
        health: 'Asma leve; trae inhalador en su mochila.',
        emergency: [{name: 'Laura Castro', relation: 'mother', phone: '55 1234 5678'}, {
            name: 'Javier Ramírez',
            relation: 'brother',
            phone: '55 8765 4321'
        }],
    },
    {
        id: 'mateo',
        name: 'Mateo López Vega',
        age: 9,
        minor: true,
        guardian: 'Daniela Vega',
        plan: 'monthly',
        planLabel: 'Aéreo infantil',
        paymentDay: 30,
        status: 'active',
        health: 'Alergia al cacahuate; la maestra tiene su autoinyector.',
        emergency: [{name: 'Daniela Vega', relation: 'mother', phone: '55 2222 3333'}, {
            name: 'Roberto López',
            relation: 'father',
            phone: '55 4444 5555'
        }],
        pickup: ['Daniela Vega', 'Roberto López', 'Carmen Vega'],
    },
    {
        id: 'valentina',
        name: 'Valentina López Vega',
        age: 12,
        minor: true,
        guardian: 'Daniela Vega',
        plan: 'monthly',
        planLabel: 'Aéreo infantil',
        paymentDay: 30,
        status: 'active',
        emergency: [{name: 'Daniela Vega', relation: 'mother', phone: '55 2222 3333'}],
        pickup: ['Daniela Vega', 'Roberto López'],
    },
    {
        id: 'emilio',
        name: 'Emilio Sánchez',
        age: 17,
        minor: true,
        guardian: 'Patricia Sánchez',
        plan: 'package2',
        planLabel: '',
        paymentDay: 15,
        status: 'active',
        turns18: '2026-11-29',
        health: 'Se lesionó el hombro izquierdo hace un año; no debe colgarse solo de ese brazo ni hacer caídas de hombro. Le cuesta decirlo frente al grupo, así que conviene preguntarle en voz baja antes de una secuencia nueva.',
        emergency: [{name: 'Patricia Sánchez', relation: 'mother', phone: '55 6666 7777'}],
        pickup: ['Patricia Sánchez'],
    },
    {
        id: 'andres',
        name: 'Andrés Molina',
        age: 34,
        plan: 'totalpass',
        planLabel: '',
        paymentDay: 30,
        status: 'active',
        termsPending: true,
        emergency: [{name: 'Rocío Molina', relation: 'wife', phone: '55 1111 0000'}],
    },
    {
        id: 'regina',
        name: 'Regina Flores',
        age: 45,
        plan: 'monthly',
        planLabel: 'Telas aéreas básico',
        paymentDay: 30,
        status: 'active',
        overPlan: '5 / 4',
        emergency: [{name: 'Luis Flores', relation: 'husband', phone: '55 9999 8888'}],
    },
    {
        id: 'hector',
        name: 'Héctor Navarro',
        newEnrollment: {what: 'Telas aéreas básico', when: '2026-11-24'},
        age: 52,
        plan: 'monthly',
        planLabel: 'Telas aéreas básico',
        paymentDay: 15,
        status: 'active',
        feeOwed: true,
        emergency: [],
    },
    {
        id: 'camila',
        name: 'Camila Ortiz',
        newEnrollment: {what: 'Aro aéreo', when: '2026-11-25'},
        age: 19,
        plan: 'monthly',
        planLabel: 'Aro aéreo',
        paymentDay: 30,
        status: 'active',
        emergency: [{name: 'Teresa Ortiz', relation: 'mother', phone: '55 7777 6666'}],
    },
    {
        id: 'paula',
        name: 'Paula Domínguez',
        age: 31,
        plan: 'package3',
        planLabel: '',
        paymentDay: 15,
        status: 'active',
        emergency: [],
    },
    {
        id: 'jimena',
        name: 'Jimena Ríos',
        age: 24,
        plan: 'package3',
        planLabel: '',
        paymentDay: 30,
        status: 'active',
        emergency: [],
    },
    {
        id: 'tomas',
        name: 'Tomás Gil',
        age: 29,
        plan: 'package2',
        planLabel: '',
        paymentDay: 15,
        status: 'active',
        emergency: [],
    },
    {
        id: 'maria',
        name: 'María Fernanda de los Ángeles Villaseñor Castañeda',
        age: 38,
        plan: 'cash',
        planLabel: '',
        paymentDay: 30,
        status: 'active',
        emergency: [{name: 'José Antonio Villaseñor Castañeda', relation: 'brother', phone: '55 3210 9876'}],
        health: 'Hernia de disco lumbar (L4-L5). Nada de invertidos ni caídas con impacto en la espalda; necesita pausas para estirarse y colchoneta doble debajo del aparato. No debe cargar ni montar aparatos.',
    },
    {
        id: 'lucas',
        name: 'Lucas Medina Paz',
        age: 10,
        minor: true,
        guardian: 'Rosa Paz',
        plan: 'monthly',
        planLabel: 'Aéreo infantil',
        paymentDay: 30,
        status: 'invited',
        emergency: [],
    },
    {
        id: 'lorena',
        name: 'Lorena Vázquez',
        age: 41,
        plan: 'totalpass',
        planLabel: '',
        paymentDay: 30,
        status: 'active',
        termsPending: true,
        emergency: [],
    },
    {
        id: 'julia',
        name: 'Julia Paredes',
        age: 33,
        plan: 'monthly',
        planLabel: 'Acondicionamiento',
        paymentDay: 15,
        status: 'inactive',
        emergency: [],
    },
];

/** Daniela's children: two, or seven with stress data. */
export const GUARDIAN_KIDS: { id: string; name: string }[] = [{id: 'mateo', name: 'Mateo López Vega'}, {id: 'valentina', name: 'Valentina López Vega'}];

if (STRESS) {
    const kids = ['Santiago', 'Regina Isabel', 'María Guadalupe de la Santísima Trinidad', 'Leonardo', 'Ximena'];
    kids.forEach((first, index) => {
        const id = `kid${index + 3}`;
        GUARDIAN_KIDS.push({id, name: `${first} López Vega`});
        STUDENTS.push({
            id, name: `${first} López Vega`, age: 5 + index * 2, minor: true, guardian: 'Daniela Vega', plan: 'monthly',
            planLabel: 'Aéreo infantil', paymentDay: 30, status: 'active', emergency: [{name: 'Daniela Vega', relation: 'mother', phone: '55 2222 3333'}],
            health: index === 2 ? 'Alergia severa a frutos secos, mariscos y al látex; usa autoinyector de epinefrina que lleva en la mochila, en el bolsillo de enfrente. Si presenta ronchas o dificultad para respirar, aplicarlo de inmediato en el muslo y llamar al 911 y a su mamá.' : undefined,
        });
    });
    // Fifty more students, some with long names and long health notes.
    const firsts = ['Ana', 'Luis', 'Carmen', 'Jorge', 'Elena', 'Pablo', 'Rosa', 'Iván', 'Lucía', 'Diego'];
    const lasts = ['García', 'Martínez', 'Hernández', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores'];
    for (let i = 0; i < 50; i++) {
        const long = i % 17 === 3;
        STUDENTS.push({
            id: `st${i}`,
            name: long ? `${firsts[i % 10]} Fernanda Alejandra de los Remedios ${lasts[(i + 3) % 10]} y ${lasts[(i + 7) % 10]} Castañeda` : `${firsts[i % 10]} ${lasts[(i * 3 + Math.floor(i / 10)) % 10]} ${lasts[(i + 5 + Math.floor(i / 10) * 2) % 10]}`,
            age: 18 + (i % 40), plan: i % 4 === 0 ? 'package3' : i % 4 === 1 ? 'totalpass' : i % 4 === 2 ? 'cash' : 'package2',
            planLabel: i % 4 === 0 ? 'Paquete 3/sem' : i % 4 === 1 ? 'TotalPass' : i % 4 === 2 ? 'Por visita · efectivo' : 'Paquete 2/sem',
            paymentDay: i % 2 ? 15 : 30, status: i % 9 === 8 ? 'invited' : 'active', termsPending: i % 7 === 0, overPlan: i % 11 === 5 ? '5 / 4' : undefined,
            feeOwed: i % 13 === 4, emergency: [{name: `${firsts[(i + 2) % 10]} ${lasts[i % 10]}`, relation: 'mother', phone: '55 0000 0000'}],
            health: i % 6 === 0 ? 'Usa lentes de contacto; en invertidos se le pueden mover y necesita parar a acomodarlos. Tiene rinitis alérgica estacional y a veces necesita salir a tomar aire durante la clase.' : undefined,
        });
    }
}

export const studentById = (id: string) => (LIVE.on ? LIVE_STUDENTS : [...STUDENTS, ...AMBAR_STUDENTS, ...HELIOS_STUDENTS]).find(student => student.id === id) ?? (LIVE.on ? LIVE_STUDENTS[0] : STUDENTS[0]);

/** A school's students; the sample's unmarked ones are Colibrí's. */
export const studentsOf = (school: SchoolId): Student[] => LIVE.on ? LIVE_STUDENTS.filter(student => student.school === school)
    : school === 'helios' ? HELIOS_STUDENTS : school === 'ambar' ? AMBAR_STUDENTS : STUDENTS;
export const studentsHere = () => studentsOf(currentSchool());

/** Who's expected at today's Telas intermedio, and who has checked in (at 10:15). */
export const TODAY_ROSTER: { student: string; at?: string; by?: 'guardian' }[] = [
    {student: 'andres'}, {student: 'tomas'}, {student: 'jimena'},
    {student: 'emilio', at: '9:56', by: 'guardian'}, {student: 'paula', at: '9:58'}, {student: 'sofia', at: '10:02'},
    {student: 'maria', at: '10:04'}, {student: 'regina', at: '10:05'}, {
        student: 'camila',
        at: '10:07'
    }, {student: 'hector', at: '10:11'},
];

// ---- Payments ----

export type ProofState = 'uploaded' | 'confirmed' | 'rejected';

export interface Proof {
    id: string;
    student: string;
    school: SchoolId;
    covers: string;
    method: 'cash' | 'transfer' | 'card' | 'totalpass' | 'wellhub';
    amount: number;
    sent: string;
    sentAt: string;
    state: ProofState;
    reason?: string;
}

/** Wellhub and TotalPass check-ins: their screenshots aren't for the director to check. */
export const isPass = (method: Proof['method']) => method === 'totalpass' || method === 'wellhub';

export const PROOFS: Proof[] = [
    {
        id: 'p1', sentAt: '19:42',
        student: 'mateo',
        school: 'colibri',
        covers: 'Aéreo infantil · 2026-11',
        method: 'cash',
        amount: 1200,
        sent: '2026-11-25',
        state: 'uploaded'
    },
    {
        id: 'p2', sentAt: '19:44',
        student: 'valentina',
        school: 'colibri',
        covers: 'Aéreo infantil · 2026-11',
        method: 'cash',
        amount: 1200,
        sent: '2026-11-25',
        state: 'uploaded'
    },
    {
        id: 'p3', sentAt: '08:15',
        student: 'regina',
        school: 'colibri',
        covers: 'Telas aéreas básico · 2026-11',
        method: 'card',
        amount: 1600,
        sent: '2026-11-24',
        state: 'uploaded'
    },
    {
        id: 'p4', sentAt: '13:02',
        student: 'sofia',
        school: 'colibri',
        covers: 'pk3 · 2026-11',
        method: 'transfer',
        amount: 2400,
        sent: '2026-11-13',
        state: 'confirmed'
    },
    {
        id: 'p5', sentAt: '21:30',
        student: 'sofia',
        school: 'ambar',
        covers: 'Hamaca aérea · 2026-10',
        method: 'card',
        amount: 1400,
        sent: '2026-10-29',
        state: 'confirmed'
    },
    {
        id: 'p6', sentAt: '21:12',
        student: 'sofia',
        school: 'ambar',
        covers: 'Hamaca aérea · 2026-10',
        method: 'card',
        amount: 1400,
        sent: '2026-10-28',
        state: 'rejected',
        reason: 'La imagen está borrosa, sube otra por favor.'
    },
    {
        id: 'p7', sentAt: '11:47',
        student: 'camila',
        school: 'colibri',
        covers: 'Aro aéreo · 2026-11',
        method: 'transfer',
        amount: 1400,
        sent: '2026-11-22',
        state: 'rejected',
        reason: 'La imagen está borrosa, sube otra por favor.'
    },
    {
        id: 'p8', sentAt: '10:03',
        student: 'andres',
        school: 'colibri',
        covers: 'Telas aéreas intermedio · 2026-11-26',
        method: 'totalpass',
        amount: 0,
        sent: '2026-11-26',
        state: 'uploaded'
    },
];

// ---- Notices board ----

export interface Notice {
    id: string;
    school: SchoolId;
    date: string;
    /** A schedule change the database posted, a price change (important), or a note someone wrote. */
    kind: 'substitute' | 'cancelled' | 'schedule' | 'ended' | 'teacher' | 'price' | 'note';
    /** The class it's about, by id: two classes can share a name. */
    classId?: string;
    title: string;
    /** The session a schedule change is about, written after the title in the reader's language. */
    at?: string;
    /** A price change: its title is the price's name, in the reader's language. */
    priceId?: string;
    /** Kept on the board past its usual time, by a director. */
    keep?: boolean;
    text?: TextKey;
    vars?: Record<string, string>;
    body?: string;
    author?: string;
    unread?: boolean;
}

export const BOARD: Notice[] = [
    {
        id: 'n7',
        school: 'colibri',
        date: '2026-11-25',
        kind: 'note',
        title: 'Vacaciones de invierno',
        keep: true,
        author: 'Ana Torres',
        body: 'El taller cierra del 21 de diciembre al 6 de enero. Las clases vuelven el miércoles 7 de enero.',
    },
    {
        id: 'n0',
        school: 'colibri',
        date: '2026-11-26',
        kind: 'price',
        title: 'Paquete 3 clases por semana',
        priceId: 'pk3',
        unread: true,
        text: 'notice.price',
        vars: {from: '$2,400', to: '$2,600', when: '2027-01-01'},
    },
    {
        id: 'n1',
        school: 'colibri',
        date: '2026-11-26',
        kind: 'substitute',
        classId: 'ceramica',
        title: 'Telas aéreas básico · 12:00',
        text: 'notice.substitute',
        vars: {name: 'Rodrigo Salas'},
        unread: true
    },
    {
        id: 'n5',
        school: 'colibri',
        date: '2026-11-25',
        kind: 'note',
        classId: 'figura',
        title: 'Telas aéreas intermedio',
        author: 'Mariana Ruiz',
        body: 'Para el jueves traigan ropa ajustada de manga larga (la tela quema) y nada de anillos ni aretes. Vamos a trabajar caídas toda la clase, así que lleguen 10 minutos antes para calentar muñecas y hombros.',
    },
    {
        id: 'n2',
        school: 'colibri',
        date: '2026-11-24',
        kind: 'cancelled',
        classId: 'oleo',
        title: 'Trapecio',
        at: '2026-11-28 10:00',
        text: 'notice.cancelled',
        vars: {when: '2026-12-02 10:00'}
    },
    {
        id: 'n3',
        school: 'colibri',
        date: '2026-11-20',
        kind: 'teacher',
        classId: 'acuarela',
        title: 'Aro aéreo',
        text: 'notice.newTeacher',
        vars: {name: 'Mariana Ruiz', when: '2026-12-07'}
    },
    {
        id: 'n6',
        school: 'colibri',
        date: '2026-11-19',
        kind: 'note',
        classId: 'infantil',
        title: 'Aéreo infantil',
        author: 'Mariana Ruiz',
        body: 'Para la próxima clase traigan leggins y calcetas antiderrapantes: vamos a practicar en el aro bajo.'
    },
    {
        id: 'n4',
        school: 'ambar',
        date: '2026-11-19',
        kind: 'note',
        classId: 'amb-ceramica',
        title: 'Hamaca aérea',
        author: 'Tomás Rivas',
        body: 'El horno se enciende el viernes; dejen sus piezas secas en la repisa de abajo antes del jueves.'
    },
];

export interface Personal {
    id: string;
    text: TextKey;
    vars?: Record<string, string>;
    date: string;
    unread?: boolean;
    school: SchoolId;
}

export const PERSONAL: Record<'s' | 'g' | 't' | 'd', Personal[]> = {
    s: [
        {
            id: 'ps1',
            text: 'personal.due',
            vars: {what: 'Hamaca aérea', school: 'Ámbar Danza Aérea', when: '2026-11-30'},
            date: '2026-11-25',
            unread: true,
            school: 'ambar'
        },
        {id: 'ps2', text: 'personal.confirmed', vars: {month: '2026-11'}, date: '2026-11-14', school: 'colibri'},
    ],
    g: [
        {
            id: 'pg1',
            text: 'personal.cashSaved',
            vars: {name: 'Mateo'},
            date: '2026-11-26',
            unread: true,
            school: 'colibri'
        },
        {
            id: 'pg2',
            text: 'personal.due',
            vars: {what: 'Aéreo infantil', school: 'Colibrí', when: '2026-11-30'},
            date: '2026-11-25',
            school: 'colibri'
        },
    ],
    t: [
        {
            id: 'pt1',
            text: 'personal.overPlan',
            vars: {name: 'Regina Flores', count: '5 / 4'},
            date: '2026-11-24',
            unread: true,
            school: 'colibri'
        },
        {
            id: 'pt2',
            text: 'personal.youSubstitute',
            vars: {name: 'Lucía Ortega', when: '2026-12-01'},
            date: '2026-11-23',
            school: 'colibri'
        },
    ],
    d: [
        {
            id: 'pd1',
            text: 'personal.cardChanged',
            vars: {name: 'Sofía Ramírez'},
            date: '2026-11-24',
            unread: true,
            school: 'colibri'
        },
        {
            id: 'pd2',
            text: 'personal.turns18',
            vars: {name: 'Emilio Sánchez', when: '2026-11-29'},
            date: '2026-11-22',
            unread: true,
            school: 'colibri'
        },
    ],
};

/** Whose classes the board is read for: Sofía's own, each of Daniela's children's, or Mariana's (she teaches). */
export const BOARD_READERS: Record<string, string[]> = {s: ['sofia'], g: GUARDIAN_KIDS.map(kid => kid.id)};

/**
 * The posts a person sees on a school's board: the ones for the whole school (a director's note, a
 * price change) and the ones for their classes (a guardian: their children's; a teacher: the ones
 * they give). Directors see every post of their school.
 */
const plusDays = (iso: string, days: number) => {
    const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
};

/**
 * Whether a post is still on the board: a schedule change until the day after its session (or the
 * day it was posted, without one), a teacher change a week after it applies, a price change 30 days
 * after it applies, a note 30 days after it's posted. A director can keep one longer (`keep`).
 */
export function isLive(notice: Notice): boolean {
    if (notice.keep) return true;
    const iso = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);
    const until = notice.kind === 'note' ? plusDays(notice.date, 30)
        : notice.kind === 'price' ? plusDays(iso(notice.vars?.when) ?? notice.date, 30)
            : notice.kind === 'teacher' ? plusDays(iso(notice.vars?.when) ?? notice.date, 7)
                : plusDays(iso(notice.at) ?? notice.date, 1);
    return TODAY <= until;
}

export function boardFor(role: string, school: SchoolId): Notice[] {
    return BOARD.filter(notice => notice.school === school && isLive(notice) && (!notice.classId || role === 'd'
        || (role === 't' ? [classById(notice.classId).teacher, ...SESSIONS.filter(s => s.classId === notice.classId).map(s => s.substitute)].includes(STAFF_ME.t)
            // A class that's becoming theirs is theirs to read about too.
            || (notice.kind === 'teacher' && notice.vars?.name === TEACHERS.find(teacher => teacher.id === STAFF_ME.t)?.name)
            : (BOARD_READERS[role] ?? []).some(id => classesOf(id).includes(notice.classId ?? '')))))
        .sort((a, b) => b.date.localeCompare(a.date));
}

export function unreadNotices(role: string): number {
    if (role === 'a') return 0;
    // Staff read the personal notices of the school they're working in.
    const personal = (PERSONAL[role as keyof typeof PERSONAL] ?? []).filter(item => role === 's' || role === 'g' || item.school === currentSchool());
    const schools: SchoolId[] = role === 's' ? SOFIA_SCHOOLS : role === 'g' ? ['colibri'] : [currentSchool()];
    const board = schools.flatMap(school => boardFor(role, school)).filter(notice => notice.unread);
    return personal.filter(item => item.unread).length + board.length;
}

// ---- Prices ----

export interface Price {
    id: string;
    /** Colibrí when not given. */
    school?: SchoolId;
    kind: 'fee' | 'monthly' | 'package' | 'visit' | 'free' | 'trial';
    label: string;
    amount: number;
    from: string;
    history: { amount: number; from: string }[];
    /** A new price saved from a later date: the current one stays until then. */
    next?: { amount: number; from: string };
    extra?: string;
}

export const PRICES: Price[] = [
    {
        id: 'fee',
        kind: 'fee',
        label: 'Inscripción',
        amount: 800,
        from: '2026-01-01',
        history: [{amount: 700, from: '2025-01-01'}],
        extra: '3'
    },
    {
        id: 'pk3',
        kind: 'package',
        label: 'Paquete 3 clases por semana',
        amount: 2400,
        from: '2026-08-01',
        history: [{amount: 2200, from: '2025-08-01'}]
    },
    {id: 'pk2', kind: 'package', label: 'Paquete 2 clases por semana', amount: 1800, from: '2026-08-01', history: []},
    {id: 'm-acuarela', kind: 'monthly', label: 'Aro aéreo', amount: 1400, from: '2026-08-01', history: []},
    {id: 'm-retrato', kind: 'monthly', label: 'Pole dance', amount: 1400, from: '2026-08-01', history: []},
    {
        id: 'm-ceramica',
        kind: 'monthly',
        label: 'Telas aéreas básico',
        amount: 1600,
        from: '2026-08-01',
        history: [{amount: 1500, from: '2025-08-01'}]
    },
    {id: 'm-infantil', kind: 'monthly', label: 'Aéreo infantil', amount: 1200, from: '2026-08-01', history: []},
    {
        id: 'visit',
        kind: 'visit',
        label: 'Efectivo',
        amount: 250,
        from: '2026-01-01',
        history: [{amount: 220, from: '2025-01-01'}]
    },
    {id: 'trial', kind: 'trial', label: 'Clase de prueba', amount: 200, from: '2026-11-01', history: []},
    {id: 'free1', kind: 'free', label: '1', amount: 450, from: '2026-10-01', history: []},
    {id: 'free2', kind: 'free', label: '2–3', amount: 350, from: '2026-10-01', history: []},
    {id: 'free4', kind: 'free', label: '4', amount: 300, from: '2026-10-01', history: []},
    ...HELIOS_PRICES,
];

export const pricesOf = (school: SchoolId) => PRICES.filter(price => (price.school ?? 'colibri') === school);
export const pricesHere = () => pricesOf(currentSchool());

/** Teacher's attendance count this month, per class: students only, guest teachers apart. */
export const TEACHER_MONTH = [
    {classId: 'amb-bocetaje', sessions: 4, students: 26, guests: 0},
    {classId: 'figura', sessions: 8, students: 71, guests: 2},
    {classId: 'infantil', sessions: 4, students: 43, guests: 0},
    {classId: 'oleo', sessions: 3, students: 38, guests: 1},
];

/** Screenshots the director has checked in this visit (the prototype keeps it in memory only). */
export const REVIEWED = new Set<string>();

// ---- What students are enrolled in (they enroll themselves) ----

export interface Enrollment {
    id: string;
    student: string;
    classId?: string;
    packageId?: string;
    how: 'monthly' | 'visit' | 'package';
    from: string;
}

export const ENROLLMENTS: Enrollment[] = [
    {id: 'e1', student: 'sofia', packageId: 'pk3', how: 'package', from: '2026-09-01'},
    {id: 'e2', student: 'sofia', classId: 'amb-ceramica', how: 'monthly', from: '2026-09-02'},
    {id: 'e3', student: 'mateo', classId: 'infantil', how: 'monthly', from: '2026-09-03'},
    {id: 'e4', student: 'valentina', classId: 'infantil', how: 'monthly', from: '2026-09-03'},
];

/** The classes a student takes: their enrollments, and every class their package covers. */
/** The schools Sofía studies at: two, or seven with stress data. */
export const SOFIA_SCHOOLS: SchoolId[] = STRESS ? ['colibri', 'ambar', ...STRESS_IDS] : ['colibri', 'ambar'];

if (STRESS) {
    GUARDIAN_KIDS.slice(2).forEach((kid, index) => ENROLLMENTS.push({id: `ek${index}`, student: kid.id, classId: 'infantil', how: 'monthly', from: '2026-09-03'}));
    STRESS_IDS.slice(0, 3).forEach((school, index) => {
        ENROLLMENTS.push({id: `em-${school}`, student: 'mateo', classId: `ck-${school}`, how: 'monthly', from: '2026-09-05'});
        if (index < 2) ENROLLMENTS.push({id: `ev-${school}`, student: 'valentina', classId: `ck-${school}`, how: 'monthly', from: '2026-09-05'});
    });
    ENROLLMENTS.push({id: 'es-larga', student: 'sofia', classId: 'larga', how: 'monthly', from: '2026-10-01'});
    STRESS_IDS.forEach((school, index) => ENROLLMENTS.push({id: `es-${school}`, student: 'sofia', classId: `cl-${school}`, how: 'monthly', from: '2026-09-0' + (index + 1)}));
    BOARD.unshift({
        id: 'n-larga', school: 'colibri', date: '2026-11-26', kind: 'note', classId: 'larga', unread: true,
        title: 'Taller intensivo de telas aéreas: caídas, envolturas y coreografía para presentación (nivel avanzado)',
        author: 'María de los Ángeles Guadalupe Hernández-Villaseñor de la Garza',
        body: 'Para la sesión del miércoles necesitamos: ropa ajustada de manga larga, leggins sin cierres, cabello recogido, nada de anillos, aretes ni relojes, una botella de agua y magnesia si la usan. Lleguen quince minutos antes para calentar, porque el ensayo de la coreografía empieza puntual y las secuencias largas no se interrumpen. Quien no pueda venir, avíseme por aquí con anticipación, por favor.',
    });
}

if (STRESS) {
    const kinds: Notice['kind'][] = ['substitute', 'cancelled', 'note', 'teacher', 'substitute', 'note'];
    for (let i = 0; i < 12; i++) BOARD.push({
        id: `nf${i}`, school: 'colibri', date: `2026-11-${String(25 - i).padStart(2, '0')}`, kind: kinds[i % 6], classId: 'figura',
        title: 'Telas aéreas intermedio', at: `2026-11-${String(25 - i).padStart(2, '0')} 10:00`, unread: i < 3,
        ...(kinds[i % 6] === 'note' ? {author: 'Mariana Ruiz', body: `Cambio ${i + 1}: traigan el material de la semana pasada; trabajaremos la misma pose.`}
            : kinds[i % 6] === 'teacher' ? {text: 'notice.newTeacher' as TextKey, vars: {name: 'Lucía Ortega', when: '2026-12-07'}}
                : kinds[i % 6] === 'cancelled' ? {text: 'notice.cancelled' as TextKey, vars: {when: '2026-12-02 10:00'}}
                    : {text: 'notice.substitute' as TextKey, vars: {name: 'Rodrigo Salas'}}),
    });
    SOFIA_SCHOOLS.forEach(school => {
        const mine = school === 'colibri' ? 'figura' : school === 'ambar' ? 'amb-ceramica' : `cl-${school}`;
        for (let i = 0; i < 10; i++) BOARD.push({
            id: `nb-${school}-${i}`, school, date: `2026-11-${String(24 - i * 2).padStart(2, '0')}`, kind: 'note', classId: i % 2 ? mine : undefined,
            title: i % 2 ? classById(mine).name : `Aviso ${i + 1} de ${SCHOOLS[school]?.short ?? school}`, author: i % 2 ? 'Mariana Ruiz' : 'La dirección',
            body: i % 3 === 0 ? 'Recuerden que el estacionamiento de enfrente estará cerrado por obras toda la semana; usen la entrada lateral por la calle de atrás y lleguen con tiempo.' : 'Traigan su material de la clase anterior.',
        });
    });
}

export function classesOf(student: string): string[] {
    return ENROLLMENTS.filter(enrollment => enrollment.student === student).flatMap(enrollment => enrollment.packageId
        ? PACKAGES.find(pack => pack.id === enrollment.packageId)?.classes ?? []
        : enrollment.classId ? [enrollment.classId] : []);
}

/** Students (besides the ones in STUDENTS) who haven't accepted Colibrí's latest terms yet. */
export const TERMS_WAITING = [
    'Adriana Solís', 'Bruno Castillo', 'Carla Méndez', 'Daniel Ortiz', 'Elena Rivas', 'Fabián Luna', 'Gabriela Ponce',
    'Hugo Salinas', 'Inés Herrera', 'Jorge Ibarra', 'Karla Montes', 'Luis Ávila', 'Marisol Vidal', 'Nicolás Prado', 'Olga Treviño',
];

export interface Package {
    id: string;
    /** Colibrí when not given. */
    school?: SchoolId;
    perWeek: number;
    classes: string[];
    price: number;
    /** No longer offered: the students who have it keep it until they leave it. */
    retired?: boolean;
}

export const PACKAGES: Package[] = [
    {id: 'pk3', perWeek: 3, classes: ['figura', 'acuarela', 'oleo'], price: 2400},
    {id: 'pk2', perWeek: 2, classes: ['figura', 'acuarela'], price: 1800},
    ...HELIOS_PACKAGES,
];

/** A package's name: Colibrí's in the reader's language, the others as the school wrote them. */
export const packageLabel = (id: string) => PRICES.find(price => price.id === id)?.label ?? id;

/** Trial classes already taken: one per student per class. */
export const TRIALS_TAKEN: Record<string, string[]> = {sofia: ['retrato']};

// ---- A guardian's people, shared by all their children at the school ----

export interface FamilyPerson {
    id: string;
    name: string;
    relation: string;
    /** Emergency contacts have a phone; people who only pick up may not. */
    phone?: string;
    emergency: boolean;
    pickup: boolean;
    /** Whether a photo was added: someone who picks the children up needs one. */
    photo?: boolean;
    /** Which children they're for; all of them unless the guardian leaves someone out. */
    kids: string[];
}

export const FAMILY: FamilyPerson[] = [
    {id: 'f1', name: 'Daniela Vega', relation: 'mother', phone: '55 2222 3333', emergency: true, pickup: true, photo: true, kids: ['mateo', 'valentina']},
    {id: 'f2', name: 'Roberto López', relation: 'father', phone: '55 4444 5555', emergency: true, pickup: true, photo: true, kids: ['mateo', 'valentina']},
    {id: 'f3', name: 'Carmen Vega', relation: 'grandmother', emergency: false, pickup: true, photo: true, kids: ['mateo']},
];

/** The relationships offered in a dropdown, as keys: each shows in the reader's language ("Other…" keeps what was typed). */
export const RELATIONS = ['mother', 'father', 'grandmother', 'grandfather', 'aunt', 'uncle', 'sister', 'brother', 'wife', 'husband', 'partner', 'daughter', 'son', 'friend', 'businessPartner'] as const;

/** Students a teacher sees at Ámbar Danza Aérea (the rest of the sample students are Colibrí's). */
export const AMBAR_STUDENTS: Student[] = [
    {
        id: 'renata', name: 'Renata Ibarra', age: 23, plan: 'monthly', planLabel: 'Flexibilidad', paymentDay: 15, status: 'active',
        emergency: [{name: 'Hugo Ibarra', relation: 'father', phone: '55 6060 7070'}],
    },
    {
        id: 'oscar', name: 'Óscar Peña', age: 36, plan: 'cash', planLabel: '', paymentDay: 30, status: 'active',
        health: 'Epilepsia controlada con medicamento. Si tiene una crisis: despejar el área, no sujetarlo y llamar a su contacto.',
        emergency: [{name: 'Lidia Peña', relation: 'sister', phone: '55 8080 9090'}],
    },
];

// ---- Helios: two months of history, generated from each student's plan (see helios.ts) ----

/** Who's expected and who came, by session (the live loader refills these maps). */
export const HISTORY = heliosHistory(SESSIONS, TODAY, NOW, id => classById(id).name);
PROOFS.push(...HISTORY.proofs);
ENROLLMENTS.push(...HISTORY.enrollments);
BOARD.push(...HISTORY.board, ...HELIOS_NOTICES);
BOARD.sort((a, b) => b.date.localeCompare(a.date));
for (const session of SESSIONS) {
    const expected = HISTORY.expected.get(session.id);
    if (!expected) continue;
    session.expected = expected.length;
    const came = HISTORY.attended.get(session.id);
    if (came) session.checkedIn = came.length;
}
for (const item of CLASSES.filter(other => other.school === 'helios')) {
    item.students = new Set(SESSIONS.filter(session => session.classId === item.id && session.date >= TODAY).slice(0, 6).flatMap(session => HISTORY.expected.get(session.id) ?? [])).size;
}
const ahead = SESSIONS.filter(session => session.date >= TODAY && session.status === 'scheduled' && schoolOfSession(session) === 'helios');
HELIOS_ROOM.futureSessions = ahead.length;
for (const teacher of TEACHERS.filter(other => other.schools?.includes('helios'))) teacher.futureSessions = ahead.filter(session => (session.substitute ?? classById(session.classId).teacher) === teacher.id).length;

/** Who came to a session already given, as the teacher's pay counts them (Helios's history; undefined elsewhere). */
export const attendanceOf = (session: Session): Attendance[] | undefined => HISTORY.attended.get(session.id);
/** Teachers who came to a session as guests. */
export const guestsOf = (session: Session): number => HISTORY.guests.get(session.id)?.length ?? (LIVE.on || schoolOfSession(session) === 'helios' ? 0 : 1);

/** Who's expected at a session and who came: Helios's from its history, the others' from today's sample class. */
export function rosterOf(session: Session): { student: string; at?: string; by?: 'guardian' }[] {
    const expected = HISTORY.expected.get(session.id);
    if (!expected) return LIVE.on ? [] : TODAY_ROSTER;
    const came = HISTORY.attended.get(session.id) ?? [];
    const extra = came.filter(entry => !expected.includes(entry.student)).map(entry => ({student: entry.student, at: entry.at, by: entry.by}));
    return [...expected.map(student => {
        const entry = came.find(other => other.student === student);
        return entry ? {student, at: entry.at, by: entry.by} : {student};
    }), ...extra];
}

/** The students who usually come to a class (Helios: from their usual week), for a teacher's list. */
export const classStudents = (classId: string): string[] => [...new Set(SESSIONS.filter(session => session.classId === classId && session.date >= TODAY)
    .slice(0, 6).flatMap(session => HISTORY.expected.get(session.id) ?? []))];
