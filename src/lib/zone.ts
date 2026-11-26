/**
 * Dates and times in a school's time zone. The database keeps instants (timestamptz); the screens
 * show each school's own day and hour, and a time picked on a screen is that school's.
 */

/** A school's zone when it has none yet (the schools so far are in Mexico). */
export const DEFAULT_ZONE = 'America/Mexico_City';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
    let f = formatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        formatters.set(zone, f);
    }
    return f;
}

/** An instant as the school's date and time: "2026-11-26", "18:00". */
export function localParts(iso: string | number | Date, zone = DEFAULT_ZONE): { date: string; time: string } {
    const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(iso)).map(part => [part.type, part.value]));
    return {date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`};
}

/** A school's date and time as an instant (ISO, UTC). */
export function instant(date: string, time: string, zone = DEFAULT_ZONE): string {
    const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(time.slice(0, 2)), Number(time.slice(3, 5)));
    const shown = localParts(guess, zone);
    const shownUtc = Date.UTC(Number(shown.date.slice(0, 4)), Number(shown.date.slice(5, 7)) - 1, Number(shown.date.slice(8, 10)),
        Number(shown.time.slice(0, 2)), Number(shown.time.slice(3, 5)));
    return new Date(guess - (shownUtc - guess)).toISOString();
}
