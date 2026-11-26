import {attendanceOf, CLASSES, SESSIONS, STRESS, studentsOf, TEACHERS} from './data';

// The platform admin panel's data: invented for the prototype, filled from the database in the live
// app (src/live/admin.ts). Counts only, never a school's records.

export interface SchoolRow {
    id: string;
    name: string;
    enabled: boolean;
    billing: 'ok' | 'soon' | 'late';
    students: number;
    teachers: number;
    classes: number;
    checkins: number;
    /** GB in the bucket. */
    storage: number;
    active: number;
    lastActivity: string;
    directors: { name: string; phone: string; email: string }[];
    fee: number;
    /** Live: the month that's due and when (overdue or upcoming). */
    due?: { month: string; on: string };
}

export const SCHOOL_ROWS: SchoolRow[] = [
    {
        id: 'colibri',
        name: 'Estudio Aéreo Colibrí',
        enabled: true,
        billing: 'ok',
        students: 58,
        teachers: 6,
        classes: 10,
        checkins: 412,
        storage: 1.8,
        active: 61,
        lastActivity: '2026-11-26',
        directors: [
            {name: 'Ana Torres', phone: '55 3456 7890', email: 'ana.torres@correo.mx'},
            {name: 'Pablo Méndez', phone: '55 6543 2109', email: 'pablo.mendez@correo.mx'},
        ],
        fee: 1500
    },
    {
        id: 'ambar',
        name: 'Ámbar Danza Aérea',
        enabled: true,
        billing: 'soon',
        students: 31,
        teachers: 3,
        classes: 5,
        checkins: 198,
        storage: 0.6,
        active: 30,
        lastActivity: '2026-11-25',
        directors: [{name: 'Irene Castañeda', phone: '33 1122 3344', email: 'irene@estudioambar.mx'}],
        fee: 1000
    },
    // Helios: its counts come from its sample history.
    {
        id: 'helios',
        name: 'Helios',
        enabled: true,
        billing: 'ok',
        students: studentsOf('helios').filter(student => student.status === 'active').length,
        teachers: TEACHERS.filter(teacher => teacher.schools?.includes('helios')).length,
        classes: CLASSES.filter(item => item.school === 'helios').length,
        checkins: SESSIONS.filter(session => session.classId.startsWith('h-') && session.date >= '2026-10-27').reduce((sum, session) => sum + (attendanceOf(session)?.length ?? 0), 0),
        storage: 0.3,
        active: studentsOf('helios').filter(student => student.status === 'active').length,
        lastActivity: '2026-11-25',
        directors: [{name: 'Ana Torres', phone: '55 9012 3456', email: 'ana.torres@correo.mx'}],
        fee: 1000
    },
    {
        id: 'pigmento',
        name: 'Casa Pirueta',
        enabled: false,
        billing: 'late',
        students: 22,
        teachers: 2,
        classes: 4,
        checkins: 0,
        storage: 0.4,
        active: 0,
        lastActivity: '2026-10-14',
        directors: [{name: 'Julián Ortega', phone: '81 5566 7788', email: 'julian@casapirueta.mx'}],
        fee: 1000
    },
];

if (STRESS) {
    const names = ['Academia Internacional de Artes Circenses y Danza Aérea Contemporánea del Bajío', 'Casa de la Lumbre', 'Vuelo Libre Escuela de Aéreos', 'Giros del Norte', 'Cuerda y Aro Estudio de Circo'];
    names.forEach((name, index) => SCHOOL_ROWS.push({
        id: `stress${index}`, name, enabled: index !== 3, billing: (['ok', 'soon', 'late', 'ok', 'late'] as const)[index],
        students: 12 + index * 9, teachers: 2 + index, classes: 3 + index, checkins: 40 * index, storage: 0.2 + index / 10, active: index === 3 ? 0 : 10 + index * 8, lastActivity: index === 3 ? '2026-09-30' : '2026-11-24',
        directors: index === 0 ? [
            {name: 'Maximiliano Alejandro Fernández de Córdoba y Villaseñor', phone: '477 123 4567', email: 'maximiliano.fernandez.de.cordoba@academia-internacional-bajio.edu.mx'},
            {name: 'Lucía Torres', phone: '477 765 4321', email: 'lucia@bajio.mx'},
            {name: 'Raúl Peña', phone: '477 222 3333', email: 'raul@bajio.mx'},
        ] : [{name: `Director ${index + 1}`, phone: '55 0000 000' + index, email: `direccion${index}@escuela.mx`}],
        fee: 1000,
    }));
}

/** Each school's details the admin keeps (time zone, billing, tax details, notes): edited on their own screen. */
export const DETAILS: Record<string, { tz: string; billingDay: number; trialEnd: string; tax: string; notes: string }> = {
    colibri: {tz: 'mx', billingDay: 1, trialEnd: '', tax: 'TAC180512AB3', notes: 'Paga por transferencia los primeros días del mes.'},
    ambar: {tz: 'mx', billingDay: 1, trialEnd: '', tax: '', notes: ''},
    pigmento: {tz: 'mx', billingDay: 15, trialEnd: '', tax: 'CPI200101XY9', notes: 'Pidió pausar en diciembre.'},
};
export const detailsOf = (id: string) => DETAILS[id] ?? (DETAILS[id] = {tz: 'mx', billingDay: 1, trialEnd: '', tax: '', notes: ''});

/** Payments to the platform (the live app's, from the database). */
export interface BillingPayment {
    id: string;
    school: string;
    amount: number;
    month: string;
    paidOn: string;
    method: string;
}

export const BILLING_PAYMENTS: BillingPayment[] = [];

/** The admin's log (the live app's): what, about which school, when. */
export interface AdminLogRow {
    id: string;
    action: string;
    school: string;
    details: Record<string, unknown>;
    at: string;
}

export const ADMIN_LOG: AdminLogRow[] = [];
