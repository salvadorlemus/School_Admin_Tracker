import {Children, Fragment, isValidElement, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode} from 'react';
import {t} from '../lib/texts';
import {dayField, initials, time} from '../lib/format';
import {useRouter} from '../lib/router';
import {Icon} from './Icon';

/**
 * Form pieces. Each text field says what it holds (type, inputMode, autoComplete), so the phone
 * opens the right keyboard: numbers for amounts and days, a phone pad for phones, @ for emails.
 * Anything picked from a fixed list is a dropdown (SelectField), with "Otro" when the list can't
 * hold every answer.
 */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export function TextField({id, label, hint, error, ...input}: InputProps & {
    id: string;
    label: string;
    hint?: string;
    error?: string;
}) {
    return (
        <div className="field">
            <label className="label" htmlFor={id}>{label}</label>
            <input id={id} className="input" aria-invalid={error ? true : undefined}
                   aria-describedby={hint || error ? `${id}-hint` : undefined} {...input}/>
            {(hint || error) &&
                <span id={`${id}-hint`} className={error ? 'field-error' : 'hint'}>{error ?? hint}</span>}
        </div>
    );
}

/** A phone number: phone keypad, and the browser can fill it in. */
export function PhoneField(props: InputProps & { id: string; label: string; hint?: string }) {
    return <TextField type="tel" inputMode="tel" autoComplete="tel" {...props}/>;
}

/** A whole number (days, places, months): number keypad. */
export function NumberField(props: InputProps & { id: string; label: string; hint?: string }) {
    return <TextField type="text" inputMode="numeric" pattern="[0-9]*" {...props}/>;
}

/** An amount in pesos: number keypad. */
export const MoneyField = NumberField;

export function EmailField(props: InputProps & { id: string; label: string; hint?: string }) {
    return <TextField type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                      spellCheck={false} {...props}/>;
}

/**
 * A date or a time written in the app's language ("Jue 26 nov 2026", "17:00"), whatever language
 * the phone is in: the text is drawn by the app, and the phone's own picker (a transparent native
 * input over it) opens on tap. Controlled with `value`, or left alone with `defaultValue`.
 */
function PickerField({kind, id, label, hint, value, defaultValue, onChange, min, max, disabled}: {
    kind: 'date' | 'time';
    id: string;
    label: string;
    hint?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    min?: string;
    max?: string;
    disabled?: boolean;
}) {
    const [own, setOwn] = useState(defaultValue ?? '');
    const shown = value ?? own;
    const input = useRef<HTMLInputElement>(null);
    return (
        <div className="field">
            <label className="label" htmlFor={id}>{label}</label>
            <div className="picker" data-disabled={disabled || undefined}>
                <span className="input picker-text" aria-hidden="true" data-empty={!shown || undefined}>
                    {shown ? (kind === 'date' ? dayField(shown) : time(shown)) : t(kind === 'date' ? 'common.pickDate' : 'common.pickTime')}
                </span>
                <span className="picker-icon" aria-hidden="true"><Icon name={kind === 'date' ? 'calendar' : 'clock'} size={18}/></span>
                <input ref={input} id={id} className="picker-native" type={kind} value={shown} min={min} max={max} disabled={disabled}
                       aria-describedby={hint ? `${id}-hint` : undefined}
                       onChange={event => {
                           if (value === undefined) setOwn(event.target.value);
                           onChange?.(event.target.value);
                       }}
                       onClick={() => {
                           try {
                               input.current?.showPicker?.();
                           } catch {
                               // Some browsers only open it from their own button; the input still takes typing.
                           }
                       }}/>
            </div>
            {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
        </div>
    );
}

export function DateField(props: Omit<Parameters<typeof PickerField>[0], 'kind'>) {
    return <PickerField kind="date" {...props}/>;
}

export function TimeField(props: Omit<Parameters<typeof PickerField>[0], 'kind'>) {
    return <PickerField kind="time" {...props}/>;
}

/**
 * Search behind a magnifier: searching is occasional, so it takes a button's room until tapped. Open,
 * it's the field with a close button that clears it. `beside` shares the row with the button (the
 * tabs or dropdown next to it), and stays under the field while it's open.
 */
export function SearchField({id, label, value, onChange, beside}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    beside?: ReactNode;
}) {
    const [open, setOpen] = useState(value !== '');
    if (open) {
        return (
            <>
                <div className="search-open">
                    <input id={id} className="input" type="search" aria-label={label} placeholder={label} value={value} autoFocus
                           onChange={event => onChange(event.target.value)}/>
                    <button type="button" className="icon-btn" aria-label={t('common.closeSearch')} onClick={() => {
                        onChange('');
                        setOpen(false);
                    }}><Icon name="close"/></button>
                </div>
                {beside}
            </>
        );
    }
    return (
        <div className="search-row">
            <div className="grow">{beside}</div>
            <button type="button" className="icon-btn" aria-label={label} onClick={() => setOpen(true)}><Icon name="search"/></button>
        </div>
    );
}

