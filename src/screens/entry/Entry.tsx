import {isAdminPath, onAdminHost, onAppHost} from '../../lib/hosts';
import {homePath, signIn} from '../../live/session';
import {useEffect, useState} from 'react';
import {supabase} from '../../lib/supabase';
import {LANGUAGES, t, type TextKey} from '../../lib/texts';
import {useRouter} from '../../lib/router';
import {acceptTerms, TERMS_STATE} from '../../mock/changes';
import {useLanguage} from '../../state/LanguageProvider';
import {SCHOOLS, studentById} from '../../mock/data';
import {BareScreen} from '../../ui/Screen';
import {Check, EmailField, Segmented, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {useConfirm} from '../../ui/Layers';
import {initialPeople, PeopleEditor, useCardForm, type Kid, type Person} from '../shared/CardForm';
import {DoneMessage, SchoolLogo} from '../shared/pieces';
import {useStaffCard} from '../teacher/StaffCard';

/**
 * Everything before the app opens: sign in, the invites (adult student, a guardian with one or
 * more children, a teacher), registration, new terms, a disabled school, the deletion link.
 */

function LanguageSwitch() {
    const {language, changeLanguage} = useLanguage();
    return (
        <Segmented label={t('language.label')} value={language}
                   options={LANGUAGES.map(code => ({value: code, label: code.toUpperCase()}))}
                   onChange={changeLanguage}/>
    );
}

function BackButton({to}: { to: string }) {
    const router = useRouter();
    return (
        <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={() => router.back(to)}>
            <Icon name="back"/>
        </button>
    );
}

export function SignIn() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const shortcuts: [string, string, string][] = [
        ['/s/home', 'Sofía Ramírez', t('proto.student')],
        ['/g/home', 'Daniela Vega', t('proto.guardian')],
        ['/t/schedule', 'Mariana Alvarez', t('proto.teacher')],
        ['/d/home', 'Ana Torres', t('proto.director')],
        ['/a/schools', t('proto.adminName'), t('proto.admin')],
    ];
    const flows: [string, string][] = [
        ['/invite', t('proto.flowInvite')],
        ['/invite/minor', t('proto.flowInviteMinor')],
        ['/invite/teacher', t('proto.flowInviteTeacher')],
        ['/invite/director', t('proto.flowInviteDirector')],
        ['/a/schools/new', t('proto.flowNewSchool')],
        ['/terms-new', t('proto.flowTerms')],
        ['/disabled', t('proto.flowDisabled')],
        ['/delete-link', t('proto.flowDelete')],
    ];
    const row = ([path, title, sub]: string[]) => (
        <li key={path}>
            <button type="button" className="list-row" onClick={() => router.navigate(path)}>
                <span className="grow"><span className="list-row-title">{title}</span>{sub &&
                    <span className="list-row-sub">{sub}</span>}</span>
                <span className="chev"><Icon name="chevron" size={18}/></span>
            </button>
        </li>
    );
    return (
        <BareScreen>
            <div className="row">
                <span className="brand"><span className="brand-name">{t('app.name')}</span><span className="small muted">{t('app.tagline')}</span></span>
                <div className="lang-switch"><LanguageSwitch/></div>
            </div>
            <h1 className="huge">{t('signIn.title')}</h1>
            <form className="stack" onSubmit={async event => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setBusy(true);
                const problem = await signIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
                setBusy(false);
                if (problem) setError(t('signIn.wrong'));
                else if (homePath() === '/') setError(t(onAdminHost() ? 'signIn.notAdmin' : 'signIn.noSchool'));
                else router.replace(homePath());
            }}>
                <EmailField id="signin-email" name="email" label={t('signIn.email')}/>
                <TextField id="signin-password" name="password" label={t('signIn.password')} type="password" autoComplete="current-password"/>
                {error && <div className="banner banner-error small" role="alert">{error}</div>}
                <button type="submit" className="btn btn-lg" disabled={busy}>{t(busy ? 'signIn.busy' : 'signIn.submit')}</button>
                <button type="button" className="btn btn-ghost">{t('signIn.forgot')}</button>
            </form>
            <p className="hint">{t('proto.liveHint')}</p>
            <h2 className="section-title">{t('proto.shortcuts')}</h2>
            <ul className="list">{shortcuts.filter(([path]) => onAdminHost() ? isAdminPath(path) : !onAppHost() || !isAdminPath(path)).map(row)}</ul>
            <h2 className="section-title">{t('proto.flows')}</h2>
            <ul className="list">{flows.map(([path, label]) => row([path, label, '']))}</ul>
            <p className="hint">{t('proto.note')}</p>
            <p className="version">{t('app.version', {version: __APP_VERSION__})}</p>
        </BareScreen>
    );
}

