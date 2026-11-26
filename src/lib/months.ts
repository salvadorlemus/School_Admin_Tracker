import {TODAY} from '../mock/data';
import {LIVE} from '../live/state';

/**
 * The months the calendars move through. They follow today: the live app reaches back two months
 * and ahead two (the sessions it loads cover them); the prototype's sessions cover this month and the next.
 */

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

export function shiftMonth(first: string, by: number): string {
    const date = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + by, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function monthRange(): { min: string; max: string } {
    const now = monthStart(TODAY);
    return LIVE.on ? {min: shiftMonth(now, -2), max: shiftMonth(now, 2)} : {min: now, max: shiftMonth(now, 1)};
}

/** The month a `?month=YYYY-MM-01` asks for, kept inside the range (this month when none). */
export function pickedMonth(query: string | null): string {
    const {min, max} = monthRange();
    const wanted = query && /^\d{4}-\d{2}-01$/.test(query) ? query : monthStart(TODAY);
    return wanted < min ? min : wanted > max ? max : wanted;
}
