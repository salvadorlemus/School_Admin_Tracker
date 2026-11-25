import {getLanguage} from './texts';

// Dates are 'YYYY-MM-DD' in the school's time zone and times 'HH:MM'; both are shown in the
// person's language.

const locale = () => (getLanguage() === 'es' ? 'es-MX' : 'en-US');

function toDate(iso: string, hhmm = '12:00'): Date {
    const [y, m, d] = iso.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function money(amount: number): string {
    return new Intl.NumberFormat(locale(), {
        style: 'currency', currency: 'MXN', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
    }).format(amount);
}

/** "Jue 26 nov" / "Thu, Nov 26" */
export function dayShort(iso: string): string {
    return capital(new Intl.DateTimeFormat(locale(), {weekday: 'short', day: 'numeric', month: 'short'})
        .format(toDate(iso)).replace(/\./g, ''));
}

/** "Jueves 26 de noviembre" / "Thursday, November 26" */
export function dayLong(iso: string): string {
    return capital(new Intl.DateTimeFormat(locale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    }).format(toDate(iso)));
}

/** "26 nov" / "Nov 26" */
export function dayMonth(iso: string): string {
    return new Intl.DateTimeFormat(locale(), {day: 'numeric', month: 'short'}).format(toDate(iso)).replace(/\./g, '');
}

/** "20 nov 2026" / "Nov 20, 2026" */
export function dayMonthYear(iso: string): string {
    return new Intl.DateTimeFormat(locale(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(toDate(iso)).replace(/[.]/g, '');
}

/** "noviembre" / "November": a month inside a sentence (lowercase in Spanish). */
export function monthInSentence(iso: string): string {
    const month = new Intl.DateTimeFormat(locale(), {month: 'long'}).format(toDate(iso));
    return getLanguage() === 'es' ? month : capital(month);
}

/** "oct" / "Oct" */
export function monthShort(iso: string): string {
    return new Intl.DateTimeFormat(locale(), {month: 'short'}).format(toDate(iso)).replace(/\./g, '');
}

/** "Jue 26 nov 2026" / "Thu, Nov 26, 2026": a date in a form field. */
export function dayField(iso: string): string {
    return capital(new Intl.DateTimeFormat(locale(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
        .format(toDate(iso)).replace(/\./g, '').replace(/ de /g, ' ').replace(getLanguage() === 'es' ? ',' : /^$/, ''));
}

/** "1.8" / "1.8": one decimal, in the person's language (storage in GB). */
export function decimal(value: number): string {
    return new Intl.NumberFormat(locale(), {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value);
}

/**
 * A person's name for a chip: the first name and the first surname's initial ("Mariana R.").
 * With several given names, the first surname is the second-to-last word that isn't a particle.
 */
export function shortName(full: string): string {
    const words = full.trim().split(/\s+/).filter(word => !['de', 'del', 'la', 'las', 'los', 'y'].includes(word.toLowerCase()));
    if (words.length < 2) return full.trim();
    const surname = words.length <= 3 ? words[1] : words[words.length - 2];
    return `${words[0]} ${surname.charAt(0).toUpperCase()}.`;
}

/**
 * A person's name in a list or card: the first name and the first surname ("Sofía Ramírez" for
 * "Sofía Ramírez Castro"), so long names don't make rows grow. Their file keeps the full name.
 */
export function personName(full: string): string {
    const words = full.trim().split(/\s+/).filter(word => !['de', 'del', 'la', 'las', 'los', 'y'].includes(word.toLowerCase()));
    return words.length < 3 ? full.trim() : `${words[0]} ${words[words.length - 2]}`;
}

/** "Mateo y Valentina" / "Mateo and Valentina" */
export function listOf(items: string[]): string {
    return new Intl.ListFormat(locale(), {type: 'conjunction'}).format(items);
}

/** "Noviembre 2026" / "November 2026" */
export function monthYear(iso: string): string {
    return capital(new Intl.DateTimeFormat(locale(), {month: 'long', year: 'numeric'}).format(toDate(iso)));
}

/** "Noviembre" / "November" */
export function monthName(iso: string): string {
    return capital(new Intl.DateTimeFormat(locale(), {month: 'long'}).format(toDate(iso)));
}

/** "jue" / "Thu", for weekday 1 (Monday) to 7 (Sunday). */
export function weekdayShort(weekday: number): string {
    // 2026-11-23 is a Monday.
    return capital(new Intl.DateTimeFormat(locale(), {weekday: 'short'}).format(toDate(`2026-11-${22 + weekday}`)).replace(/\./g, ''));
}

/** "L" / "M": the first letter, for a row of day buttons (each also says its full name). */
export function weekdayLetter(weekday: number): string {
    return weekdayLong(weekday).charAt(0);
}

/** "Lunes" / "Monday" */
export function weekdayLong(weekday: number): string {
    return capital(new Intl.DateTimeFormat(locale(), {weekday: 'long'}).format(toDate(`2026-11-${22 + weekday}`)));
}

/** "10:00" / "10:00 AM" */
export function time(hhmm: string): string {
    // Spanish uses the 24-hour clock (10:00, 16:30); English the 12-hour one (10:00 AM).
    const options: Intl.DateTimeFormatOptions = getLanguage() === 'es'
        ? {hour: 'numeric', minute: '2-digit', hourCycle: 'h23'}
        : {hour: 'numeric', minute: '2-digit'};
    return new Intl.DateTimeFormat(locale(), options).format(toDate('2026-11-26', hhmm));
}

export function timeRange(start: string, end: string): string {
    return `${time(start)} – ${time(end)}`;
}

/** 1 for Monday ... 7 for Sunday. */
export function weekdayOf(iso: string): number {
    return ((toDate(iso).getDay() + 6) % 7) + 1;
}

export function addDays(iso: string, days: number): string {
    const date = toDate(iso);
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}