type InviteKind = 'adult' | 'minor' | 'teacher' | 'director';

/** The two children Rosa Paz registers in the sample: their shared people are entered once. */
const SIBLINGS: Kid[] = [{id: 'lucas', name: 'Lucas Medina Paz'}, {id: 'emma', name: 'Emma Medina Paz'}];

/** How many steps each invite has: the account, then the card (the family, then each child), then the terms. */
const STEPS: Record<InviteKind, number> = {adult: 3, minor: 4, teacher: 2, director: 2};

/** The name the school registered, so the card starts with it filled in. */
const INVITED: Record<InviteKind, { name: string; email: string }> = {
    adult: {name: 'Julia Paredes', email: 'julia.paredes@correo.mx'},
    minor: {name: 'Rosa Paz', email: 'rosa.paz@correo.mx'},
    teacher: {name: 'Sergio Luna', email: 'sergio.luna@correo.mx'},
    director: {name: 'Rosa Elena Garza', email: 'rosa.garza@aereodelsur.mx'},
};

/** The school a new director was invited to run: just created by the admin, still empty. */
const NEW_SCHOOL = 'Estudio Aéreo del Sur';

/**
 * The page the invite email opens: who invited them and what's ahead, and the password, in one
 * step. Nothing is used up until they press Continue, so a mail scanner opening the link doesn't
 * spend it. One password field with "show", instead of typing it twice.
 */
export function InviteLanding({kind}: { kind: InviteKind }) {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const school = kind === 'director' ? NEW_SCHOOL : SCHOOLS.colibri.name;
    const title = {adult: t('invite.title'), minor: t('invite.titleGuardian'), teacher: t('invite.titleTeacher'), director: t('invite.titleDirector')}[kind];
    const body = {
        adult: t('invite.body', {school}),
        minor: t('invite.bodyGuardian', {school, names: 'Lucas y Emma Medina Paz'}),
        teacher: t('invite.bodyTeacher', {school}),
        director: t('invite.bodyDirector', {school}),
    }[kind];
    const steps = {
        adult: [t('invite.step2'), t('invite.step3')],
        minor: [t('invite.stepFamily'), t('invite.stepKids'), t('invite.step3')],
        teacher: [t('invite.stepStaff')],
        director: [t('invite.stepStaff'), t('invite.stepSetup')],
    }[kind];
    const next = {adult: '/invite/card', minor: '/invite/minor/family', teacher: '/invite/teacher/card', director: '/invite/director/card'}[kind];
    const ready = password.length >= 8;
    return (
        <BareScreen note={ready ? t('invite.expires') : t('invite.passwordShort')}
                    footer={<button type="button" className="btn btn-lg" disabled={!ready}
                                    onClick={() => router.navigate(next)}>{t('common.continue')}</button>}>
            <BackButton to="/"/>
            <p className="small muted row-start align-center" ><SchoolLogo school="colibri" size="md"/>{t('invite.step', {at: 1, of: STEPS[kind]})} · {school}</p>
            <h1 className="huge">{title}</h1>
            <p>{body}</p>
            <EmailField id="inv-email" label={t('signIn.email')} defaultValue={INVITED[kind].email} readOnly
                        hint={t('invite.emailFixed')}/>
            <TextField id="inv-pass" label={t('invite.passwordTitle')} type={show ? 'text' : 'password'} autoComplete="new-password"
                       value={password} onChange={event => setPassword(event.target.value)}/>
            <Check id="inv-show" label={t('invite.showPassword')} checked={show} onChange={setShow}/>
            <h2 className="section-title">{t('invite.then')}</h2>
            <ol className="stack plain-list gap-xs" >
                {steps.map(step => <li key={step}>{step}</li>)}
            </ol>
        </BareScreen>
    );
}

