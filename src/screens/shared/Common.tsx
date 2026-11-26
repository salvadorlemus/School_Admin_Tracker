import {sendPasswordLink} from '../../live/cards';
import {LIVE} from '../../live/state';
import {signOut} from '../../live/session';
import {LANGUAGES, t} from '../../lib/texts';
import {useRouter} from '../../lib/router';
import {useState} from 'react';
import {useLanguage} from '../../state/LanguageProvider';
import {applyTheme, storedTheme, type Theme} from '../../state/theme';
import {Segmented} from '../../ui/Fields';
import {Icon, type IconName} from '../../ui/Icon';
import {useConfirm, useToast} from '../../ui/Layers';

/** Pieces every role's Account uses: language, the password email, sign out, a row that opens a screen. */

export function LanguageRow() {
    const {language, changeLanguage} = useLanguage();
    return (
        <div className="card">
            <span className="strong">{t('language.label')}</span>
            <Segmented label={t('language.label')} value={language}
                       options={LANGUAGES.map(code => ({
                           value: code,
                           label: t(code === 'es' ? 'language.es' : 'language.en')
                       }))}
                       onChange={changeLanguage}/>
        </div>
    );
}

/** The colour theme: the phone's setting, light or dark. */
export function ThemeRow() {
    const [theme, setTheme] = useState<Theme>(storedTheme);
    return (
        <div className="card">
            <span className="strong">{t('theme.label')}</span>
            <Segmented label={t('theme.label')} value={theme}
                       options={[{value: 'auto', label: t('theme.auto')}, {value: 'light', label: t('theme.light')}, {value: 'dark', label: t('theme.dark')}]}
                       onChange={value => {
                           const next = value as Theme;
                           setTheme(next);
                           applyTheme(next);
                       }}/>
        </div>
    );
}

/**
 * Changing the password happens from an email, not inside the app: the app asks first, then
 * sends the link to the registered address.
 */
export function PasswordRow({email}: { email: string }) {
    const confirm = useConfirm();
    const toast = useToast();
    return (
        <li>
            <button type="button" className="list-row" onClick={async () => {
                if (await confirm({
                    title: t('password.confirmTitle'),
                    body: t('password.confirmBody', {email}),
                    confirm: t('password.send'),
                })) {
                    const problem = LIVE.on ? await sendPasswordLink(email) : null;
                    toast(problem ? t('live.refused', {reason: problem}) : t('password.sent'));
                }
            }}>
                <span className="muted"><Icon name="mail"/></span>
                <span className="grow">
                    <span className="list-row-title">{t('password.title')}</span>
                    <span className="list-row-sub">{t('password.byEmail')}</span>
                </span>
                <span className="chev"><Icon name="chevron" size={18}/></span>
            </button>
        </li>
    );
}

export function SignOutButton() {
    const router = useRouter();
    return (
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => LIVE.on ? void signOut() : router.navigate('/')}>
            <Icon name="logout"/>{t('account.signOut')}
        </button>
    );
}

/** A row that opens another screen. */
export function NavRow({label, sub, to, icon}: { label: string; sub?: string; to: string; icon?: IconName }) {
    const router = useRouter();
    return (
        <li>
            <button type="button" className="list-row" onClick={() => router.navigate(to)}>
                {icon && <span className="muted"><Icon name={icon}/></span>}
                <span className="grow">
                    <span className="list-row-title">{label}</span>
                    {sub && <span className="list-row-sub">{sub}</span>}
                </span>
                <span className="chev"><Icon name="chevron" size={18}/></span>
            </button>
        </li>
    );
}

/** Lyra's terms and privacy notice, from every Account. */
export function LegalRow() {
    return <ul className="list"><NavRow label={t('legal.link')} sub={t('legal.rowSub')} to="/legal" icon="file"/></ul>;
}
