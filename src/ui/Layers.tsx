import {
    createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import {t} from '../lib/texts';
import {useRouter} from '../lib/router';
import {Icon} from './Icon';

/**
 * Popups (sheets), confirmation boxes and toasts. They draw inside the phone (`.device`), not over
 * the whole browser window, so the phone frame on a laptop shows them where a phone would. While
 * one is open, the screen behind it is inert: no focus, no taps.
 */

interface ConfirmRequest {
    title: string;
    body?: ReactNode;
    confirm: string;
    danger?: boolean;
}

interface LayerState {
    root: HTMLElement | null;
    hold: () => () => void;
    confirm: (request: ConfirmRequest) => Promise<boolean>;
    toast: (message: string) => void;
}

const LayerContext = createContext<LayerState | null>(null);

function useLayers(): LayerState {
    const state = useContext(LayerContext);
    if (!state) throw new Error('Layers need <Device>.');
    return state;
}

/** The phone: the app's content plus the place where popups draw. */
export function Device({children}: { children: ReactNode }) {
    const content = useRef<HTMLDivElement>(null);
    const [root, setRoot] = useState<HTMLElement | null>(null);
    const holds = useRef(0);
    const [ask, setAsk] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const hold = useCallback(() => {
        holds.current += 1;
        if (content.current) content.current.inert = true;
        return () => {
            holds.current -= 1;
            if (content.current && holds.current === 0) content.current.inert = false;
        };
    }, []);

    const confirm = useCallback((request: ConfirmRequest) =>
        new Promise<boolean>(resolve => setAsk({...request, resolve})), []);

    useEffect(() => {
        if (!message) return;
        const timer = window.setTimeout(() => setMessage(null), 3200);
        return () => window.clearTimeout(timer);
    }, [message]);

    const [closing, setClosing] = useState<ConfirmRequest | null>(null);
    const answer = (ok: boolean) => {
        ask?.resolve(ok);
        if (ask) {
            setClosing(ask);
            window.setTimeout(() => setClosing(null), 180);
        }
        setAsk(null);
    };
    const shown = ask ?? closing;

    return (
        <LayerContext.Provider value={{root, hold, confirm, toast: setMessage}}>
            <div className="device">
                <div ref={content} className="screen">{children}</div>
                <div ref={setRoot}/>
                {shown && (
                    <Layer center onDismiss={() => answer(false)} labelledBy="confirm-title" leaving={!ask}>
                        <div className="dialog">
                            <h2 id="confirm-title">{shown.title}</h2>
                            {shown.body && <div className="muted">{shown.body}</div>}
                            <div className="btn-row">
                                <button type="button" className="btn btn-secondary" onClick={() => answer(false)}>
                                    {t('common.back')}
                                </button>
                                <button type="button" className={shown.danger ? 'btn btn-danger' : 'btn'}
                                        onClick={() => answer(true)}>
                                    {shown.confirm}
                                </button>
                            </div>
                        </div>
                    </Layer>
                )}
                {message && <div className="toast" role="status"><Icon name="check"/>{message}</div>}
            </div>
        </LayerContext.Provider>
    );
}

export function useConfirm() {
    return useLayers().confirm;
}

export function useToast() {
    return useLayers().toast;
}

/** The dimmed layer itself: Escape or a tap outside dismisses it; focus moves in and comes back. */
function Layer({children, center, onDismiss, labelledBy, keepNav, leaving}: {
    children: ReactNode;
    center?: boolean;
    /** Playing its exit animation: still drawn, no longer taking taps. */
    leaving?: boolean;
    onDismiss: () => void;
    labelledBy: string;
    /** Leave the screen's bottom bar in view: the popup ends above it, and tapping the bar closes it. */
    keepNav?: boolean;
}) {
    const {root, hold} = useLayers();
    const box = useRef<HTMLDivElement>(null);
    const [navHeight, setNavHeight] = useState(0);

    useLayoutEffect(() => {
        if (!keepNav) return;
        setNavHeight(box.current?.closest('.device')?.querySelector<HTMLElement>('.screen .nav')?.offsetHeight ?? 0);
    }, [keepNav, root]);

    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const release = hold();
        // The popup itself takes focus: the next Tab reaches its first control, with no ring shown on arrival.
        box.current?.focus();
        return () => {
            release();
            before?.focus?.();
        };
    }, [hold]);

    if (!root) return null;
    return createPortal(
        <div ref={box} className={center ? 'layer layer-center' : navHeight ? 'layer layer-keep-nav' : 'layer'} role="dialog"
             aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-leaving={leaving || undefined}
             style={navHeight ? {'--nav-h': `${navHeight}px`} as CSSProperties : undefined}
             onKeyDown={event => event.key === 'Escape' && onDismiss()}
             onClick={event => event.target === event.currentTarget && onDismiss()}>
            {children}
        </div>,
        root,
    );
}

