import {useSyncExternalStore} from 'react';
import type {SchoolId} from '../mock/data';

/**
 * The school a teacher or director is working in right now. Staff in several schools switch it
 * from the top bar; everything they see (schedule, students, payments, notices) is that school's.
 * Students and guardians never pick one: they see all their schools together.
 */

let current: SchoolId = 'colibri';
const listeners = new Set<() => void>();

export function setCurrentSchool(school: SchoolId): void {
    current = school;
    listeners.forEach(listener => listener());
}

export function useCurrentSchool(): SchoolId {
    return useSyncExternalStore(
        listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => current,
    );
}