export function InviteCard() {
    const router = useRouter();
    const [people, setPeople] = useState<Person[]>(() => initialPeople(undefined, []));
    const form = useCardForm({
        minor: false,
        mode: 'register',
        ownPhone: '',
        onSave: () => router.navigate('/invite/terms'),
        defaultName: INVITED.adult.name,
        people,
        setPeople,
        kids: []
    });
    return (
        <BareScreen footer={form.footer}>
            <BackButton to="/invite"/>
            <p className="small muted">{t('invite.step', {at: 2, of: STEPS.adult})}</p>
            <h1 className="huge">{t('invite.cardTitle')}</h1>
            <p className="muted">{t('invite.cardBody')}</p>
            {form.body}
        </BareScreen>
    );
}

/**
 * A guardian with several children: first the people they share (emergency contacts and who can
 * pick them up), entered once; then each child's own part (photo, birth date, health).
 */
export function InviteFamily() {
    const router = useRouter();
    const [people, setPeople] = useState<Person[]>([]);
    const ready = people.some(person => person.emergency);
    return (
        <BareScreen note={ready ? undefined : t('invite.familyNeed')}
                    footer={<button type="button" className="btn btn-lg" disabled={!ready}
                                    onClick={() => router.navigate('/invite/minor/child/lucas')}>{t('common.continue')}</button>}>
            <BackButton to="/invite/minor"/>
            <p className="small muted">{t('invite.step', {at: 2, of: STEPS.minor})}</p>
            <h1 className="huge">{t('invite.familyTitle')}</h1>
            <p className="muted">{t('invite.familyBody', {names: 'Lucas y Emma'})}</p>
            <PeopleEditor people={people} setPeople={setPeople} minor kids={SIBLINGS} mode="register"/>
        </BareScreen>
    );
}

export function InviteChild({id}: { id: string }) {
    const router = useRouter();
    const index = SIBLINGS.findIndex(kid => kid.id === id);
    const kid = SIBLINGS[Math.max(0, index)];
    const next = SIBLINGS[index + 1];
    const [people, setPeople] = useState<Person[]>([]);
    const form = useCardForm({
        minor: true, mode: 'register', people, setPeople, kids: [], showPeople: false, defaultName: kid.name,
        button: next ? t('invite.nextChild', {name: next.name.split(' ')[0]}) : t('common.continue'),
        onSave: () => router.navigate(next ? `/invite/minor/child/${next.id}` : '/invite/minor/terms'),
    });
    return (
        <BareScreen footer={form.footer}>
            <BackButton to="/invite/minor/family"/>
            <p className="small muted">{t('invite.step', {at: 3, of: STEPS.minor})} · {t('invite.childOf', {
                at: index + 1,
                of: SIBLINGS.length
            })}</p>
            <h1 className="huge">{t('invite.cardTitleGuardian', {name: kid.name.split(' ')[0]})}</h1>
            <div className="banner small">{t('invite.familyDone')}</div>
            {form.body}
        </BareScreen>
    );
}

