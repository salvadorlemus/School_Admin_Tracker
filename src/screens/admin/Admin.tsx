import {useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, dayShort, decimal, money, monthInSentence, monthShort, monthYear, personName, time} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {Screen} from '../../ui/Screen';
import {DateField, EmailField, ListRow, MoneyField, PhotoPicker, SearchField, SelectField, TextArea, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {useConfirm, useToast} from '../../ui/Layers';
import {DoneMessage, SchoolLogo} from '../shared/pieces';
import {SCHOOL_LOGOS, STRESS} from '../../mock/data';
import {LanguageRow, PasswordRow, SignOutButton, ThemeRow} from '../shared/Common';

/** The platform admin panel: schools, their billing, usage counts. Never a school's students or records. */

const SCHOOL_ROWS = [
    {
        id: 'colibri',
        name: 'Taller de Arte Colibrí',
        enabled: true,
        billing: 'ok' as const,
        students: 58,
        teachers: 6,
        classes: 10,
        checkins: 412,
        storage: 1.8,
        active: 61,
        lastActivity: '2026-11-26',
        directors: [
            {name: 'Ana Torres', phone: '55 3456 7890', email: 'ana.torres@correo.mx'},
            {name: 'Pablo Méndez', phone: '55 6543 2109', email: 'pablo.mendez@correo.mx'},
        ],
        fee: 1500
    },
    {
        id: 'ambar',
        name: 'Estudio Ámbar',
        enabled: true,
        billing: 'soon' as const,
        students: 31,
        teachers: 3,
        classes: 5,
        checkins: 198,
        storage: 0.6,
        active: 30,
        lastActivity: '2026-11-25',
        directors: [{name: 'Irene Castañeda', phone: '33 1122 3344', email: 'irene@estudioambar.mx'}],
        fee: 1000
    },
    {
        id: 'pigmento',
        name: 'Casa Pigmento',
        enabled: false,
        billing: 'late' as const,
        students: 22,
        teachers: 2,
        classes: 4,
        checkins: 0,
        storage: 0.4,
        active: 0,
        lastActivity: '2026-10-14',
        directors: [{name: 'Julián Ortega', phone: '81 5566 7788', email: 'julian@casapigmento.mx'}],
        fee: 1000
    },
];

if (STRESS) {
    const names = ['Academia Internacional de Artes Plásticas y Visuales Contemporáneas del Bajío', 'Casa de la Lumbre', 'Trazo Libre Escuela de Dibujo', 'Pigmentos del Norte', 'Barro y Fuego Taller de Cerámica'];
    names.forEach((name, index) => SCHOOL_ROWS.push({
        id: `stress${index}`, name, enabled: index !== 3, billing: (['ok', 'soon', 'late', 'ok', 'late'] as const)[index],
        students: 12 + index * 9, teachers: 2 + index, classes: 3 + index, checkins: 40 * index, storage: 0.2 + index / 10, active: index === 3 ? 0 : 10 + index * 8, lastActivity: index === 3 ? '2026-09-30' : '2026-11-24',
        directors: index === 0 ? [
            {name: 'Maximiliano Alejandro Fernández de Córdoba y Villaseñor', phone: '477 123 4567', email: 'maximiliano.fernandez.de.cordoba@academia-internacional-bajio.edu.mx'},
            {name: 'Lucía Torres', phone: '477 765 4321', email: 'lucia@bajio.mx'},
            {name: 'Raúl Peña', phone: '477 222 3333', email: 'raul@bajio.mx'},
        ] : [{name: `Director ${index + 1}`, phone: '55 0000 000' + index, email: `direccion${index}@escuela.mx`}],
        fee: 1000,
    }));
}

/** The platform's storage plan (Supabase Pro includes 100 GB); every school's files count toward it. */
const PLATFORM_GB = 100;

const billingChip = (billing: 'ok' | 'soon' | 'late') => ({
    ok: <span className="chip chip-confirmed">{t('admin.upToDate')}</span>,
    soon: <span className="chip chip-warning">{t('admin.dueSoon', {when: dayMonth('2026-12-01')})}</span>,
    late: <span className="chip chip-rejected">{t('admin.overdue', {month: monthShort('2026-10-01')})}</span>,
}[billing]);

export function Schools() {
    const router = useRouter();
    const usedGb = SCHOOL_ROWS.reduce((sum, row) => sum + row.storage, 0);
    const [query, setQuery] = useState('');
    const shown = SCHOOL_ROWS.filter(row => row.name.toLowerCase().includes(query.trim().toLowerCase()));
    return (
        <Screen title={t('admin.schools')} subtitle={t('admin.subtitle')}
                footer={<button type='button' className='btn btn-lg' onClick={() => router.navigate('/a/schools/new')}>
                    <Icon name='plus'/>{t('admin.newSchool')}
                </button>}>
            <div className="card">
                <div className="row"><span className="strong">{t('admin.totalStorage')}</span><Icon name="chart"/></div>
                <span className="huge num">{t('admin.gb', {n: decimal(usedGb)})}</span>
                <div className="progress"><span style={{width: `${Math.min(100, usedGb / PLATFORM_GB * 100)}%`}}/></div>
                <span className="small muted">{t('admin.totalStorageSub', {
                    of: PLATFORM_GB,
                    n: SCHOOL_ROWS.length
                })}</span>
            </div>
            <p className="hint">{t('admin.countsOnly')}</p>
            {SCHOOL_ROWS.length > 5 && (
                <SearchField id="sc-search" label={t('admin.searchSchool')} value={query} onChange={setQuery}/>
            )}
            {shown.map(s => (
                <button key={s.id} type="button" className={s.enabled ? 'card' : 'card card-cancelled'}
                        onClick={() => router.navigate(`/a/schools/${s.id}`)}>
                    <div className="row"><span className="row-start" style={{alignItems: 'center', minWidth: 0}}><SchoolLogo school={s.id} size="md"/><span className="big">{s.name}</span></span>{s.enabled ? billingChip(s.billing) :
                        <span className="chip chip-cancelled">{t('admin.disabled')}</span>}</div>
                    <span className="small muted">{s.directors.map(d => d.name).join(', ')}</span>
                    <div className="stats" style={{marginTop: 4}}>
                        <div className="stat"><strong>{s.students}</strong>{t('admin.students')}</div>
                        <div className="stat"><strong>{s.checkins}</strong>{t('admin.checkins')}</div>
                        <div className="stat"><strong>{decimal(s.storage)}</strong>{t('admin.storage')}</div>
                    </div>
                    {/* Every school shows the same counts, whatever its billing. */}
                    {<span className="small muted">{t('admin.usageLine', {
                        teachers: s.teachers,
                        classes: s.classes
                    })}</span>}
                </button>
            ))}
        </Screen>
    );
}

/**
 * A new school: what's needed is its name and its first director (name and email); the time zone
 * and the fee start with the usual values; trial end, tax details and notes are optional and folded
 * away. Creating it sends the director their invite and shows that it went.
 */
export function SchoolNew() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [director, setDirector] = useState('');
    const [email, setEmail] = useState('');
    const [more, setMore] = useState(false);
    const missing = [
        name.trim().length < 2 && t('admin.schoolName'),
        director.trim().length < 2 && t('admin.directorName'),
        !/\S+@\S+\.\S+/.test(email) && t('admin.directorEmail'),
    ].filter(Boolean) as string[];
    return (
        <Screen title={t('admin.newSchool')} back="/a/schools" nav={false}
                note={missing.length ? t('activity.missing', {list: missing.join(', ')}) : t('admin.inviteNote')}
                footer={<button type="button" className="btn btn-lg" disabled={missing.length > 0}
                                onClick={() => router.replace(`/a/schools/created?name=${encodeURIComponent(name.trim())}&email=${encodeURIComponent(email.trim())}`)}>
                    {t('admin.create')}</button>}>
            <TextField id="sn-name" label={t('admin.schoolName')} value={name} onChange={event => setName(event.target.value)}/>
            <div className="row-start" style={{alignItems: 'center'}}>
                <PhotoPicker name={name || '?'} label={t('admin.logo')}/>
                <span className="hint">{t('admin.logoHint')}</span>
            </div>
            <SelectField id="sn-tz" label={t('admin.timeZone')} defaultValue="mx"
                         options={timeZones()}/>
            <h2 className="section-title">{t('admin.firstDirector')}</h2>
            <TextField id="sn-dname" label={t('admin.directorName')} autoComplete="off" value={director} onChange={event => setDirector(event.target.value)}/>
            <EmailField id="sn-demail" label={t('admin.directorEmail')} value={email} onChange={event => setEmail(event.target.value)}
                        hint={t('admin.directorEmailHint')}/>
            <h2 className="section-title">{t('admin.billing')}</h2>
            <div className="two">
                <MoneyField id="sn-fee" label={t('admin.fee')} defaultValue={1000}/>
                <TextField id="sn-day" label={t('admin.billingDay')} inputMode="numeric" pattern="[0-9]*" defaultValue="1"/>
            </div>
            <button type="button" className="btn btn-ghost" aria-expanded={more} onClick={() => setMore(!more)}>
                <Icon name={more ? 'close' : 'plus'} size={18}/>{t(more ? 'admin.lessData' : 'admin.moreData')}
            </button>
            {more && (
                <>
                    <DateField id="sn-trial" label={t('admin.trialEnd')}/>
                    <TextField id="sn-tax" label={t('admin.tax')} hint={t('admin.taxHint')} autoCapitalize="characters"/>
                    <TextArea id="sn-notes" label={t('admin.notes')}/>
                </>
            )}
        </Screen>
    );
}

