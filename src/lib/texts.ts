import es from '../data/texts.es.json';
import en from '../data/texts.en.json';

export type TextKey = keyof typeof es;
export type Language = 'es' | 'en';

export const LANGUAGES: Language[] = ['es', 'en'];

// Spanish is the reference: English must have every one of its keys, or this doesn't compile.
const TEXTS: Record<Language, Record<TextKey, string>> = {es, en};

const STORAGE_KEY = 'asm-language';

/**
 * The language the app opens in, before the person picks one. Their earlier choice is in
 * localStorage under STORAGE_KEY (it can be missing, or throw in a private window); the browser's
 * own languages are in navigator.languages (e.g. ["en-US", "es-MX"]). Spanish is the default.
 */
function pickInitialLanguage(): Language {
    // TODO(owner): decide the order: a saved choice first? then the browser's language? then 'es'?
    return 'es';
}

let current: Language = pickInitialLanguage();
document.documentElement.lang = current;

export function getLanguage(): Language {
    return current;
}

/** Switches the language and remembers it on this device. The caller re-renders (see LanguageProvider). */
export function setLanguage(language: Language): void {
    current = language;
    document.documentElement.lang = language;
    try {
        localStorage.setItem(STORAGE_KEY, language);
    } catch {
        // Private window or blocked storage: the choice lasts until the page is closed.
    }
}

/** A text in the current language, with its {placeholders} filled in. A wrong key doesn't compile. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
    return TEXTS[current][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ''));
}