export function InviteTeacherCard({kind = 'teacher'}: { kind?: 'teacher' | 'director' }) {
    const router = useRouter();
    const card = useStaffCard({name: INVITED[kind].name, phone: '', emergency: [], register: true});
    return (
        <BareScreen note={card.missing.length ? t('activity.missing', {list: card.missing.join(', ')}) : undefined}
                    footer={<button type="button" className="btn btn-lg" disabled={card.missing.length > 0}
                                    onClick={() => router.replace(`/invite/${kind}/done`)}>{t('common.continue')}</button>}>
            <BackButton to={`/invite/${kind}`}/>
            <p className="small muted">{t('invite.step', {at: 2, of: STEPS[kind]})}</p>
            <h1 className="huge">{t('staff.myCard')}</h1>
            {card.body}
        </BareScreen>
    );
}

const TERMS_PAGES = 5;

/**
 * The terms PDF inside the app. The progress bar fills as the person scrolls; under it, the page
 * they're on, and "you read to the end" once they reach the last page, which turns the button on.
 */
export function TermsReader({mode}: { mode: 'invite' | 'invite-minor' | 'new' }) {
    const router = useRouter();
    const [progress, setProgress] = useState(0);
    const [reached, setReached] = useState(false);
    const page = Math.min(TERMS_PAGES, Math.floor(progress * TERMS_PAGES) + 1);
    const next = mode === 'new' ? '/s/home' : mode === 'invite' ? '/invite/done' : '/invite/minor/done';
    return (
        <div className="screen screen-no-bottom">
            <header className="topbar">
                <button type="button" className="icon-btn" aria-label={t('common.back')}
                        onClick={() => router.back('/')}>
                    <Icon name="back"/>
                </button>
                <div className="topbar-title">
                    <h1>{t(mode === 'new' ? 'terms.newTitle' : 'terms.title')}</h1>
                    <span>{mode === 'new' ? '' : `${t('invite.step', {at: STEPS[mode === 'invite' ? 'adult' : 'minor'], of: STEPS[mode === 'invite' ? 'adult' : 'minor']})} · `}{SCHOOLS.colibri.name} · {t('terms.version', {n: TERMS_STATE.version})}</span>
                </div>
            </header>
            <div className="stack-sm reader-head">
                {mode === 'new' && <p className="small">{t('terms.newBody')}</p>}
                {mode === 'invite-minor' && <p className="small">{t('terms.forKids', {names: 'Lucas y Emma'})}</p>}
                <div className="progress" role="progressbar" aria-label={t('terms.progress')}
                     aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                    <span style={{width: `${Math.round(progress * 100)}%`}}/>
                </div>
                <p className={reached ? 'small strong text-confirmed' : 'small muted'} aria-live="polite">
                    {reached ? <><Icon name="check" size={14}/> {t('terms.reached')}</> : t('terms.page', {
                        at: page,
                        of: TERMS_PAGES
                    })}
                </p>
            </div>
            <div className="pdf" tabIndex={0} aria-label={t('terms.document')} onScroll={event => {
                const element = event.currentTarget;
                const max = element.scrollHeight - element.clientHeight;
                const value = max <= 0 ? 1 : element.scrollTop / max;
                setProgress(value);
                if (value > 0.98) setReached(true);
            }}>
                {Array.from({length: TERMS_PAGES}, (_, index) => (
                    <section key={index} className="pdf-page">
                        <h3>{t('terms.sample.heading', {n: index + 1})}</h3>
                        <p>{t('terms.sample.p1')}</p>
                        <p>{t('terms.sample.p2')}</p>
                        {index === 2 && <p><strong>{t('terms.sample.health')}</strong></p>}
                        <p>{t('terms.sample.p3')}</p>
                        <span className="pdf-foot">{t('terms.page', {at: index + 1, of: TERMS_PAGES})}</span>
                    </section>
                ))}
            </div>
            <div className="footer">
                {!reached && <p className="hint center">{t('terms.readFirst')}</p>}
                <button type="button" className="btn btn-lg" disabled={!reached} onClick={() => {
                    // Sofía, for the new version; a new student's acceptance counts once they're registered.
                    if (mode === 'new') acceptTerms(studentById('sofia').name);
                    router.replace(next);
                }}>
                    {t('terms.accept')}
                </button>
            </div>
        </div>
    );
}

