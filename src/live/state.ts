import {useSyncExternalStore} from 'react';
import type {Student} from '../mock/data';

/**
 * Whether the app is showing the real database (someone signed in) or the prototype's invented
 * data. While the screens move over, the live data is loaded into the same shapes the prototype
 * uses (src/live/load.ts), so every screen reads it the same way.
 */
export const LIVE = {
    on: false,
    /** The signed-in person (their `person` row) and login. */
    person: '',
    email: '',
    admin: false,
};

/** Every student the signed-in person may see, at all their schools. */
export const LIVE_STUDENTS: Student[] = [];

let version = 0;
const listeners = new Set<() => void>();

/** Called after the live data is (re)loaded: the screens redraw with it. */
export function liveChanged() {
    version += 1;
    listeners.forEach(listener => listener());
}

export function useLiveVersion(): number {
    return useSyncExternalStore(listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, () => version);
}
