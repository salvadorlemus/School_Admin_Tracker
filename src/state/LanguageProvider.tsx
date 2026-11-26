import {createContext, useCallback, useContext, useState, type ReactNode} from 'react';
import {getLanguage, setLanguage, type Language} from '../lib/texts';

interface LanguageState {
    language: Language;
    changeLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageState | null>(null);

/** Holds the current language, so that changing it re-renders every t() call below it. */
export function LanguageProvider({children}: { children: ReactNode }) {
    const [language, setState] = useState<Language>(getLanguage);
    const changeLanguage = useCallback((next: Language) => {
        setLanguage(next);
        setState(next);
    }, []);
    return (
        <LanguageContext.Provider value={{language, changeLanguage}}>
            {/* The key remounts the tree, so components that kept a text in state show the new language. */}
            <div key={language} className="contents">{children}</div>
        </LanguageContext.Provider>
    );
}

export function useLanguage(): LanguageState {
    const state = useContext(LanguageContext);
    if (!state) throw new Error('useLanguage must be used inside <LanguageProvider>.');
    return state;
}
