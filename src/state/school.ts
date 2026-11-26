import {useSyncExternalStore} from 'react';
import type {SchoolId} from '../mock/data';

/**
 * The school a teacher or director is working in right now. Staff in several schools switch it
 * from the top bar; everything they see (schedule, students, payments, notices) is that school's.
 * Students and guardians never pick one: they see all their schools together.
 */

let current: SchoolId = 'helios';
const listeners = new Set<() => void>();

/** The current school, for code outside a component (every screen is redrawn when it changes). */
export const currentSchool = (): SchoolId => current;

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
