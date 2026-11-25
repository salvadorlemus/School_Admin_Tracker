/**
 * The colour theme: the phone's setting (automatic), light or dark. Kept in this browser only
 * (a per-person convenience), and applied as `data-theme` on <html>, which the stylesheet reads.
 */

export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'theme';

export function storedTheme(): Theme {
    try {
        const value = localStorage.getItem(KEY);
        return value === 'light' || value === 'dark' ? value : 'auto';
    } catch {
        return 'auto';
    }
}

export function applyTheme(theme: Theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
        if (theme === 'auto') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, theme);
    } catch {
        // Storage blocked (private window): the choice lasts until the page is closed.
    }
}
