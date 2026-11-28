import {LIVE} from '../../live/state';
import {adminLive} from '../../live/admin';
import {useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, dayShort, decimal, money, monthInSentence, monthShort, monthYear, personName, time} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {Screen} from '../../ui/Screen';
import {DateField, EmailField, ListRow, MenuText, MoneyField, PhotoPicker, SearchField, SelectField, TextArea, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';
import {DoneMessage, SchoolLogo} from '../shared/pieces';
import {SCHOOL_LOGOS} from '../../mock/data';
import {ADMIN_LOG, APP_USAGE, BILLING_PAYMENTS, detailsOf, SCHOOL_ROWS} from '../../mock/admin';
import {LanguageRow, PasswordRow, SignOutButton, ThemeRow, LegalRow} from '../shared/Common';

/** The platform admin panel: schools, their billing, usage counts. Never a school's students or records. */

/** The platform's storage plan (Supabase Pro includes 100 GB); every school's files count toward it. */
const PLATFORM_GB = 100;

const billingChip = (billing: 'ok' | 'soon' | 'late', due?: { month: string; on: string }) => ({
    ok: <span className="chip chip-confirmed">{t('admin.upToDate')}</span>,
    soon: <span className="chip chip-warning">{t('admin.dueSoon', {when: dayMonth(due?.on ?? '2026-12-01')})}</span>,
    late: <span className="chip chip-rejected">{t('admin.overdue', {month: monthShort(due?.month ?? '2026-10-01')})}</span>,
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
                    <div className="row"><span className="row-start align-center min-w-0" ><SchoolLogo school={s.id} size="md"/><span className="big">{s.name}</span></span>{s.enabled ? billingChip(s.billing, s.due) :
                        <span className="chip chip-cancelled">{t('admin.disabled')}</span>}</div>
                    <span className="small muted">{s.directors.map(d => d.name).join(', ')}</span>
                    <div className="stats mt-xs" >
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

/** All-school usage overview, with a school picker for the same aggregate event list. */
export function AdminUsage() {
    const detail = useSheetRoute('usage');
    const [school, setSchool] = useState('all');
    const selectedEvent = detail.item;
    const selectedRow = APP_USAGE.find(row => row.event === selectedEvent);
    const selectedTitle = selectedRow
        ? t(selectedRow.event === 'screen_view' ? 'admin.screenViews'
            : selectedRow.event === 'menu.payments' ? 'admin.menuPayments'
            : selectedRow.event === 'menu.classes' ? 'admin.menuClasses'
            : selectedRow.event === 'button.notices' ? 'admin.openNotices'
            : selectedRow.event === 'menu.students' ? 'admin.menuStudents'
            : selectedRow.event === 'button.register_student' ? 'admin.registerStudent'
            : selectedRow.event === 'payment.review_confirmed' ? 'admin.confirmPayment'
            : selectedRow.event === 'button.card' ? 'admin.openCard'
            : selectedRow.event === 'payment.screenshot_upload' ? 'admin.uploadScreenshot'
            : 'admin.otherAction')
        : '';
    const schoolRows = school === 'all'
        ? APP_USAGE
        : APP_USAGE.map(row => ({...row, count: Math.max(1, Math.round(row.count * (SCHOOL_ROWS.find(item => item.id === school)?.students ?? 10) / 58))}));
    const options = [
        {value: 'all', label: t('admin.allSchools')},
        ...SCHOOL_ROWS.map(item => ({value: item.id, label: item.name}))
    ];
    return (
        <Screen title={t('admin.usage')} subtitle={t('admin.usagePeriod')}>
            <div className="heading-pick">
                {t('admin.schoolFilter')}
                <MenuText id="au-school" label={t('admin.schoolFilter')} value={school}
                          onChange={setSchool} options={options}/>
            </div>
            <div className="stats">
                <div className="stat"><strong>{school === 'all' ? SCHOOL_ROWS.reduce((sum, item) => sum + item.checkins, 0) : SCHOOL_ROWS.find(item => item.id === school)?.checkins ?? 0}</strong>{t('admin.checkins')}</div>
                <div className="stat"><strong>{school === 'all' ? SCHOOL_ROWS.reduce((sum, item) => sum + item.active, 0) : SCHOOL_ROWS.find(item => item.id === school)?.active ?? 0}</strong>{t('admin.activePeople')}</div>
                <div className="stat"><strong>{school === 'all' ? SCHOOL_ROWS.length : 1}</strong>{t('admin.schoolsCount')}</div>
            </div>
            <h3 className="section-title">{t('admin.topActions')}</h3>
            <ul className="list">
                {schoolRows.map(row => (
                    <ListRow key={row.event}
                             title={t(row.event === 'screen_view' ? 'admin.screenViews'
                                 : row.event === 'menu.payments' ? 'admin.menuPayments'
                                 : row.event === 'menu.classes' ? 'admin.menuClasses'
                                 : row.event === 'button.notices' ? 'admin.openNotices'
                                 : row.event === 'menu.students' ? 'admin.menuStudents'
                                 : row.event === 'button.register_student' ? 'admin.registerStudent'
                                 : row.event === 'payment.review_confirmed' ? 'admin.confirmPayment'
                                 : row.event === 'button.card' ? 'admin.openCard'
                                 : row.event === 'payment.screenshot_upload' ? 'admin.uploadScreenshot'
                                 : 'admin.otherAction')}
                             right={<span className="big num">{row.count}</span>}
                             onClick={() => detail.show(row.event)}/>
                ))}
            </ul>
            <p className="hint">{t('admin.usagePrivacy')}</p>
            <Sheet open={detail.open} onClose={detail.close} title={selectedTitle}
                   subtitle={school === 'all' ? t('admin.allSchools') : SCHOOL_ROWS.find(item => item.id === school)?.name}>
                {selectedRow && (
                    <>
                        <div className="card">
                            <span className="small muted">{t('admin.usagePeriod')}</span>
                            <span className="huge num">{school === 'all'
                                ? selectedRow.count
                                : Math.max(1, Math.round(selectedRow.count * (SCHOOL_ROWS.find(item => item.id === school)?.students ?? 10) / 58))}</span>
                            <span className="small">{t('admin.totalUses')}</span>
                        </div>
                        <h3 className="section-title">{t('admin.bySchool')}</h3>
                        <ul className="list">
                            {SCHOOL_ROWS.map(item => (
                                <ListRow key={item.id} left={<SchoolLogo school={item.id} size="sm"/>}
                                         title={item.name}
                                         right={<span className="big num">{Math.max(1, Math.round(selectedRow.count * item.students / 58))}</span>}/>
                            ))}
                        </ul>
                    </>
                )}
            </Sheet>
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
    const [tz, setTz] = useState('mx');
    const [fee, setFee] = useState('1000');
    const [day, setDay] = useState('1');
    const [trialEnd, setTrialEnd] = useState('');
    const [tax, setTax] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const missing = [
        name.trim().length < 2 && t('admin.schoolName'),
        director.trim().length < 2 && t('admin.directorName'),
        !/\S+@\S+\.\S+/.test(email) && t('admin.directorEmail'),
    ].filter(Boolean) as string[];
    return (
        <Screen title={t('admin.newSchool')} back="/a/schools" nav={false}
                note={missing.length ? t('activity.missing', {list: missing.join(', ')}) : t('admin.inviteNote')}
                footer={<button type="button" className="btn btn-lg" disabled={missing.length > 0 || busy}
                                onClick={async () => {
                                    if (LIVE.on) {
                                        setBusy(true);
                                        const problem = await adminLive.createSchool({name: name.trim(), director: director.trim(), email: email.trim(), zone: tz,
                                            fee: Number(fee) || 0, billingDay: Math.min(28, Math.max(1, Number(day) || 1)), trialEnd, tax: tax.trim().toUpperCase(), notes});
                                        setBusy(false);
                                        if (problem) return toast(t('live.refused', {reason: problem}));
                                    }
                                    router.replace(`/a/schools/created?name=${encodeURIComponent(name.trim())}&email=${encodeURIComponent(email.trim())}`);
                                }}>
                    {t(busy ? 'upload.sending' : 'admin.create')}</button>}>
            <TextField id="sn-name" label={t('admin.schoolName')} value={name} onChange={event => setName(event.target.value)}/>
            {!LIVE.on && (
                <div className="row-start align-center" >
                    <PhotoPicker name={name || '?'} label={t('admin.logo')}/>
                    <span className="hint">{t('admin.logoHint')}</span>
                </div>
            )}
            <SelectField id="sn-tz" label={t('admin.timeZone')} value={tz} onChange={setTz} options={timeZones()}/>
            <h2 className="section-title">{t('admin.firstDirector')}</h2>
            <TextField id="sn-dname" label={t('admin.directorName')} autoComplete="off" value={director} onChange={event => setDirector(event.target.value)}/>
            <EmailField id="sn-demail" label={t('admin.directorEmail')} value={email} onChange={event => setEmail(event.target.value)}
                        hint={t('admin.directorEmailHint')}/>
            <h2 className="section-title">{t('admin.billing')}</h2>
            <div className="two">
                <MoneyField id="sn-fee" label={t('admin.fee')} value={fee} onChange={event => setFee(event.target.value.replace(/\D/g, ''))}/>
                <TextField id="sn-day" label={t('admin.billingDay')} inputMode="numeric" pattern="[0-9]*" value={day} onChange={event => setDay(event.target.value.replace(/\D/g, ''))}/>
            </div>
            <button type="button" className="btn btn-ghost" aria-expanded={more} onClick={() => setMore(!more)}>
                <Icon name={more ? 'close' : 'plus'} size={18}/>{t(more ? 'admin.lessData' : 'admin.moreData')}
            </button>
            {more && (
                <>
                    <DateField id="sn-trial" label={t('admin.trialEnd')} value={trialEnd} onChange={setTrialEnd}/>
                    <TextField id="sn-tax" label={t('admin.tax')} hint={t('admin.taxHint')} autoCapitalize="characters" value={tax} onChange={event => setTax(event.target.value)}/>
                    <TextArea id="sn-notes" label={t('admin.notes')} value={notes} onChange={setNotes}/>
                </>
            )}
        </Screen>
    );
}

/** The school is created and the director's invite has gone: what happens next, and resend if it doesn't arrive. */
export function SchoolCreated() {
    const router = useRouter();
    const toast = useToast();
    const name = router.query.get('name') || 'Estudio Aéreo del Sur';
    const email = router.query.get('email') || 'rosa.garza@aereodelsur.mx';
    return (
        <Screen title={t('admin.newSchool')} back="/a/schools" nav={false}
                footer={<div className="btn-row">
                    <button type="button" className="btn btn-secondary btn-lg" onClick={async () => {
                        const problem = LIVE.on ? await adminLive.resendDirector(name) : null;
                        toast(problem ? t('live.refused', {reason: problem}) : t('regSent.resent'));
                    }}>
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
    if (LIVE.on) return <LivePayments/>;
    return (
        <Screen title={t('admin.payments')} subtitle={t('admin.calendarSub')}
                footer={<button type="button" className="btn btn-lg" onClick={() => router.navigate('/a/payments/new')}><Icon
                    name="plus"/>{t('admin.recordPayment')}</button>}>
            <h2 className="section-title">{t('admin.overdueList')}</h2>
            <ul className="list">
                <ListRow title="Casa Pirueta" sub={t('admin.overdueRow', {month: monthInSentence('2026-10-01'), amount: money(1000)})}
                         right={<span className="chip chip-rejected">{t('admin.overdue', {month: monthShort('2026-10-01')})}</span>}/>
            </ul>
            <h2 className="section-title">{t('admin.upcoming')}</h2>
            <ul className="list">
                <ListRow title={`${dayShort('2026-12-01')} · Ámbar Danza Aérea`}
                         sub={t('admin.paymentDue', {amount: money(1000)})}
                         right={billingChip('soon')}/>
                <ListRow title={`${dayShort('2026-12-01')} · Estudio Aéreo Colibrí`}
                         sub={t('admin.paymentDue', {amount: money(1500)})}/>
                <ListRow title={`${dayShort('2026-12-15')} · Casa Pirueta`} sub={t('admin.reminderMine')}
                         right={<span className="chip">{t('admin.reminder')}</span>}/>
            </ul>
            <h2 className="section-title">{t('admin.history')}</h2>
            <ul className="list">
                <ListRow title={`${dayShort('2026-11-02')} · Estudio Aéreo Colibrí`}
                         sub={`${t('admin.monthPaid', {month: monthInSentence('2026-11-01')})} · ${t('method.transfer')}`}
                         right={<span className="num strong">{money(1500)}</span>}/>
                <ListRow title={`${dayShort('2026-11-01')} · Ámbar Danza Aérea`}
                         sub={`${t('admin.monthPaid', {month: monthInSentence('2026-11-01')})} · ${t('method.card')}`}
                         right={<span className="num strong">{money(1000)}</span>}/>
                <ListRow title={`${dayShort('2026-11-01')} · Ámbar Danza Aérea`} sub={t('admin.correction')}
                         right={<span className="num strong">{money(-1000)}</span>}/>
                <ListRow title={`${dayShort('2026-10-14')} · Casa Pirueta`} sub={t('admin.wasDisabled')}/>
            </ul>
            <p className="hint">{t('admin.neverEdited')}</p>
            <h2 className="section-title">{t('admin.fees')}</h2>
            <ul className="list">
                {SCHOOL_ROWS.map(s => (
                    <ListRow key={s.id} title={s.name} sub={t('admin.feeLine', {amount: money(s.fee), day: 1})}
                             right={billingChip(s.billing, s.due)}/>
                ))}
            </ul>
        </Screen>
    );
}


/** The live calendar: overdue, then due this month, then the payments recorded (never edited). */
function LivePayments() {
    const router = useRouter();
    const late = SCHOOL_ROWS.filter(s => s.enabled && s.billing === 'late');
    const soon = SCHOOL_ROWS.filter(s => s.enabled && s.billing === 'soon').sort((a, b) => (a.due?.on ?? '').localeCompare(b.due?.on ?? ''));
    return (
        <Screen title={t('admin.payments')} subtitle={t('admin.calendarSub')}
                footer={<button type="button" className="btn btn-lg" onClick={() => router.navigate('/a/payments/new')}><Icon
                    name="plus"/>{t('admin.recordPayment')}</button>}>
            <h2 className="section-title">{t('admin.overdueList')}</h2>
            {late.length === 0 ? <p className="empty">{t('admin.noneOverdue')}</p> : (
                <ul className="list">
                    {late.map(s => <ListRow key={s.id} title={s.name} sub={t('admin.overdueRow', {month: monthInSentence(s.due?.month ?? ''), amount: money(s.fee)})}
                                            right={billingChip(s.billing, s.due)}/>)}
                </ul>
            )}
            <h2 className="section-title">{t('admin.upcoming')}</h2>
            {soon.length === 0 ? <p className="empty">{t('admin.noneUpcoming')}</p> : (
                <ul className="list">
                    {soon.map(s => <ListRow key={s.id} title={`${dayShort(s.due?.on ?? '')} · ${s.name}`} sub={t('admin.paymentDue', {amount: money(s.fee)})}
                                            right={billingChip(s.billing, s.due)}/>)}
                </ul>
            )}
            <h2 className="section-title">{t('admin.history')}</h2>
            {BILLING_PAYMENTS.length === 0 ? <p className="empty">{t('admin.noPayments')}</p> : (
                <ul className="list">
                    {BILLING_PAYMENTS.map(p => (
                        <ListRow key={p.id} title={`${dayShort(p.paidOn)} · ${p.school}`}
                                 sub={p.amount < 0 ? t('admin.correction') : `${t('admin.monthPaid', {month: monthInSentence(p.month)})} · ${p.method}`}
                                 right={<span className="num strong">{money(p.amount)}</span>}/>
                    ))}
                </ul>
            )}
            <p className="hint">{t('admin.neverEdited')}</p>
            <h2 className="section-title">{t('admin.fees')}</h2>
            <ul className="list">
                {SCHOOL_ROWS.map(s => (
                    <ListRow key={s.id} title={s.name} sub={t('admin.feeLine', {amount: money(s.fee), day: detailsOf(s.id).billingDay})}
                             right={billingChip(s.billing, s.due)}/>
                ))}
            </ul>
        </Screen>
    );
}

/** A log row in words: what the admin did, to which school. */
function logText(row: (typeof ADMIN_LOG)[number]): string {
    const amount = money(Number(row.details.amount ?? 0));
    switch (row.action) {
        case 'school_created': return t('admin.logCreate', {school: row.school});
        case 'school_enabled': return t('admin.logEnable', {school: row.school});
        case 'school_disabled': return t('admin.logDisable', {school: row.school});
        case 'director_invited': return t('admin.logInvite', {name: String(row.details.name ?? ''), school: row.school});
        case 'school_deleted': return t('admin.logDelete', {school: row.school || String(row.details.name ?? '')});
        case 'payment_corrected': return t('admin.logCorrection', {school: row.school, amount});
        default: return t('admin.logPayment', {school: row.school, amount});
    }
}

export function AdminLog() {
    const rows = [
        [t('admin.logPayment', {school: 'Estudio Aéreo Colibrí', amount: money(1500)}), '2026-11-02', '10:12'],
        [t('admin.logInvite', {name: 'Pablo Méndez', school: 'Estudio Aéreo Colibrí'}), '2026-10-20', '17:40'],
        [t('admin.logDisable', {school: 'Casa Pirueta'}), '2026-10-14', '09:03'],
        [t('admin.logCreate', {school: 'Ámbar Danza Aérea'}), '2026-08-28', '12:30'],
    ];
    if (LIVE.on) rows.splice(0, rows.length, ...ADMIN_LOG.map(row => [logText(row), row.at.slice(0, 10), new Date(row.at).toTimeString().slice(0, 5)]));
    return (
        <Screen title={t('nav.log')} subtitle={t('admin.logSub')}>
            {rows.length === 0 && <p className="empty">{t('admin.noLog')}</p>}
            <ul className="list">
                {rows.map(([text, date, at], index) => <ListRow key={`${index}-${text}`} title={text}
                                                         sub={`${LIVE.on ? t('admin.you') : t('proto.adminName')} · ${dayShort(date)} · ${time(at)}`}/>)}
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
                <PasswordRow email={LIVE.on ? LIVE.email : 'admin@kokoasoft.com'}/>
            </ul>
            <LanguageRow/>
            <ThemeRow/>
            <LegalRow/>
        </Screen>
    );
}

/**
 * One school: its directors (to call or write to), fee, storage and activity; inviting another
 * director; enabling or disabling it (pinned at the bottom); and, once disabled, deleting it after
 * typing its name. A screen, not a popup: deleting needs typing and a long explanation.
 */
const timeZones = () => [{value: 'mx', label: t('tz.mx')}, {value: 'tj', label: t('tz.tj')}, {value: 'cun', label: t('tz.cun')}];

export function AdminSchool({id}: { id: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const toast = useToast();
    const school = SCHOOL_ROWS.find(row => row.id === id) ?? SCHOOL_ROWS[0];
    const details = detailsOf(school.id);
    const [, redraw] = useState(0);
    const invite = useSheetRoute('invite');
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const canInvite = newName.trim().length > 1 && /^\S+@\S+\.\S+$/.test(newEmail.trim());
    const sendInvite = async () => {
        const problem = LIVE.on ? await adminLive.inviteDirector(school.id, newName.trim(), newEmail.trim()) : null;
        if (problem) return toast(t('live.refused', {reason: problem}));
        toast(t('admin.directorInvited'));
        setNewName('');
        setNewEmail('');
        invite.close();
    };
    const toggle = async () => {
        if (await confirm({
            title: t(school.enabled ? 'admin.disableTitle' : 'admin.enableTitle', {name: school.name}),
            body: t(school.enabled ? 'admin.disableBody' : 'admin.enableBody'),
            confirm: t(school.enabled ? 'admin.disable' : 'admin.enable'),
            danger: school.enabled,
        })) {
            const problem = LIVE.on ? await adminLive.setEnabled(school.id, !school.enabled) : null;
            if (problem) return toast(t('live.refused', {reason: problem}));
            if (!LIVE.on) school.enabled = !school.enabled;
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
                    <li key={d.email || d.name} className="list-row">
                        <span className="grow">
                            <span className="list-row-title">{personName(d.name)}</span>
                            <span className="list-row-sub"><span
                                className="num">{d.phone || t('admin.noPhone')}</span>{d.email && <> · {d.email}</>}</span>
                        </span>
                        {d.phone && <a className="icon-btn" href={`tel:${d.phone.replace(/\s/g, '')}`}
                           aria-label={t('admin.call', {name: d.name})}><Icon name="phone"/></a>}
                        {d.email && <a className="icon-btn" href={`mailto:${d.email}`}
                           aria-label={t('admin.write', {name: d.name})}><Icon name="mail"/></a>}
                    </li>
                ))}
                <ListRow left={<Icon name="mail"/>} title={t('admin.inviteDirector')} onClick={() => invite.show()}/>
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
            <Sheet open={invite.open} onClose={invite.close} title={t('admin.inviteDirector')}
                   footer={<button type="button" className="btn btn-lg" disabled={!canInvite} onClick={sendInvite}>{t('teachers.inviteSend')}</button>}>
                <TextField id="ad-name" label={t('form.name')} autoComplete="off" value={newName} onChange={event => setNewName(event.target.value)}/>
                <EmailField id="ad-email" label={t('signIn.email')} value={newEmail} onChange={event => setNewEmail(event.target.value)}/>
                <p className="hint">{t('admin.directorEmailHint')}</p>
            </Sheet>
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
    const missing = [name.trim().length < 2 && t('admin.schoolName'), (fee === '' || Number.isNaN(Number(fee))) && t('admin.fee'),
        !(Number(day) >= 1 && Number(day) <= 28) && t('admin.billingDay')].filter(Boolean) as string[];
    return (
        <Screen title={t('admin.editDetails')} subtitle={school.name} back={`/a/schools/${school.id}`} nav={false}
                note={missing.length ? t('activity.missing', {list: missing.join(', ')}) : undefined}
                footer={<button type="button" className="btn btn-lg" disabled={missing.length > 0} onClick={async () => {
                    if (LIVE.on) {
                        const problem = await adminLive.saveDetails(school.id, {name: name.trim(), zone: tz, fee: Number(fee), billingDay: Number(day), trialEnd,
                            tax: tax.trim().toUpperCase(), notes});
                        if (problem) return toast(t('live.refused', {reason: problem}));
                    }
                    school.name = name.trim();
                    school.fee = Number(fee);
                    Object.assign(details, {tz, billingDay: Number(day), trialEnd, tax: tax.trim().toUpperCase(), notes});
                    toast(t('form.saved'));
                    router.back(`/a/schools/${school.id}`);
                }}>{t('form.saveChanges')}</button>}>
            <TextField id="se-name" label={t('admin.schoolName')} value={name} onChange={event => setName(event.target.value)}/>
            <div className="row-start align-center" >
                <PhotoPicker name={name || '?'} label={t('admin.logo')} onPicked={async (url, file) => {
                    SCHOOL_LOGOS.set(school.id, url);
                    const problem = LIVE.on ? await adminLive.saveLogo(school.id, file) : null;
                    if (problem) toast(t('live.refused', {reason: problem}));
                }}/>
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
                        const problem = LIVE.on ? await adminLive.deleteSchool(school.id, typed.trim()) : null;
                        if (problem) return toast(t('live.refused', {reason: problem}));
                        if (!LIVE.on) SCHOOL_ROWS.splice(SCHOOL_ROWS.indexOf(school), 1);
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
    const [amount, setAmount] = useState('');
    const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
    const [method, setMethod] = useState('t');
    const [who, setWho] = useState('');
    const ready = Boolean(school && month && Number(amount));
    // This month, the two before it and the next one.
    const months = [1, 0, -1, -2].map(shift => {
        const at = new Date();
        at.setDate(1);
        at.setMonth(at.getMonth() + shift);
        return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-01`;
    });
    return (
        <Screen title={t('admin.recordPayment')} back="/a/payments" nav={false}
                note={ready ? t('admin.neverEdited') : t('admin.recordNeed')}
                footer={<button type="button" className="btn btn-lg" disabled={!ready} onClick={async () => {
                    if (LIVE.on) {
                        const problem = await adminLive.recordPayment(school, Number(amount), month, paidOn,
                            t(`method.${({t: 'transfer', c: 'card', e: 'cash'} as const)[method as 't' | 'c' | 'e'] ?? 'transfer'}`), who.trim());
                        if (problem) return toast(t('live.refused', {reason: problem}));
                    }
                    toast(t('admin.paymentSaved'));
                    router.back('/a/payments');
                }}>{t('admin.save')}</button>}>
            <SelectField id="ap-school" label={t('admin.school')} value={school} onChange={setSchool}
                         placeholder={t('common.pick')}
                         options={SCHOOL_ROWS.map(s => ({value: s.id, label: s.name}))}/>
            <div className="two">
                <MoneyField id="ap-amount" label={t('upload.amount')} value={amount} onChange={event => setAmount(event.target.value.replace(/[^\d-]/g, ''))}
                            hint={t('admin.negativeHint')}/>
                <DateField id="ap-date" label={t('activity.date')} value={paidOn} onChange={setPaidOn}/>
            </div>
            <SelectField id="ap-month" label={t('admin.month')} value={month} onChange={setMonth}
                         placeholder={t('common.pick')}
                         options={months.map(value => ({value, label: monthYear(value)}))}/>
            <SelectField id="ap-method" label={t('upload.method')} value={method} onChange={setMethod}
                         options={[{value: 't', label: t('method.transfer')}, {
                             value: 'c',
                             label: t('method.card')
                         }, {value: 'e', label: t('method.cash')}]}/>
            <TextField id="ap-who" label={t('admin.whoPaid')} value={who} onChange={event => setWho(event.target.value)}/>
        </Screen>
    );
}
