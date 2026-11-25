import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';

/**
 * A small hash router. Every screen and popup is its own browser history entry, so the phone's
 * back gesture, the browser's back button and the app's own back arrows all go to the page the
 * person came from. Each entry has a key, which the scroll memory (below) uses to put a screen
 * back where it was.
 *
 * Inside some embedded frames the history API is refused; the router then keeps its own stack in
 * memory and everything behaves the same, except the browser's own buttons.
 */

interface Entry {
    key: string;
    index: number;
    url: string; // path plus query, e.g. "/d/calendar?tab=plan"
    /** The page it was opened from, unless it was opened from the bottom bar. */
    from?: string;
}

export interface RouterState {
    path: string;
    query: URLSearchParams;
    key: string;
    /** Opens a screen (a new history entry). `tab`: opened from the bottom bar, so there's no way back. */
    navigate: (url: string, options?: { tab?: boolean }) => void;
    /** Where the current page was opened from (not set for bottom-bar tabs). */
    from?: string;
    /** Changes the current entry without adding one (tabs, filters). */
    replace: (url: string) => void;
    /** Goes to the previous entry; with no previous one (a link opened directly), to `fallback`. */
    back: (fallback: string) => void;
    /**
     * Leaves a finished flow: drops the last `steps` entries and shows `url` in place of the one
     * before them, so back never goes into a form that was already sent.
     */
    leave: (steps: number, url: string) => void;
    /** The current URL with one query value set or removed. */
    withQuery: (name: string, value: string | null) => string;
}

const RouterContext = createContext<RouterState | null>(null);

let counter = 0;
const newKey = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function urlFromHash(): string {
    const hash = window.location.hash.slice(1);
    return hash.startsWith('/') ? hash : '/';
}

function isEntry(value: unknown): value is Entry {
    return typeof value === 'object' && value !== null && 'key' in value && 'index' in value && 'url' in value;
}

export function RouterProvider({children}: { children: ReactNode }) {
    const [memory] = useState<{ stack: Entry[] | null }>(() => ({stack: null}));
    const [entry, setEntry] = useState<Entry>(() => {
        const first: Entry = {key: newKey(), index: 0, url: urlFromHash()};
        if (isEntry(window.history.state) && window.history.state.url === first.url) return window.history.state;
        try {
            window.history.replaceState(first, '', `#${first.url}`);
        } catch {
            memory.stack = [first];
        }
        return first;
    });

    // Where leave() lands once the browser has gone back.
    const leaving = useRef<string | null>(null);

    useEffect(() => {
        const onPop = (event: PopStateEvent) => {
            const url = leaving.current;
            leaving.current = null;
            if (url) {
                // An entry the router didn't write (a hash typed by hand) has no state of its own.
                const next: Entry = isEntry(event.state) ? {...event.state, url} : {key: newKey(), index: 0, url};
                window.history.replaceState(next, '', `#${url}`);
                setEntry(next);
            } else if (isEntry(event.state)) setEntry(event.state);
            else setEntry({key: newKey(), index: 0, url: urlFromHash()});
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // The updaters below run side effects (pushState), so they read the entry from a ref instead of
    // a state updater, which React may call twice.
    const current = useRef(entry);
    current.current = entry;

    const navigate = useCallback((url: string, options?: { tab?: boolean }) => {
        const now = current.current;
        const next: Entry = {key: newKey(), index: now.index + 1, url, from: options?.tab ? undefined : now.url};
        if (memory.stack) {
            memory.stack = [...memory.stack.slice(0, now.index + 1), next];
        } else {
            try {
                window.history.pushState(next, '', `#${url}`);
            } catch {
                memory.stack = [now, next];
            }
        }
        setEntry(next);
    }, [memory]);

    const replace = useCallback((url: string) => {
        const next: Entry = {...current.current, url};
        if (memory.stack) memory.stack[next.index] = next;
        else window.history.replaceState(next, '', `#${url}`);
        setEntry(next);
    }, [memory]);

    const back = useCallback((fallback: string) => {
        const now = current.current;
        if (now.index === 0) {
            replace(fallback);
        } else if (memory.stack) {
            setEntry(memory.stack[now.index - 1] ?? {key: newKey(), index: 0, url: fallback});
        } else {
            window.history.back();
        }
    }, [memory, replace]);

    const leave = useCallback((steps: number, url: string) => {
        const now = current.current;
        const count = Math.min(steps, now.index);
        if (count === 0) {
            replace(url);
        } else if (memory.stack) {
            const target = memory.stack[now.index - count];
            const next: Entry = {...target, url};
            memory.stack = [...memory.stack.slice(0, next.index), next];
            setEntry(next);
        } else {
            leaving.current = url;
            window.history.go(-count);
            // Some browsers ignore go() when the entries it needs aren't there (e.g. after a reload
            // restored a different history): show the page in place instead of doing nothing.
            window.setTimeout(() => {
                if (leaving.current !== url) return;
                leaving.current = null;
                replace(url);
            }, 400);
        }
    }, [memory, replace]);

    const state = useMemo<RouterState>(() => {
        const [path, search = ''] = entry.url.split('?');
        const query = new URLSearchParams(search);
        const withQuery = (name: string, value: string | null) => {
            const next = new URLSearchParams(search);
            if (value === null) next.delete(name);
            else next.set(name, value);
            const text = next.toString();
            return text ? `${path}?${text}` : path;
        };
        return {path, query, key: entry.key, from: entry.from, navigate, replace, back, leave, withQuery};
    }, [entry, navigate, replace, back, leave]);

    return <RouterContext.Provider value={state}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterState {
    const state = useContext(RouterContext);
    if (!state) throw new Error('useRouter must be used inside <RouterProvider>.');
    return state;
}

/** Matches "/d/students/:id" against a path; returns the params, or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
    const a = pattern.split('/');
    const b = path.split('/');
    if (a.length !== b.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) return null;
    }
    return params;
}

// ---- Scroll memory ----

/** Scroll position per history entry: going back puts the screen where it was left. */
const byEntry = new Map<string, number>();
/** Last position per path, for the bottom-bar screens: reopening a tab keeps its place too. */
const byPath = new Map<string, number>();

export function rememberScroll(key: string, path: string, top: number): void {
    byEntry.set(key, top);
    byPath.set(path, top);
}

export function recallScroll(key: string, path: string, isTab: boolean): number {
    return byEntry.get(key) ?? (isTab ? byPath.get(path) ?? 0 : 0);
}