export function InviteDone({kind}: { kind: InviteKind }) {
    const router = useRouter();
    const home = {adult: '/s/home', minor: '/g/home', teacher: '/t/schedule', director: '/d/home'}[kind];
    const body = {
        adult: t('invite.doneBody', {school: SCHOOLS.colibri.name}),
        minor: t('invite.doneBodyGuardian', {school: SCHOOLS.colibri.name, names: 'Lucas y Emma'}),
        teacher: t('invite.doneBodyTeacher', {school: SCHOOLS.colibri.name}),
        director: t('invite.doneBodyDirector', {school: NEW_SCHOOL}),
    }[kind];
    // The main next step: students choose classes; a new director prepares the school.
    const first = {adult: '/s/classes', minor: '/g/classes', teacher: '', director: '/d/setup?new=1'}[kind];
    const firstLabel = kind === 'director' ? t('invite.setUpSchool') : t('invite.pickClasses');
    return (
        <BareScreen footer={<>
            {first && (
                <button type="button" className="btn btn-lg" onClick={() => router.leave(Infinity, first)}>{firstLabel}</button>
            )}
            <button type="button" className={first ? 'btn btn-secondary btn-lg' : 'btn btn-lg'}
                    onClick={() => router.leave(Infinity, home)}>{t(kind === 'teacher' ? 'invite.openSchedule' : 'invite.open')}</button>
        </>}>
            <DoneMessage title={t('invite.doneTitle')} body={body}/>
        </BareScreen>
    );
}

export function SchoolDisabled() {
    const router = useRouter();
    return (
        <BareScreen footer={<button type="button" className="btn btn-secondary btn-lg"
                                    onClick={() => router.navigate('/')}>{t('account.signOut')}</button>}>
            <div className="done">
                <span className="avatar avatar-lg"><Icon name="school" size={40}/></span>
                <h1 className="huge">{t('disabled.title')}</h1>
                <p>{t('disabled.body', {school: 'Casa Pirueta'})}</p>
            </div>
        </BareScreen>
    );
}

/**
 * The panel the data-deletion email opens: what will be deleted and what stays. The button turns
 * on with the checkbox, and asks once more before deleting.
 */
export function DeleteLink() {
    const router = useRouter();
    const confirm = useConfirm();
    const [sure, setSure] = useState(false);
    const [done, setDone] = useState(false);
    if (done) {
        return (
            <BareScreen footer={<button type="button" className="btn btn-lg"
                                        onClick={() => router.navigate('/s/home')}>{t('common.done')}</button>}>
                <DoneMessage icon="heart" title={t('delete.doneTitle')} body={
                                                                             <div className="stack">
                                                                                <p>{t('delete.doneBody', {school: SCHOOLS.ambar.name})}</p>
                                                                                <p className="strong text-default">{t('delete.sorry', {school: SCHOOLS.ambar.name})}</p>
                                                                            </div>
                                                                        }/>
            </BareScreen>
        );
    }
    return (
        <BareScreen note={sure ? undefined : t('delete.tickFirst')} footer={
                                                                        <button type="button"
                                                                                className="btn btn-danger btn-lg"
                                                                                disabled={!sure} onClick={async () => {
                                                                            if (await confirm({
                                                                                title: t('delete.confirmTitle', {school: SCHOOLS.ambar.name}),
                                                                                body: t('delete.confirmBody'),
                                                                                confirm: t('delete.confirmButton'),
                                                                                danger: true,
                                                                            })) setDone(true);
                                                                        }}>{t('delete.button')}</button>
                                                                    }>
            <BackButton to="/"/>
            <span className="chip chip-outline">{SCHOOLS.ambar.name}</span>
            <h1 className="huge">{t('delete.panelTitle')}</h1>
            <div className="card">
                <span className="strong">{t('delete.goes')}</span>
                <ul className="small plain-list" >
                    <li>{t('delete.goes1')}</li>
                    <li>{t('delete.goes2')}</li>
                    <li>{t('delete.goes3')}</li>
                </ul>
            </div>
            <div className="card">
                <span className="strong">{t('delete.stays')}</span>
                <p className="small">{t('delete.staysBody')}</p>
            </div>
            <p className="small">{t('delete.otherSchools', {school: SCHOOLS.colibri.name})}</p>
            <Check id="del-sure" label={t('delete.check', {school: SCHOOLS.ambar.name})} checked={sure}
                   onChange={setSure}/>
        </BareScreen>
    );
}