/** The school is created and the director's invite has gone: what happens next, and resend if it doesn't arrive. */
export function SchoolCreated() {
    const router = useRouter();
    const toast = useToast();
    const name = router.query.get('name') || 'Taller del Sur';
    const email = router.query.get('email') || 'rosa.garza@tallerdelsur.mx';
    return (
        <Screen title={t('admin.newSchool')} back="/a/schools" nav={false}
                footer={<div className="btn-row">
                    <button type="button" className="btn btn-secondary btn-lg" onClick={() => toast(t('regSent.resent'))}>
                        <Icon name="repeat"/>{t('regSent.resend')}</button>
                    <button type="button" className="btn btn-lg" onClick={() => router.back('/a/schools')}>{t('common.done')}</button>
                </div>}>
            <DoneMessage title={t('admin.createdTitle', {name})} body={t('admin.createdBody', {email})}/>
        </Screen>
    );
}

/**
 * Payments and calendar in one: what's overdue, what's coming (payments due, trial ends, the
 * admin's own reminders), then what happened (payments received, corrections, disables).
 */
export function AdminPayments() {
    const router = useRouter();
    return (
        <Screen title={t('admin.payments')} subtitle={t('admin.calendarSub')}
                footer={<button type="button" className="btn btn-lg" onClick={() => router.navigate('/a/payments/new')}><Icon
                    name="plus"/>{t('admin.recordPayment')}</button>}>
            <h2 className="section-title">{t('admin.overdueList')}</h2>
            <ul className="list">
                <ListRow title="Casa Pigmento" sub={t('admin.overdueRow', {month: monthInSentence('2026-10-01'), amount: money(1000)})}
                         right={<span className="chip chip-rejected">{t('admin.overdue', {month: monthShort('2026-10-01')})}</span>}/>
            </ul>
            <h2 className="section-title">{t('admin.upcoming')}</h2>
            <ul className="list">
                <ListRow title={`${dayShort('2026-12-01')} · Estudio Ámbar`}
                         sub={t('admin.paymentDue', {amount: money(1000)})}
                         right={billingChip('soon')}/>
                <ListRow title={`${dayShort('2026-12-01')} · Taller de Arte Colibrí`}
                         sub={t('admin.paymentDue', {amount: money(1500)})}/>
                <ListRow title={`${dayShort('2026-12-15')} · Casa Pigmento`} sub={t('admin.reminderMine')}
                         right={<span className="chip">{t('admin.reminder')}</span>}/>
            </ul>
            <h2 className="section-title">{t('admin.history')}</h2>
            <ul className="list">
                <ListRow title={`${dayShort('2026-11-02')} · Taller de Arte Colibrí`}
                         sub={`${t('admin.monthPaid', {month: monthInSentence('2026-11-01')})} · ${t('method.transfer')}`}
                         right={<span className="num strong">{money(1500)}</span>}/>
                <ListRow title={`${dayShort('2026-11-01')} · Estudio Ámbar`}
                         sub={`${t('admin.monthPaid', {month: monthInSentence('2026-11-01')})} · ${t('method.card')}`}
                         right={<span className="num strong">{money(1000)}</span>}/>
                <ListRow title={`${dayShort('2026-11-01')} · Estudio Ámbar`} sub={t('admin.correction')}
                         right={<span className="num strong">{money(-1000)}</span>}/>
                <ListRow title={`${dayShort('2026-10-14')} · Casa Pigmento`} sub={t('admin.wasDisabled')}/>
            </ul>
            <p className="hint">{t('admin.neverEdited')}</p>
            <h2 className="section-title">{t('admin.fees')}</h2>
            <ul className="list">
                {SCHOOL_ROWS.map(s => (
                    <ListRow key={s.id} title={s.name} sub={t('admin.feeLine', {amount: money(s.fee), day: 1})}
                             right={billingChip(s.billing)}/>
                ))}
            </ul>
        </Screen>
    );
}


