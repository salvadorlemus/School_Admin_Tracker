import {t, type TextKey} from '../../lib/texts';
import {dayMonth, dayMonthYear, dayShort, monthInSentence, time} from '../../lib/format';
import {PRICES, RELATIONS, TODAY, type Notice, type Price, type Student} from '../../mock/data';

/**
 * What the app writes about the data, in the reader's language. The data keeps names (classes,
 * people, rooms) as the school typed them, and keys or ISO dates for everything else; these turn
 * those into words, so nothing Spanish leaks into the English app.
 */

/** A relationship from the list ("mother"), or the words typed under "Other…". */
export const relationText = (value: string) => (RELATIONS as readonly string[]).includes(value) ? t(`rel.${value}` as TextKey) : value;

/** How a student pays, short: "Acuarela · monthly", "3 a week package", "Per visit · cash", "TotalPass". */
export function planText(student: Pick<Student, 'plan' | 'planLabel'>): string {
    if (student.plan === 'monthly') return `${student.planLabel} · ${t('plan.monthlyShort')}`;
    if (student.plan === 'totalpass') return 'TotalPass';
    return t(`plan.${student.plan}Short` as TextKey);
}

/** A price's name: the ones the app defines in the reader's language, a class's monthly plan by its name. */
export function priceLabel(price: Price): string {
    if (price.kind === 'free') return t('prices.freeRow', {n: price.label});
    if (price.kind === 'monthly') return price.label;
    if (price.kind === 'package') return t(price.id === 'pk2' ? 'payments.package2' : 'payments.package3');
    return t(price.kind === 'fee' ? 'prices.feeRow' : price.kind === 'visit' ? 'prices.visitRow' : 'prices.trialRow');
}

/** A date or month kept as ISO, written for a sentence: "30 nov", "1 ene 2027", "mar 1 dic 10:00", "noviembre". */
export function dateText(value: string): string {
    const at = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
    if (at) return `${dayShort(at[1])} ${time(at[2])}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 4) === TODAY.slice(0, 4) ? dayMonth(value) : dayMonthYear(value);
    if (/^\d{4}-\d{2}$/.test(value)) return monthInSentence(`${value}-01`);
    return value;
}

/** What a payment screenshot covers: "Dibujo infantil · noviembre", "3 a week package · November", a session's date. */
export function coversText(covers: string): string {
    const [what, period] = covers.split(' · ');
    const name = what === 'pk3' ? t('payments.package3') : what === 'pk2' ? t('payments.package2') : what;
    return period ? `${name} · ${dateText(period)}` : name;
}

/** A notice's variables with their dates (and what a screenshot covers) written in the reader's language. */
export function noticeVars(vars?: Record<string, string>): Record<string, string> | undefined {
    if (!vars) return vars;
    return Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, key === 'what' ? coversText(value) : dateText(value)]));
}

/** A post's title: a price change by the price's name, a schedule change with its session's date. */
export function noticeTitle(notice: Notice): string {
    const price = notice.priceId ? PRICES.find(item => item.id === notice.priceId) : undefined;
    const title = price ? priceLabel(price) : notice.title;
    return notice.at ? `${title} · ${dateText(notice.at)}` : title;
}