let sheetCount = 0;

/** True for the length of the exit animation after `open` turns false. */
function useLeaving(open: boolean): boolean {
    const [leaving, setLeaving] = useState(false);
    const [was, setWas] = useState(open);
    // Decided while rendering, not after: an effect would first draw a frame with the popup gone, then
    // bring it back to animate out (the flicker).
    if (was !== open) {
        setWas(open);
        setLeaving(!open);
    }
    useEffect(() => {
        if (!leaving) return undefined;
        const timer = window.setTimeout(() => setLeaving(false), 180);
        return () => window.clearTimeout(timer);
    }, [leaving]);
    return (leaving || was !== open) && !open;
}

/**
 * A popup from the bottom with a title, a close button and its own scroll. `footer` holds its main
 * action, pinned under the scroll so it's always in view, like a screen's footer.
 */
export function Sheet({open, onClose, title, subtitle, tall, keepNav, children, actions, footer}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** A line under the title, e.g. which school a board belongs to, or a choice (text with ▾). */
    subtitle?: ReactNode;
    tall?: boolean;
    /** Ends above the screen's bottom bar instead of covering it. */
    keepNav?: boolean;
    children: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
}) {
    const [id] = useState(() => `sheet-${++sheetCount}`);
    // On closing, the last content stays drawn for the exit animation (the caller may have cleared it already).
    const last = useRef({title, subtitle, children, actions, footer});
    if (open) last.current = {title, subtitle, children, actions, footer};
    const leaving = useLeaving(open);
    if (!open && !leaving) return null;
    ({title, subtitle, children, actions, footer} = last.current);
    return (
        <Layer onDismiss={onClose} labelledBy={id} keepNav={keepNav} leaving={!open}>
            <div className={['sheet', tall && 'sheet-tall', footer && 'sheet-has-foot'].filter(Boolean).join(' ')}>
                <div className="sheet-grip" aria-hidden="true"/>
                <div className="sheet-head">
                    <div className="sheet-title">
                        <h2 id={id}>{title}</h2>
                        {subtitle && <span>{subtitle}</span>}
                    </div>
                    {actions}
                    <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
                        <Icon name="close"/>
                    </button>
                </div>
                <div className="sheet-body">{children}</div>
                {footer && <div className="sheet-foot">{footer}</div>}
            </div>
        </Layer>
    );
}

/**
 * A popup that is its own history entry (?sheet=name), so the back gesture closes it instead of
 * leaving the screen. `item` carries which row it's about, e.g. a session id.
 */
export function useSheetRoute(name: string) {
    const router = useRouter();
    const open = router.query.get('sheet') === name;
    return {
        open,
        item: open ? router.query.get('item') : null,
        show: (item?: string) => {
            const params = new URLSearchParams(router.query);
            params.set('sheet', name);
            if (item) params.set('item', item);
            else params.delete('item');
            router.navigate(`${router.path}?${params.toString()}`);
        },
        close: () => {
            const params = new URLSearchParams(router.query);
            params.delete('sheet');
            params.delete('item');
            const rest = params.toString();
            router.back(rest ? `${router.path}?${rest}` : router.path);
        },
    };
}