export function AdminLog() {
    const rows = [
        [t('admin.logPayment', {school: 'Taller de Arte Colibrí', amount: money(1500)}), '2026-11-02', '10:12'],
        [t('admin.logInvite', {name: 'Pablo Méndez', school: 'Taller de Arte Colibrí'}), '2026-10-20', '17:40'],
        [t('admin.logDisable', {school: 'Casa Pigmento'}), '2026-10-14', '09:03'],
        [t('admin.logCreate', {school: 'Estudio Ámbar'}), '2026-08-28', '12:30'],
    ];
    return (
        <Screen title={t('nav.log')} subtitle={t('admin.logSub')}>
            <ul className="list">
                {rows.map(([text, date, at]) => <ListRow key={text} title={text}
                                                         sub={`${t('proto.adminName')} · ${dayShort(date)} · ${time(at)}`}/>)}
            </ul>
            <p className="hint">{t('admin.logKept')}</p>
        </Screen>
    );
}

/** The admin's account: password (by email), language, and signing out pinned at the bottom. */
export function AdminAccount() {
    return (
        <Screen title={t('account.title')} footer={<SignOutButton/>}>
            <ul className="list">
                <PasswordRow email="admin@kokoasoft.com"/>
            </ul>
            <LanguageRow/>
            <ThemeRow/>
        </Screen>
    );
}