/**
 * The invitation link from the email (#/invite/{token}). It shows who invited them and to which school
 * without using the link up (a mail scanner opening it spends nothing); Continue creates their login
 * with the password, or checks the one they already have, then signs them in. The page reads the
 * same whether the person was new or not.
 */
export function JoinWithLink({token}: { token: string }) {
    const router = useRouter();
    const [peek, setPeek] = useState<{ school: string; inviter: string | null; role: string; name: string; email: string } | null>(null);
    const [problem, setProblem] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const call = async (body: Record<string, unknown>) => {
        const {data, error} = await supabase.functions.invoke('accept-invite', {body: {token, ...body}});
        if (!error) return data as Record<string, unknown>;
        const reply = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null;
        throw new Error(reply?.error ?? 'error');
    };
    useEffect(() => {
        call({peek: true}).then(data => setPeek(data as unknown as NonNullable<typeof peek>)).catch((reason: Error) => setProblem(reason.message));
    }, [token]);
    const errorText = (key: string) => t(({expired: 'join.expired', used: 'join.used', cancelled: 'join.cancelled', password_short: 'join.passwordShort',
        password_existing: 'join.passwordExisting', link: 'join.badLink'} as Record<string, TextKey>)[key] ?? 'join.error');
    return (
        <BareScreen>
            <div className="row">
                <span className="brand"><span className="brand-name">{t('app.name')}</span><span className="small muted">{t('app.tagline')}</span></span>
                <div className="lang-switch"><LanguageSwitch/></div>
            </div>
            {!peek && !problem && <p className="muted">{t('join.loading')}</p>}
            {problem && !peek && <div className="banner banner-error">{errorText(problem)}</div>}
            {peek && (
                <form className="stack" onSubmit={async event => {
                    event.preventDefault();
                    setBusy(true);
                    setProblem('');
                    try {
                        await call({password});
                        const failed = await signIn(peek.email, password);
                        if (failed) throw new Error('error');
                        router.replace(homePath());
                    } catch (reason) {
                        setProblem((reason as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}>
                    <h1 className="huge">{t('join.title', {school: peek.school})}</h1>
                    <p>{t('join.body', {inviter: peek.inviter ?? peek.school, role: t(`join.role.${peek.role}` as TextKey)})}</p>
                    <p className="small muted">{peek.email}</p>
                    <TextField id="join-password" label={t('join.password')} type={show ? 'text' : 'password'} autoComplete="new-password"
                               value={password} onChange={event => setPassword(event.target.value)} hint={t('join.passwordHint')}/>
                    <Check id="join-show" label={t('join.show')} checked={show} onChange={setShow}/>
                    {problem && <div className="banner banner-error small" role="alert">{errorText(problem)}</div>}
                    <button type="submit" className="btn btn-lg" disabled={busy || password.length < 8}>{t(busy ? 'signIn.busy' : 'join.continue')}</button>
                </form>
            )}
        </BareScreen>
    );
}
