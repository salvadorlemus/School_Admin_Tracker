import {useState} from 'react';
import {t} from '../../lib/texts';
import {useRouter} from '../../lib/router';
import {supabase} from '../../lib/supabase';
import {homePath, refreshSession} from '../../live/session';
import {BareScreen} from '../../ui/Screen';
import {Check, TextField} from '../../ui/Fields';

/**
 * Where the password email's link lands: Supabase Auth has signed the person in from the link, and
 * they choose the new password here (one field with "show"), then go on to their home.
 */
export function NewPassword() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState('');
    const ready = password.length >= 8;
    return (
        <BareScreen note={ready ? undefined : t('invite.passwordShort')}
                    footer={<button type="button" className="btn btn-lg" disabled={!ready || busy}
                                    onClick={async () => {
                                        setBusy(true);
                                        const {error} = await supabase.auth.updateUser({password});
                                        setBusy(false);
                                        if (error) return setProblem(error.message);
                                        await refreshSession();
                                        router.replace(homePath());
                                    }}>{t(busy ? 'upload.sending' : 'password.save')}</button>}>
            <h1 className="huge">{t('password.new')}</h1>
            <p className="muted">{t('password.otherDevices')}</p>
            <TextField id="np-pass" label={t('password.new')} type={show ? 'text' : 'password'}
                       autoComplete="new-password"
                       value={password} onChange={event => setPassword(event.target.value)}
                       hint={t('invite.passwordHint')}/>
            <Check id="np-show" label={t('invite.showPassword')} checked={show} onChange={setShow}/>
            {problem &&
                <div className="banner banner-error small" role="alert">{t('live.refused', {reason: problem})}</div>}
        </BareScreen>
    );
}