/**
 * One school: its directors (to call or write to), fee, storage and activity; inviting another
 * director; enabling or disabling it (pinned at the bottom); and, once disabled, deleting it after
 * typing its name. A screen, not a popup: deleting needs typing and a long explanation.
 */
/** Each school's details the admin keeps (time zone, billing, tax details, notes): edited on their own screen. */
const DETAILS: Record<string, { tz: string; billingDay: number; trialEnd: string; tax: string; notes: string }> = {
    colibri: {tz: 'mx', billingDay: 1, trialEnd: '', tax: 'TAC180512AB3', notes: 'Paga por transferencia los primeros días del mes.'},
    ambar: {tz: 'mx', billingDay: 1, trialEnd: '', tax: '', notes: ''},
    pigmento: {tz: 'mx', billingDay: 15, trialEnd: '', tax: 'CPI200101XY9', notes: 'Pidió pausar en diciembre.'},
};
const detailsOf = (id: string) => DETAILS[id] ?? (DETAILS[id] = {tz: 'mx', billingDay: 1, trialEnd: '', tax: '', notes: ''});
const timeZones = () => [{value: 'mx', label: t('tz.mx')}, {value: 'tj', label: t('tz.tj')}, {value: 'cun', label: t('tz.cun')}];

export function AdminSchool({id}: { id: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const toast = useToast();
    const school = SCHOOL_ROWS.find(row => row.id === id) ?? SCHOOL_ROWS[0];
    const details = detailsOf(school.id);
    const [, redraw] = useState(0);
    const toggle = async () => {
        if (await confirm({
            title: t(school.enabled ? 'admin.disableTitle' : 'admin.enableTitle', {name: school.name}),
            body: t(school.enabled ? 'admin.disableBody' : 'admin.enableBody'),
            confirm: t(school.enabled ? 'admin.disable' : 'admin.enable'),
            danger: school.enabled,
        })) {
            school.enabled = !school.enabled;
            redraw(n => n + 1);
            toast(t(school.enabled ? 'admin.enabledToast' : 'admin.disabledToast'));
        }
    };
    return (
        <Screen title={school.name} subtitle={school.enabled ? undefined : t('admin.disabled')} back="/a/schools" nav={false}
                note={school.enabled ? t('admin.deleteOnlyDisabled') : undefined}
                footer={school.enabled
                    ? <button type="button" className="btn btn-secondary btn-lg" onClick={toggle}>{t('admin.disable')}</button>
                    : <>
                        <button type="button" className="btn btn-lg" onClick={toggle}>{t('admin.enable')}</button>
                        <button type="button" className="btn btn-danger-outline" onClick={() => router.navigate(`/a/schools/${school.id}/delete`)}>
                            <Icon name="trash"/>{t('admin.deleteTitle')}</button>
                    </>}>
            <h3 className="section-title">{t('admin.directors')}</h3>
            <ul className="list">
                {school.directors.map(d => (
                    <li key={d.email} className="list-row">
                        <span className="grow">
                            <span className="list-row-title">{personName(d.name)}</span>
                            <span className="list-row-sub"><span
                                className="num">{d.phone}</span> · {d.email}</span>
                        </span>
                        <a className="icon-btn" href={`tel:${d.phone.replace(/\s/g, '')}`}
                           aria-label={t('admin.call', {name: d.name})}><Icon name="phone"/></a>
                        <a className="icon-btn" href={`mailto:${d.email}`}
                           aria-label={t('admin.write', {name: d.name})}><Icon name="mail"/></a>
                    </li>
                ))}
                <ListRow left={<Icon name="mail"/>} title={t('admin.inviteDirector')} onClick={() => toast(t('admin.directorInvited'))}/>
            </ul>
            <h3 className="section-title">{t('admin.details')}</h3>
            <ul className="list">
                <ListRow left={<Icon name="edit"/>} title={t('admin.editDetails')}
                         sub={t('admin.detailsLine', {fee: money(school.fee), day: details.billingDay, tax: details.tax || t('admin.noTax')})}
                         onClick={() => router.navigate(`/a/schools/${school.id}/edit`)}/>
            </ul>
            <h3 className="section-title">{t('admin.usage')}</h3>
            <dl className="dl">
                <dt>{t('admin.storageFull')}</dt>
                <dd>{t('admin.storageOf', {used: decimal(school.storage), of: 5})}</dd>
                <dt>{t('admin.active')}</dt>
                <dd className="num">{t('admin.activeOf', {n: school.active, of: school.students + school.teachers})}</dd>
                <dt>{t('admin.checkinsLabel')}</dt>
                <dd className="num">{school.checkins}</dd>
                <dt>{t('admin.lastActivity')}</dt>
                <dd>{dayShort(school.lastActivity)}</dd>
            </dl>
        </Screen>
    );
}

/** A school's details: name, time zone, the platform fee and billing day, trial end, tax details and notes. */
export function AdminSchoolEdit({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const school = SCHOOL_ROWS.find(row => row.id === id) ?? SCHOOL_ROWS[0];
    const details = detailsOf(school.id);
    const [name, setName] = useState(school.name);
    const [tz, setTz] = useState(details.tz);
    const [fee, setFee] = useState(String(school.fee));
    const [day, setDay] = useState(String(details.billingDay));
    const [trialEnd, setTrialEnd] = useState(details.trialEnd);
    const [tax, setTax] = useState(details.tax);
    const [notes, setNotes] = useState(details.notes);
    const missing = [name.trim().length < 2 && t('admin.schoolName'), !Number(fee) && t('admin.fee'),
        !(Number(day) >= 1 && Number(day) <= 28) && t('admin.billingDay')].filter(Boolean) as string[];
    return (
        <Screen title={t('admin.editDetails')} subtitle={school.name} back={`/a/schools/${school.id}`} nav={false}
                note={missing.length ? t('activity.missing', {list: missing.join(', ')}) : undefined}
                footer={<button type="button" className="btn btn-lg" disabled={missing.length > 0} onClick={() => {
                    school.name = name.trim();
                    school.fee = Number(fee);
                    Object.assign(details, {tz, billingDay: Number(day), trialEnd, tax: tax.trim().toUpperCase(), notes});
                    toast(t('form.saved'));
                    router.back(`/a/schools/${school.id}`);
                }}>{t('form.saveChanges')}</button>}>
            <TextField id="se-name" label={t('admin.schoolName')} value={name} onChange={event => setName(event.target.value)}/>
            <div className="row-start" style={{alignItems: 'center'}}>
                <PhotoPicker name={name || '?'} label={t('admin.logo')} onPicked={url => url && SCHOOL_LOGOS.set(school.id, url)}/>
                <span className="hint">{t('admin.logoHint')}</span>
            </div>
            <SelectField id="se-tz" label={t('admin.timeZone')} value={tz} onChange={setTz} options={timeZones()}/>
            <h2 className="section-title">{t('admin.billing')}</h2>
            <div className="two">
                <MoneyField id="se-fee" label={t('admin.fee')} value={fee} onChange={event => setFee(event.target.value.replace(/\D/g, ''))}/>
                <TextField id="se-day" label={t('admin.billingDay')} inputMode="numeric" pattern="[0-9]*" value={day}
                           onChange={event => setDay(event.target.value.replace(/\D/g, ''))} hint={t('admin.billingDayHint')}/>
            </div>
            <DateField id="se-trial" label={t('admin.trialEnd')} value={trialEnd} onChange={setTrialEnd} hint={t('admin.trialEndHint')}/>
            <h2 className="section-title">{t('admin.taxTitle')}</h2>
            <TextField id="se-tax" label={t('admin.tax')} hint={t('admin.taxHint')} autoCapitalize="characters" value={tax} onChange={event => setTax(event.target.value)}/>
            <TextArea id="se-notes" label={t('admin.notes')} value={notes} onChange={setNotes}/>
        </Screen>
    );
}

/** Deleting a disabled school: what goes, then typing its name turns the button on. */
export function AdminSchoolDelete({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const school = SCHOOL_ROWS.find(row => row.id === id) ?? SCHOOL_ROWS[0];
    const [typed, setTyped] = useState('');
    const matches = typed.trim().toLowerCase() === school.name.toLowerCase();
    return (
        <Screen title={t('admin.deleteTitle')} subtitle={school.name} back={`/a/schools/${school.id}`} nav={false}
                note={matches ? undefined : t('admin.typeToDelete')}
                footer={<button type="button" className="btn btn-danger btn-lg" disabled={!matches} onClick={async () => {
                    if (await confirm({title: t('admin.deleteConfirm', {name: school.name}), body: t('ddel.confirmBody'), confirm: t('ddel.button'), danger: true})) {
                        SCHOOL_ROWS.splice(SCHOOL_ROWS.indexOf(school), 1);
                        toast(t('admin.deleted'));
                        // The school's screen and this one leave the history with it.
                        router.leave(2, '/a/schools');
                    }
                }}>{t('ddel.button')}</button>}>
            <div className="card">
                <span className="strong">{t('delete.goes')}</span>
                <p className="small">{t('admin.deleteGoes')}</p>
            </div>
            <div className="card">
                <span className="strong">{t('ddel.staysTitle')}</span>
                <p className="small">{t('admin.deleteStays')}</p>
            </div>
            <TextField id="adm-del" label={t('ddel.type', {name: school.name})} value={typed} onChange={event => setTyped(event.target.value)}
                       autoComplete="off" autoCapitalize="none" spellCheck={false}/>
        </Screen>
    );
}

/** Record a payment by hand: never edited afterwards, corrected with a negative entry. */
export function AdminPaymentNew() {
    const router = useRouter();
    const toast = useToast();
    const [school, setSchool] = useState('');
    const [month, setMonth] = useState('');
    const ready = Boolean(school && month);
    return (
        <Screen title={t('admin.recordPayment')} back="/a/payments" nav={false}
                note={ready ? t('admin.neverEdited') : t('admin.recordNeed')}
                footer={<button type="button" className="btn btn-lg" disabled={!ready} onClick={() => {
                    toast(t('admin.paymentSaved'));
                    router.back('/a/payments');
                }}>{t('admin.save')}</button>}>
            <SelectField id="ap-school" label={t('admin.school')} value={school} onChange={setSchool}
                         placeholder={t('common.pick')}
                         options={SCHOOL_ROWS.map(s => ({value: s.id, label: s.name}))}/>
            <div className="two">
                <MoneyField id="ap-amount" label={t('upload.amount')} defaultValue={1500}/>
                <DateField id="ap-date" label={t('activity.date')} defaultValue="2026-11-26"/>
            </div>
            <SelectField id="ap-month" label={t('admin.month')} value={month} onChange={setMonth}
                         placeholder={t('common.pick')}
                         options={[{value: '12', label: monthYear('2026-12-01')}, {value: '11', label: monthYear('2026-11-01')}]}/>
            <SelectField id="ap-method" label={t('upload.method')}
                         options={[{value: 't', label: t('method.transfer')}, {
                             value: 'c',
                             label: t('method.card')
                         }, {value: 'e', label: t('method.cash')}]}/>
            <TextField id="ap-who" label={t('admin.whoPaid')}/>
        </Screen>
    );
}