/**
 * A choice that changes what a screen or popup shows (a school, a child, a class), written as text
 * with ▾ instead of a labelled dropdown. The phone's own list opens on tap (a transparent native
 * select over the text), so it stays one line, and a long name ends in "…".
 */
export function MenuText({id, label, value, options, onChange}: {
    id: string;
    /** What's being chosen, for screen readers (the text shows only the current choice). */
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    return (
        <span className="menu-text">
            <span className="menu-text-value">{options.find(option => option.value === value)?.label ?? ''}</span>
            <Icon name="chevron" size={14}/>
            <select id={id} className="menu-text-native" aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </span>
    );
}

/** The shape of what's loading: grey bars that shimmer, in place of rows or a card. */
export function Skeleton({rows = 3, card}: { rows?: number; card?: boolean }) {
    return (
        <div className={card ? 'card skeleton' : 'skeleton'} aria-busy="true" aria-label={t('common.loading')}>
            {Array.from({length: rows}, (_, index) => <span key={index} className="skeleton-bar" style={{width: `${[92, 70, 82, 58][index % 4]}%`}}/>)}
        </div>
    );
}

/**
 * True for a moment after `key` changes (or on arriving, with `onMount`): what depends on it shows a
 * skeleton while it would be fetched. The prototype has no server, so it stands in for the wait (300 ms).
 */
const LAST_KEYS = new Map<string, string>();

export function useBriefLoading(scope: string, key: string, onMount = false): boolean {
    // Screens remount on every history entry (a carousel's pick is in the URL), so the last key is
    // remembered per scope outside the component.
    // Read while rendering, written after (StrictMode renders twice: both renders must see the same).
    const previous = LAST_KEYS.get(scope);
    const [loading, setLoading] = useState(() => onMount || (previous !== undefined && previous !== key));
    // A key change while mounted: state, not a ref, so StrictMode's second render sees it too.
    const [last, setLast] = useState(key);
    if (last !== key) {
        setLast(key);
        setLoading(true);
    }
    useEffect(() => {
        LAST_KEYS.set(scope, key);
    }, [scope, key]);
    useEffect(() => {
        if (!loading) return undefined;
        const timer = window.setTimeout(() => setLoading(false), 300);
        return () => window.clearTimeout(timer);
    }, [loading, key]);
    return loading;
}

export function TextArea({id, label, hint, defaultValue, value, rows = 3, onChange}: {
    id: string;
    label: string;
    hint?: string;
    defaultValue?: string;
    value?: string;
    rows?: number;
    onChange?: (value: string) => void;
}) {
    return (
        <div className="field">
            <label className="label" htmlFor={id}>{label}</label>
            <textarea id={id} className="input" rows={rows} defaultValue={defaultValue} value={value}
                      aria-describedby={hint ? `${id}-hint` : undefined}
                      onChange={event => onChange?.(event.target.value)}/>
            {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
        </div>
    );
}

export interface Choice {
    value: string;
    label: string;
    /** A line under the dropdown that explains this choice. */
    hint?: string;
}

const OTHER = '__other';

/**
 * A dropdown. With `other`, the list ends with "Otro…", which shows a text field for an answer
 * the list doesn't have. The hint under it follows the chosen option.
 */
export function SelectField({id, label, hint, options, value, defaultValue, onChange, other, placeholder}: {
    id: string;
    label: string;
    hint?: string;
    options: Choice[];
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    other?: boolean;
    /** A first, empty option ("Elige…"), so nothing is chosen until the person picks. */
    placeholder?: string;
}) {
    const known = (v: string | undefined) => v === undefined || v === '' || options.some(option => option.value === v);
    const start = value ?? defaultValue;
    const [picked, setPicked] = useState(known(start) ? start ?? '' : OTHER);
    const [otherText, setOtherText] = useState(known(start) ? '' : start ?? '');
    const shown = value !== undefined && known(value) ? value : picked;
    const line = options.find(option => option.value === shown)?.hint ?? hint;
    return (
        <div className="field">
            <label className="label" htmlFor={id}>{label}</label>
            <select id={id} className="input" value={shown} aria-describedby={line ? `${id}-hint` : undefined}
                    onChange={event => {
                        setPicked(event.target.value);
                        onChange?.(event.target.value === OTHER ? otherText : event.target.value);
                    }}>
                {placeholder && <option value="" disabled>{placeholder}</option>}
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                {other && <option value={OTHER}>{t('common.other')}</option>}
            </select>
            {line && <span id={`${id}-hint`} className="hint">{line}</span>}
            {shown === OTHER && (
                <input id={`${id}-other`} className="input" aria-label={t('common.otherWhich', {label})}
                       value={otherText}
                       placeholder={t('common.otherWhich', {label})} autoFocus
                       onChange={event => {
                           setOtherText(event.target.value);
                           onChange?.(event.target.value);
                       }}/>
            )}
        </div>
    );
}

export function Check({id, label, hint, checked, defaultChecked, onChange, disabled}: {
    id: string;
    label: ReactNode;
    hint?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label className="check" htmlFor={id}>
            <input id={id} type="checkbox" checked={checked} defaultChecked={defaultChecked} disabled={disabled}
                   onChange={event => onChange?.(event.target.checked)}/>
            <span className="grow"><span>{label}</span>{hint && <span className="hint">{hint}</span>}</span>
        </label>
    );
}

/**
 * A carousel's selected card, kept in the URL (`?pick=2`) so going back to the screen finds the
 * same card selected, and centred, instead of the first one.
 */
export function useQueryIndex(name: string, count: number, fallback = 0): [number, (index: number) => void] {
    const router = useRouter();
    const raw = router.query.get(name);
    const index = Math.min(Math.max(raw === null ? fallback : Number(raw) || 0, 0), Math.max(count - 1, 0));
    return [index, next => router.replace(router.withQuery(name, next === fallback ? null : String(next)))];
}

/** A checkbox drawn as a card, for a list where several can be picked (which children came). */
export function Option({id, label, hint, checked, defaultChecked, onChange}: {
    id: string;
    label: ReactNode;
    hint?: ReactNode;
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
}) {
    return (
        <label className="option" htmlFor={id}>
            <input id={id} type="checkbox" checked={checked} defaultChecked={defaultChecked}
                   onChange={event => onChange?.(event.target.checked)}/>
            <span className="grow">
                <span className="strong">{label}</span>
                {hint && <span className="hint">{hint}</span>}
            </span>
        </label>
    );
}

/** Switches between views of one screen (Mes / Planear, a student's tabs) and the language. */
export function Segmented<T extends string>({label, value, options, onChange}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className="seg" role="group" aria-label={label}>
            {options.map(option => (
                <button key={option.value} type="button" aria-pressed={option.value === value}
                        onClick={() => onChange(option.value)}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/**
 * A round photo with a camera badge: tapping it opens the camera (or the gallery). The picked
 * image shows at once; in the real app it's compressed on the phone before uploading.
 */
export function PhotoPicker({name, size = 'md', label, onPicked}: {
    name: string;
    size?: 'sm' | 'md';
    label: string;
    /** Called with the picked photo (an object URL the prototype keeps in memory). */
    onPicked?: (url?: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [url, setUrl] = useState<string | null>(null);
    return (
        <>
            <button type="button" className={size === 'sm' ? 'photo-picker photo-picker-sm' : 'photo-picker'}
                    aria-label={label} onClick={() => input.current?.click()}>
                <span className="avatar">{url ? <img src={url} alt=""/> : initials(name) || <Icon name="user"/>}</span>
                <span className="photo-badge" aria-hidden="true"><Icon name="camera"
                                                                       size={size === 'sm' ? 14 : 18}/></span>
            </button>
            <input ref={input} type="file" accept="image/*" capture="user" hidden
                   onChange={event => {
                       const file = event.target.files?.[0];
                       if (file) {
                           const next = URL.createObjectURL(file);
                           setUrl(next);
                           onPicked?.(next);
                       }
                   }}/>
        </>
    );
}

export function Avatar({name, large}: { name: string; large?: boolean }) {
    return <span className={large ? 'avatar avatar-lg' : 'avatar'} aria-hidden="true">{initials(name)}</span>;
}

/** A row in a list: a button when it opens something, plain otherwise. `fixed` keeps every row one height. */
/** A fixed-height row shows two tags and "+N" for the rest (the person's file shows them all). */
function fewChips(chips: ReactNode): ReactNode {
    const items = Children.toArray(isValidElement<{ children?: ReactNode }>(chips) && chips.type === Fragment ? chips.props.children : chips);
    if (items.length <= 2) return items;
    return <>{items.slice(0, 2)}<span className="chip chip-outline" aria-label={t('chip.moreN', {n: items.length - 2})}>+{items.length - 2}</span></>;
}

export function ListRow({title, sub, left, right, chips, onClick, fixed}: {
    title: ReactNode;
    sub?: ReactNode;
    left?: ReactNode;
    right?: ReactNode;
    chips?: ReactNode;
    onClick?: () => void;
    fixed?: boolean;
}) {
    const inner = (
        <>
            {left}
            <span className="grow">
                <span className="list-row-title">{title}</span>
                {sub && <span className="list-row-sub">{sub}</span>}
                {chips && <span className="wrap">{fixed ? fewChips(chips) : chips}</span>}
            </span>
            {right}
            {onClick && <span className="chev"><Icon name="chevron" size={18}/></span>}
        </>
    );
    const css = fixed ? 'list-row list-row-fixed' : 'list-row';
    return (
        <li>
            {onClick
                ? <button type="button" className={css} onClick={onClick}>{inner}</button>
                : <div className={css}>{inner}</div>}
        </li>
    );
}

/**
 * Cards that scroll sideways. Swiping only looks; tapping a card selects it, and the screen
 * updates for the selected one. With `onOpen`, tapping the selected card again opens it (a popup, a
 * screen), and the selected card says so at its bottom: no separate button. The selected card sits in the middle, with a bit of its neighbours
 * showing on each side, so it's clear there are more. The dots show which one is selected.
 */
export function Carousel<T>({label, items, selected, onSelect, render, keyOf, onOpen, openLabel}: {
    label: string;
    items: T[];
    selected: number;
    onSelect: (index: number) => void;
    onOpen?: (index: number) => void;
    /** What tapping the selected card again opens, e.g. "See the class". */
    openLabel?: (item: T) => string;
    render: (item: T, isSelected: boolean) => ReactNode;
    keyOf: (item: T) => string;
}) {
    const strip = useRef<HTMLDivElement>(null);
    const first = useRef(true);
    // Set when the selection came from swiping: the card is already in the middle, so no glide back.
    const swiped = useRef(false);
    const settle = useRef(0);
    // While the strip glides to a tapped card, the cards it passes aren't selected on the way.
    const gliding = useRef(0);
    const dragging = useRef<{ x: number; left: number; moved: boolean } | null>(null);
    const dragged = useRef(false);

    /** Selects the card nearest the middle, and centres it if the strip stopped halfway between two. */
    const snapToNearest = () => {
        const box = strip.current;
        if (!box) return;
        const middle = box.getBoundingClientRect().left + box.clientWidth / 2;
        const cards = [...box.querySelectorAll<HTMLElement>('.carousel-card')];
        const nearest = cards.reduce((best, card, index) => {
            const rect = card.getBoundingClientRect();
            const distance = Math.abs(rect.left + rect.width / 2 - middle);
            return distance < best.distance ? {index, distance} : best;
        }, {index: selected, distance: Infinity});
        const card = cards[nearest.index];
        if (card && nearest.distance > 2) {
            window.clearTimeout(gliding.current);
            gliding.current = window.setTimeout(() => (gliding.current = 0), 450);
            box.scrollTo({left: box.scrollLeft + card.getBoundingClientRect().left + card.offsetWidth / 2 - middle, behavior: 'smooth'});
        }
        if (nearest.index !== selected) {
            swiped.current = true;
            onSelect(nearest.index);
        }
    };

    const endDrag = () => {
        const drag = dragging.current;
        if (!drag) return;
        dragging.current = null;
        dragged.current = drag.moved;
        strip.current?.classList.remove('carousel-dragging');
        snapToNearest();
    };
    useEffect(() => {
        const box = strip.current;
        const card = box?.querySelectorAll<HTMLElement>('.carousel-card')[selected];
        if (!box || !card) return;
        if (swiped.current) {
            swiped.current = false;
            return;
        }
        // Centred on arriving (no animation), then it glides to each card that's tapped.
        const offset = card.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
        window.clearTimeout(gliding.current);
        gliding.current = window.setTimeout(() => (gliding.current = 0), 450);
        box.scrollTo({left: offset - (box.clientWidth - card.offsetWidth) / 2, behavior: first.current ? 'auto' : 'smooth'});
        first.current = false;
    }, [selected]);
    return (
        <>
            <div ref={strip} className="carousel" role="group" aria-label={label}
                 onScroll={() => {
                     // Once the swipe settles, the card nearest the middle is selected and the screen follows it. Waiting for the
                     // strip to stop keeps the screen below from changing size mid-swipe (iOS would drop the snap halfway).
                     if (gliding.current || dragging.current) return;
                     window.clearTimeout(settle.current);
                     settle.current = window.setTimeout(snapToNearest, 90);
                 }}
                 onPointerDown={event => {
                     // On a computer the mouse drags the strip, as a finger swipes it.
                     if (event.pointerType !== 'mouse' || !strip.current) return;
                     dragging.current = {x: event.clientX, left: strip.current.scrollLeft, moved: false};
                     strip.current.classList.add('carousel-dragging');
                 }}
                 onPointerMove={event => {
                     const drag = dragging.current;
                     if (!drag || !strip.current) return;
                     const dx = event.clientX - drag.x;
                     if (Math.abs(dx) > 4) drag.moved = true;
                     strip.current.scrollLeft = drag.left - dx;
                 }}
                 onPointerUp={() => endDrag()}
                 onPointerLeave={() => endDrag()}
                 onClickCapture={event => {
                     // A drag isn't a tap: the card under the mouse isn't selected or opened by it.
                     if (dragged.current) {
                         event.preventDefault();
                         event.stopPropagation();
                         dragged.current = false;
                     }
            }}>
                {items.map((item, index) => (
                    <button key={keyOf(item)} type="button" className="carousel-card" aria-pressed={index === selected}
                            onClick={() => (index === selected && onOpen ? onOpen(index) : onSelect(index))}>
                        {render(item, index === selected)}
                        {onOpen && openLabel && (
                            <span className="carousel-open" data-on={index === selected} aria-hidden={index !== selected}>
                                {openLabel(item)}<Icon name="chevron" size={16}/>
                            </span>
                        )}
                    </button>
                ))}
            </div>
            {items.length > 1 && items.length <= 8 && (
                <div className="carousel-dots" aria-hidden="true">
                    {items.map((item, index) => <span key={keyOf(item)} data-on={index === selected}/>)}
                </div>
            )}
            {items.length > 8 && (
                <p className="carousel-count small muted" aria-hidden="true">{t('carousel.count', {at: selected + 1, of: items.length})}</p>
            )}
        </>
    );
}

export function Empty({children}: { children: ReactNode }) {
    return <p className="empty">{children}</p>;
}

/** A short burst of confetti for a finished step. Skipped when the person prefers less motion. */
export function Confetti() {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!element || !context || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const width = (element.width = element.offsetWidth);
        const height = (element.height = element.offsetHeight);
        // Its colours are the stylesheet's (--confetti-1 … 6).
        const styles = getComputedStyle(document.documentElement);
        const colours = [1, 2, 3, 4, 5, 6].map(n => styles.getPropertyValue(`--confetti-${n}`).trim() || 'currentColor');
        const bits = Array.from({length: 90}, () => ({
            x: width / 2,
            y: height * 0.35,
            vx: (Math.random() - 0.5) * 9,
            vy: -Math.random() * 9 - 3,
            size: 5 + Math.random() * 5,
            spin: Math.random() * 6,
            colour: colours[Math.floor(Math.random() * colours.length)],
        }));
        let frame = 0;
        let id = 0;
        const draw = () => {
            context.clearRect(0, 0, width, height);
            for (const bit of bits) {
                bit.vy += 0.25;
                bit.x += bit.vx;
                bit.y += bit.vy;
                bit.spin += 0.2;
                context.save();
                context.translate(bit.x, bit.y);
                context.rotate(bit.spin);
                context.fillStyle = bit.colour;
                context.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
                context.restore();
            }
            if (++frame < 150) id = requestAnimationFrame(draw);
            else context.clearRect(0, 0, width, height);
        };
        id = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(id);
    }, []);
    return <canvas ref={canvas} className="confetti" aria-hidden="true"/>;
}
