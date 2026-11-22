import {LANGUAGES, t} from './lib/texts';
import {useLanguage} from './state/LanguageProvider';

/** A placeholder until the sign-in screen: it shows the texts and the language switch working. */
export default function App() {
    const {language, changeLanguage} = useLanguage();
    return (
        <main style={{maxWidth: 480, margin: '0 auto', padding: '32px var(--gutter)'}}>
            <div role="group" aria-label={t('language.label')} style={{display: 'flex', gap: 8}}>
                {LANGUAGES.map(code => (
                    <button key={code} type="button" aria-pressed={code === language}
                            onClick={() => changeLanguage(code)} style={{minHeight: 44, padding: '0 14px'}}>
                        {t(code === 'es' ? 'language.es' : 'language.en')}
                    </button>
                ))}
            </div>
            <h1>{t('app.welcome')}</h1>
            <p style={{color: 'var(--color-muted)'}}>{t('app.setupDone')}</p>
        </main>
    );
}
