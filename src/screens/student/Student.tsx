import {LIVE} from '../../live/state';
import {LiveCheckIn, LiveCheckInResult, LiveGuardianHome, LiveStudentHome, livePlans, uploadProof} from './LiveStudent';
import {useRef, useState} from 'react';
import {t} from '../../lib/texts';
import {dayLong, dayMonth, dayShort, listOf, money, personName, time, timeRange} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {classById, classesOf, FAMILY, PRICES, PROOFS, SCHOOLS, schoolOfClass, sessionById, SESSIONS, SOFIA_SCHOOLS, studentById, TODAY, GUARDIAN_KIDS, type Proof, type SchoolId, ME, GUARDIAN_SCHOOLS} from '../../mock/data';
import {Screen, roleOf} from '../../ui/Screen';
import {Carousel, Check, EmailField, MenuText, Option, PhoneField, SelectField, Skeleton, TextField, useBriefLoading, useQueryIndex} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';
import {ProofChip, SchoolChip, SessionBody, SessionCard} from '../shared/pieces';
import {initialPeople, useCardForm, type Person} from '../shared/CardForm';
import {ClassSheet} from './ClassSheet';
import {LanguageRow, NavRow, PasswordRow, SignOutButton, ThemeRow} from '../shared/Common';
import {coversText} from '../shared/labels';
import {ListRow} from '../../ui/Fields';

/**
 * Student and guardian screens. The same screens serve both: /s/... is Sofía (an adult in two
 * schools), /g/... is Daniela, who acts for her children Mateo and Valentina.
 */

export function useWho() {
    const router = useRouter();
    const role = roleOf(router.path) === 'g' ? 'g' : 's';
    return {role, base: `/${role}`, router, guardian: role === 'g'};
}

export const KIDS = GUARDIAN_KIDS;

// ---- Home ----

export function Home() {
    const {base, router, guardian} = useWho();
    // A guardian picks which children are there in a popup, then scans: one decision, the screen stays behind.
    const who = useSheetRoute('who');
    // Kept in the URL (all by default), so coming back from the camera finds the same ones ticked.
    const kidsParam = router.query.get('kids');
    const picked = kidsParam === null ? KIDS.map(kid => kid.id) : kidsParam.split(',').filter(Boolean);
    const setKid = (id: string, on: boolean) => router.replace(router.withQuery('kids', KIDS.map(kid => kid.id).filter(other => other === id ? on : picked.includes(other)).join(',')));
    return (
        <Screen title={t('home.hello', {name: guardian ? ME.guardianName : ME.name})} subtitle={dayLong(TODAY)}
                footer={
                    <button type="button" className="btn btn-lg btn-block btn-checkin"
                            onClick={() => guardian ? who.show() : router.navigate(`${base}/checkin`)}>
                        <Icon name="scan"/>
                        <span className="stack-sm">
                            <span>{t(guardian ? 'home.checkInKids' : 'home.checkIn')}</span>
                            <span className="small">
                                {LIVE.on ? t('home.checkInHow') : guardian ? t('home.checkInKidsOpen', {time: time('15:50')}) : t('home.checkInOpen', {class: 'Telas aéreas intermedio', time: time('10:30')})}
                            </span>
                        </span>
                    </button>
                }>
            {LIVE.on ? (guardian ? <LiveGuardianHome/> : <LiveStudentHome/>) : guardian ? <GuardianHomeBody/> : <StudentHomeBody/>}
            {guardian && (
                <Sheet open={who.open} onClose={who.close} title={t('checkin.whoTitle')}
                       footer={<button type="button" className="btn btn-lg" disabled={picked.length === 0}
                                       onClick={() => router.navigate(`${base}/checkin/scan?kids=${picked.join(',')}`)}>
                           <Icon name="scan"/>{t('checkin.scanNow')}</button>}>
                    <p>{t('checkin.whoBody')}</p>
                    {KIDS.map(kid => (
                        <Option key={kid.id} id={`kid-${kid.id}`} label={personName(kid.name)} hint={`Aéreo infantil · ${time('16:00')}`}
                                checked={picked.includes(kid.id)} onChange={value => setKid(kid.id, value)}/>
                    ))}
                </Sheet>
            )}
        </Screen>
    );
}

const UPCOMING = ['oleo-2026-11-28-10:00', 'figura-2026-12-01-10:00', 'oleo-2026-12-02-10:00', 'amb-ceramica-2026-12-02-18:00'];

function StudentHomeBody() {
    const router = useRouter();
    const [picked, setPicked] = useQueryIndex('pick', UPCOMING.length);
    const classSheet = useSheetRoute('class');
    const schoolOf = (id: string): SchoolId => id.startsWith('amb-') ? 'ambar' : 'colibri';
    return (
        <>
            <button type="button" className="card card-accent"
                    onClick={() => router.navigate('/s/upload?plan=amb-ceramica')}>
                <span className="row"><span className="strong">{t('home.dueTitle', {
                    what: 'Hamaca aérea',
                    school: SCHOOLS.ambar.name
                })}</span><Icon name="chevron" size={18}/></span>
                <span className="small">{t('home.dueBody', {when: dayMonth('2026-11-30'), amount: money(1400)})}</span>
            </button>
            <h2 className="section-title">{t('home.today')}</h2>
            <SessionCard session={sessionById('figura-2026-11-26-10:00')} school="colibri"
                         extra={<span className="small muted">{t('home.packageUse', {used: 2, of: 3})}</span>}/>
            <div className="stack">
                <h2 className="section-title">{t('home.upcoming')}</h2>
                <Carousel label={t('home.upcoming')} items={UPCOMING} selected={picked} onSelect={setPicked}
                          keyOf={id => id}
                          render={id => <SessionBody session={sessionById(id)} showDate school={schoolOf(id)}/>}
                          onOpen={index => classSheet.show(sessionById(UPCOMING[index]).classId)}
                          openLabel={() => t('home.openClass')}/>
            </div>
            <ClassSheet id={classSheet.item} student="sofia" open={classSheet.open} onClose={classSheet.close}/>
        </>
    );
}

/**
 * A guardian's Inicio follows the child picked in the carousel: what they owe (only when something
 * needs doing; the rest is in Pagos), their session today, and their next sessions (tapping the
 * selected one opens its class).
 */
function GuardianHomeBody() {
    const router = useRouter();
    const [picked, setPicked] = useQueryIndex('pick', KIDS.length);
    const kid = studentById(KIDS[picked].id);
    const first = kid.name.split(' ')[0];
    // Something to do about this child's payments: a fee owed, or a rejected screenshot.
    const due = plansFor(true).find(plan => plan.key.startsWith(kid.id) && (plan.owed || plan.state === 'rejected'));
    const upcoming = SESSIONS.filter(session => classesOf(kid.id).includes(session.classId) && session.date > TODAY).slice(0, 4);
    const [next, setNext] = useQueryIndex('next', upcoming.length);
    const classSheet = useSheetRoute('class');
    const loading = useBriefLoading('guardian-kid', kid.id);
    return (
        <>
            <h2 className="section-title">{t('home.yourKids')}</h2>
            <Carousel label={t('home.yourKids')} items={KIDS} selected={picked} onSelect={setPicked}
                      keyOf={item => item.id}
                      render={item => {
                          const student = studentById(item.id);
                          return (
                              <>
                                  <span className="row-start">
                                      <span
                                          className="avatar">{student.name.split(' ').slice(0, 2).map(p => p[0]).join('')}</span>
                                      <span className="grow">
                                          <span className="big">{personName(student.name)}</span>
                                          <span className="small muted">{t('card.age', {age: student.age})}</span>
                                      </span>
                                  </span>
                                  <span className="small">{t('home.kidPlan', {
                                      class: 'Aéreo infantil',
                                      used: 3,
                                      of: 4
                                  })}</span>
                                  <div className="progress"><span style={{width: '75%'}}/></div>
                              </>
                          );
                      }}/>
            {loading ? <><Skeleton rows={2} card/><Skeleton rows={3} card/></> : <>
            {due && (
                <button type="button" className="card card-accent" onClick={() => router.navigate(`/g/upload?plan=${due.key}`)}>
                    <span className="row"><span className="strong">{due.title}</span><Icon name="chevron" size={18}/></span>
                    <span className="small">{t(due.owed ? 'home.kidOwes' : 'home.kidRejected', {amount: money(due.amount)})}</span>
                </button>
            )}
            <h2 className="section-title">{t('home.todayFor', {name: first})}</h2>
            <SessionCard session={sessionById('infantil-2026-11-26-16:00')}/>
            {upcoming.length > 0 && (
                <>
                    <h2 className="section-title">{t('home.upcomingFor', {name: first})}</h2>
                    <Carousel label={t('home.upcomingFor', {name: first})} items={upcoming} selected={next}
                              onSelect={setNext}
                              keyOf={session => session.id}
                              render={session => <SessionBody session={session} showDate/>}
                              onOpen={index => classSheet.show(upcoming[index].classId)}
                              openLabel={() => t('home.openClass')}/>
                </>
            )}
            </>}
            <ClassSheet id={classSheet.item} student={kid.id} open={classSheet.open} onClose={classSheet.close}/>
        </>
    );
}

// ---- Check in ----

/**
 * Check in: the camera. A guardian comes from Inicio's popup where they picked which children are
 * there (?kids=), so back from the camera returns to that popup.
 */
export function CheckIn() {
    if (LIVE.on) return <LiveCheckIn/>;
    const {base, router} = useWho();
    const kids = router.query.get('kids');

    const results: [string, string][] = [
        ['ok', t('checkin.simOk')], ['early', t('checkin.simEarly')], ['late', t('checkin.simLate')], ['expired', t('checkin.simExpired')],
        ['terms', t('checkin.simTerms')], ['enrolled', t('checkin.simEnrolled')],
    ];
    return (
        <Screen title={t('checkin.title')} back={`${base}/home`} nav={false}>
            <div className="camera fill" aria-label={t('checkin.camera')} role="img">
                <div className="camera-frame"/>
                <p>{t('checkin.aim')}</p>
            </div>
            <div className="card card-flat">
                <span className="small strong">{t('proto.simulate')}</span>
                <div className="wrap">
                    {results.map(([key, label]) => (
                        <button key={key} type="button" className="btn btn-secondary btn-sm"
                                onClick={() => router.navigate(`${base}/checkin/result?r=${key}${kids ? `&kids=${kids}` : ''}`)}>{label}</button>
                    ))}
                </div>
            </div>
        </Screen>
    );
}

export function CheckInResult() {
    if (LIVE.on) return <LiveCheckInResult/>;
    const {base, router, guardian} = useWho();
    const result = router.query.get('r') ?? 'ok';
    const ok = result === 'ok';
    const message = {
        early: t('checkin.early', {time: time('9:50')}),
        late: t('checkin.late', {time: time('10:30')}),
        expired: t('checkin.expired'),
        terms: t('checkin.terms', {school: SCHOOLS.colibri.name}),
        enrolled: t('checkin.notEnrolled'),
    }[result as 'early' | 'late' | 'expired' | 'terms' | 'enrolled'];
    // The main button is what can fix it: scanning again only helps when it was early or the code changed.
    const retry = result === 'early' || result === 'expired';
    // Home → (the children popup →) camera → result: going home drops the whole check-in from the history.
    const names = listOf(KIDS.filter(kid => (router.query.get('kids') ?? 'mateo,valentina').split(',').includes(kid.id)).map(kid => kid.name.split(' ')[0]));
    const home = () => router.leave(guardian ? 3 : 2, `${base}/home`);
    return (
        <Screen title={ok ? t('checkin.okTitle') : t('checkin.failTitle')} nav={false} back={`${base}/home`} onBack={home}
                footer={
                    <>
                        {retry && <button type="button" className="btn btn-lg"
                                          onClick={() => router.back(`${base}/checkin`)}>{t('checkin.again')}</button>}
                        {result === 'terms' && <button type="button" className="btn btn-lg"
                                                       onClick={() => router.navigate('/terms-new')}>{t('checkin.readTerms')}</button>}
                        {result === 'enrolled' && <button type="button" className="btn btn-lg"
                                                          onClick={() => router.leave(guardian ? 3 : 2, `${base}/classes`)}>{t('checkin.seeClasses')}</button>}
                        <button type="button" className={ok || result === 'late' ? 'btn btn-lg' : 'btn btn-secondary btn-lg'}
                                onClick={home}>{t('checkin.toHome')}</button>
                    </>
                }>
            <div className="done">
                <span className={ok ? 'avatar avatar-lg avatar-ok' : 'avatar avatar-lg avatar-error'}>
                    <Icon name={ok ? 'check' : 'alert'} size={40}/>
                </span>
                {ok ? (
                    <>
                        <p className="huge">{t('checkin.ok')}</p>
                        <p className="big">{guardian ? 'Aéreo infantil' : 'Telas aéreas intermedio'}</p>
                        <p className="muted">{guardian
                            ? t('checkin.okKids', {names, time: time('15:56')})
                            : t('checkin.okAt', {time: time('10:02')})}</p>
                    </>
                ) : <p className="big">{message}</p>}
            </div>
        </Screen>
    );
}

// ---- Payments ----

type PayKind = 'monthly' | 'package' | 'trial' | 'visit' | 'fee';

export interface Plan {
    key: string;
    kind: PayKind;
    title: string;
    school: SchoolId;
    amount: number;
    due: string;
    used?: string;
    progress?: number;
    state?: Proof['state'];
    /** The registration fee, while it's owed. */
    owed?: boolean;
    proofs: (proof: Proof) => boolean;
    /** The live app: what a screenshot for it covers. */
    ref?: { student: string; enrollmentId?: string; packageId?: string; month?: string; feeId?: string; sessionId?: string };
}

/** How each kind of payment can be made (rule 4): Wellhub and TotalPass pay classes and plans (a screenshot of the token), never the registration fee. */
const METHODS: Record<PayKind, Proof['method'][]> = {
    // A student who comes with Wellhub or TotalPass is enrolled too: their token's screenshot is the payment.
    monthly: ['transfer', 'card', 'cash', 'totalpass', 'wellhub'],
    package: ['transfer', 'card', 'cash', 'totalpass', 'wellhub'],
    fee: ['transfer', 'card', 'cash'],
    trial: ['totalpass', 'wellhub', 'cash'],
    visit: ['totalpass', 'wellhub', 'cash'],
};

/**
 * What a student (or guardian) pays for: monthly plans, packages, trial classes and per-visit
 * sessions, and the registration fee while it's owed. Each one is a card on Payments and a choice on
 * Upload.
 */
export function plansFor(guardian: boolean): Plan[] {
    if (LIVE.on) return livePlans(guardian);
    if (guardian) {
        return [
            ...KIDS.map((kid): Plan => ({
                key: `${kid.id}-infantil`,
                kind: 'monthly',
                title: `${kid.name.split(' ')[0]} · Aéreo infantil`,
                school: 'colibri',
                amount: 1200,
                due: t('payments.dueOn', {when: dayMonth('2026-11-30')}),
                used: t('payments.monthly', {used: 3, of: 4}),
                progress: 75,
                // The latest screenshot decides: a rejected one asks for another.
                state: PROOFS.filter(proof => proof.student === kid.id).sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt))[0]?.state ?? 'uploaded',
                proofs: proof => proof.student === kid.id,
            })),
            {
                key: 'valentina-fee',
                kind: 'fee',
                title: `Valentina · ${t('payments.fee')}`,
                school: 'colibri',
                amount: 800,
                due: t('payments.feeDue'),
                owed: true,
                proofs: () => false,
            },
        ];
    }
    return [
        {
            key: 'amb-ceramica',
            kind: 'monthly',
            title: `Hamaca aérea · ${t('payments.monthlyPlan')}`,
            school: 'ambar',
            amount: 1400,
            due: t('payments.dueOn', {when: dayMonth('2026-11-30')}),
            used: t('payments.monthly', {used: 3, of: 4}),
            progress: 75,
            proofs: proof => proof.student === 'sofia' && proof.school === 'ambar',
        },
        {
            key: 'pk3',
            kind: 'package',
            title: t('payments.package3'),
            school: 'colibri',
            amount: 2400,
            due: t('payments.nextOn', {when: dayMonth('2026-12-15')}),
            used: t('payments.week', {used: 2, of: 3}),
            progress: 66,
            state: 'confirmed',
            proofs: proof => proof.student === 'sofia' && proof.school === 'colibri',
        },
        trialPlan('retrato', '2026-11-28'),
        ...SOFIA_SCHOOLS.slice(2).map((school): Plan => ({
            key: `cl-${school}`,
            kind: 'monthly',
            title: `${classById(`cl-${school}`).name} · ${t('payments.monthlyPlan')}`,
            school,
            amount: classById(`cl-${school}`).monthly?.price ?? 1000,
            due: t('payments.dueOn', {when: dayMonth('2026-11-30')}),
            proofs: () => false,
        })),
    ];
}

/** A trial class booked for a class: one per-visit payment at the school's trial price. */
function trialPlan(classId: string, date: string, kid?: string): Plan {
    const item = classById(classId);
    const session = SESSIONS.find(s => s.classId === classId && s.date >= date && s.status !== 'cancelled');
    return {
        key: `trial-${classId}${kid ? `-${kid}` : ''}`,
        kind: 'trial',
        title: `${kid ? `${studentById(kid).name.split(' ')[0]} · ` : ''}${t('payments.trialOf', {name: item.name})}`,
        school: schoolOfClass(item),
        amount: PRICES.find(price => price.id === 'trial')?.amount ?? 200,
        due: session ? t('payments.beforeClass', {when: `${dayShort(session.date)} ${time(session.start)}`}) : '',
        proofs: () => false,
    };
}

/** The plan a link names; a trial just booked (trial-<class>[-<kid>]) isn't in the list yet. */
function findPlan(plans: Plan[], key: string | null): Plan {
    const found = plans.find(plan => plan.key === key);
    if (found || !key?.startsWith('trial-')) return found ?? plans[0];
    const [, classId, kid] = key.split('-');
    return trialPlan(classId, TODAY, kid);
}

/** Payments: tap a plan's card to select it; the screenshots and the upload button follow it. */
export function Payments() {
    const {base, router, guardian} = useWho();
    // A guardian with three or more children keeps to one child's payments.
    const ofKid = guardian && KIDS.length >= 3 ? router.query.get('of') ?? 'all' : 'all';
    const plans = plansFor(guardian).filter(plan => ofKid === 'all' || plan.key.startsWith(ofKid));
    const start = Math.max(0, plans.findIndex(plan => plan.key.startsWith(router.query.get('kid') ?? '§')));
    // The picked plan is kept in the URL, so coming back to Pagos finds it still picked.
    const [index, setPicked] = useQueryIndex('pick', plans.length);
    const picked = router.query.has('pick') ? index : start;
    const plan = plans[picked] as Plan | undefined;
    const proofs = plan ? PROOFS.filter(plan.proofs) : [];
    // Needed while nothing valid covers it: a fee owed, nothing sent yet, or a rejected screenshot.
    const needed = plan ? Boolean(plan.owed) || !plan.state || plan.state === 'rejected' : false;
    const loading = useBriefLoading('payments', plan?.key ?? '');
    // Nothing to pay yet: a new student, before they choose a class.
    if (!plan) return <Screen title={t('payments.title')}><p className="empty">{t('payments.nothing')}</p></Screen>;
    return (
        <Screen title={t('payments.title')}
                note={!needed ? t(plan.state === 'confirmed' ? 'payments.paidNote' : 'payments.sentNote')
                    : proofs.some(proof => proof.state === 'rejected') ? t('payments.rejectedHint') : undefined}
                footer={<button type="button" className="btn btn-lg" disabled={!needed}
                                onClick={() => router.navigate(`${base}/upload?plan=${plan.key}`)}>
                    <Icon name="upload"/>{t('payments.upload')}
                </button>}>
            {guardian && KIDS.length >= 3 && (
                <div className="heading-pick">{t('payments.ofPick')}<MenuText id="pay-kid" label={t('payments.ofKid')} value={ofKid}
                    onChange={value => router.replace(value === 'all' ? `${base}/payments` : `${base}/payments?of=${value}`)}
                    options={[{value: 'all', label: t('payments.allKids', {n: KIDS.length})}, ...KIDS.map(kid => ({value: kid.id, label: personName(kid.name)}))]}/></div>
            )}
            <Carousel label={t('payments.plans')} items={plans} selected={picked} onSelect={setPicked}
                      keyOf={item => item.key}
                      render={item => (
                          <>
                              <div className="row"><span className="small">{item.due}</span><SchoolChip
                                  school={item.school}/></div>
                              <span className="big">{item.title}</span>
                              {item.used && <span className="small">{item.used}</span>}
                              {item.progress !== undefined &&
                                  <div className="progress"><span style={{width: `${item.progress}%`}}/></div>}
                              {item.kind === 'trial' && <span className="small">{t('payments.trialSub')}</span>}
                              {item.kind === 'fee' && <span className="small">{t('payments.feeSub')}</span>}
                              <div className="row">
                                  <span className="num strong">{money(item.amount)}</span>
                                  {item.owed ? <span className="chip chip-rejected">{t('chip.feeOwed')}</span>
                                      : item.state ? <ProofChip state={item.state}/>
                                          : <span className="small">{t('payments.notYet')}</span>}
                              </div>
                          </>
                      )}/>
            <h2 className="section-title">{t('payments.screenshots')}</h2>
            {loading ? <Skeleton rows={4} card/> : proofs.length === 0 ? <p className="empty">{t('payments.noneYet')}</p> : (
                <ul className="list">
                    {proofs.map(proof => (
                        <ListRow key={proof.id} title={coversText(proof.covers)}
                                 sub={<>{t(`method.${proof.method}` as const)} · {money(proof.amount)} · {dayMonth(proof.sent)} {time(proof.sentAt)}
                                     {proof.reason && <><br/><span
                                         className="text-rejected">“{proof.reason}”</span></>}</>}
                                 right={<ProofChip state={proof.state}/>}/>
                    ))}
                </ul>
            )}
        </Screen>
    );
}

/**
 * Upload a screenshot. The amount comes from the plan (the school's price), so it's shown, not
 * typed. The methods follow what's paid: per visit (a trial, a session) is TotalPass, Wellhub or cash; a
 * month, a package or the registration fee is transfer, card or cash. The picture area takes the
 * room left on the screen.
 */
export function Upload() {
    const {base, router, guardian} = useWho();
    const toast = useToast();
    const plans = plansFor(guardian);
    const linked = findPlan(plans, router.query.get('plan'));
    const choices = plans.some(item => item.key === linked.key) ? plans : [...plans, linked];
    const fixed = router.query.has('plan');
    const [planKey, setPlanKey] = useState(linked.key);
    const [method, setMethod] = useState('');
    const [file, setFile] = useState<string | null>(null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const plan = choices.find(item => item.key === planKey) ?? choices[0];
    const methods = METHODS[plan.kind];
    const ready = Boolean(file && method);
    return (
        <Screen title={t('upload.title')} back={`${base}/payments`} nav={false}
                note={ready ? t('upload.hint') : t('upload.need')}
                footer={<button type="button" className="btn btn-lg" disabled={!ready || sending} onClick={async () => {
                    if (LIVE.on && photo) {
                        setSending(true);
                        const problem = await uploadProof(plan, method, photo);
                        setSending(false);
                        if (problem) {
                            toast(t('upload.failed'));
                            return;
                        }
                    }
                    toast(t('upload.sent'));
                    router.back(`${base}/payments`);
                }}>{t(sending ? 'upload.sending' : 'upload.send')}</button>}>
            {fixed ? (
                <section className="card card-accent pay-what" aria-label={t('upload.what')}>
                    <span className="small muted">{t('upload.paying')}</span>
                    <span className="big">{plan.title}</span>
                    <span className="row-start small"><Icon name="school" size={16}/>{SCHOOLS[plan.school].name}</span>
                    <span className="huge num">{method === 'totalpass' || method === 'wellhub' ? t('upload.passAmount', {pass: t(`method.${method}`)}) : money(plan.amount)}</span>
                    {plan.due && <span className="small muted">{plan.due}</span>}
                </section>
            ) : (
            <>
            <SelectField id="up-what" label={t('upload.what')} value={planKey}
                         onChange={value => {
                             setPlanKey(value);
                             const next = choices.find(item => item.key === value);
                             if (next && !METHODS[next.kind].some(item => item === method)) setMethod('');
                         }}
                         options={choices.map(item => ({
                             value: item.key,
                             label: `${item.title} · ${SCHOOLS[item.school].short}`
                         }))}/>
            <div className="row">
                <span className="muted">{t('upload.amount')}</span>
                <span
                    className="big num">{method === 'totalpass' || method === 'wellhub' ? t('upload.passAmount', {pass: t(`method.${method}`)}) : money(plan.amount)}</span>
            </div>
            </>
            )}
            <SelectField id="up-method" label={t('upload.method')} value={method} onChange={setMethod}
                         placeholder={t('common.pick')}
                         options={methods.map(value => ({
                             value,
                             label: t(`method.${value}` as const),
                             hint: value === 'totalpass' ? t('upload.totalpassHint') : undefined,
                         }))}/>
            <button type="button" className="proof-image proof-pick fill" onClick={() => input.current?.click()}>
                {file ? <img src={file} alt={t('upload.preview')}/> : <><Icon name="camera"
                                                                              size={36}/>{t('upload.pick')}</>}
            </button>
            <input ref={input} type="file" accept="image/*" hidden onChange={event => {
                const chosen = event.target.files?.[0];
                if (chosen) {
                    setFile(URL.createObjectURL(chosen));
                    setPhoto(chosen);
                }
            }}/>
        </Screen>
    );
}

/** Edit a card. A guardian's people are the family's, so a change here applies to every child. */
export function CardEdit({id}: { id: string }) {
    const {base, router, guardian} = useWho();
    const toast = useToast();
    const student = studentById(id);
    // Each school has its own card: the one opened from the card popup.
    const school: SchoolId = (guardian ? GUARDIAN_SCHOOLS : SOFIA_SCHOOLS).find(id => id === router.query.get('school')) ?? (guardian ? GUARDIAN_SCHOOLS : SOFIA_SCHOOLS)[0] ?? 'colibri';
    const [people, setPeople] = useState<Person[]>(() => initialPeople(student, guardian ? FAMILY : []));
    const form = useCardForm({
        student, minor: Boolean(student.minor), mode: 'edit', people, setPeople, kids: guardian ? KIDS : [],
        ownPhone: guardian ? undefined : '55 1029 3847',
        ownEmail: guardian ? undefined : 'sofia.ramirez@correo.mx',
        onSave: () => {
            toast(t('form.saved'));
            router.back(`${base}/home`);
        },
    });
    return (
        <Screen title={t('card.editTitle')} back={`${base}/home`} nav={false} footer={form.footer}
                subtitle={[student.name, SCHOOLS[school].name]}>
            {form.body}
            <p className="hint">{t('form.directorsNotified')}</p>
        </Screen>
    );
}

// ---- Account ----

/** Account. "Quiero borrar mis datos" and "Cerrar sesión" are pinned at the bottom, sign out last. */
export function Account() {
    const {base, router, guardian} = useWho();
    const confirm = useConfirm();
    const sheet = useSheetRoute('delete');
    const [school, setSchool] = useState('');
    const [sure, setSure] = useState(false);
    const schools = (guardian ? GUARDIAN_SCHOOLS : SOFIA_SCHOOLS).map(id => ({value: id, label: SCHOOLS[id].name}));
    const email = guardian ? 'daniela.vega@correo.mx' : 'sofia.ramirez@correo.mx';
    return (
        <Screen title={t('account.title')}
                footer={<>
                    <button type="button" className="btn btn-ghost-danger" onClick={() => sheet.show()}>
                        <Icon name="trash"/>{t('account.wantDelete')}
                    </button>
                    <SignOutButton/>
                </>}>
            <ul className="list">
                {guardian &&
                    <NavRow label={t('account.profile')} sub="Daniela Vega · 55 2222 3333" to={`${base}/profile`}
                            icon="user"/>}
                <PasswordRow email={email}/>
            </ul>
            {!guardian && <p className="hint">{t('account.detailsInCard')}</p>}
            <LanguageRow/>
            <ThemeRow/>
            <h2 className="section-title">{t('account.terms')}</h2>
            <ul className="list">
                {schools.map(({value, label}, index) => (
                    <ListRow key={value} title={label} sub={t('account.termsAccepted', index === 0
                        ? {n: 3, when: dayMonth('2026-11-21')} : {n: 1, when: dayMonth('2026-09-02')})}/>
                ))}
            </ul>
            <Sheet open={sheet.open} onClose={sheet.close} title={t('account.yourData')}
                   footer={<>
                       {(!school || !sure) && <p className="hint center">{t('account.deleteNeed')}</p>}
                       <button type="button" className="btn btn-danger btn-lg" disabled={!school || !sure}
                               onClick={async () => {
                                   const name = SCHOOLS[school as SchoolId].name;
                                   if (await confirm({
                                       title: t('account.deleteConfirmTitle', {school: name}),
                                       body: t('account.deleteConfirmBody'),
                                       confirm: t('account.deleteConfirmButton'),
                                       danger: true,
                                   })) router.replace(`${base}/delete-sent`);
                               }}>{t('account.deleteButton')}</button>
                   </>}>
                <SelectField id="del-school" label={t('account.deleteFrom')} value={school}
                             placeholder={t('account.pickSchool')} options={schools} onChange={setSchool}/>
                <Check id="del-check" label={t(guardian ? 'account.deleteCheckGuardian' : 'account.deleteCheck')}
                       checked={sure} onChange={setSure}/>
                <p className="hint">{t('account.deleteHint')}</p>
            </Sheet>
        </Screen>
    );
}

/** A guardian's own details (name, phone, email); students edit theirs with their card. */
export function Profile() {
    const {router} = useWho();
    const toast = useToast();
    const [email, setEmail] = useState('daniela.vega@correo.mx');
    return (
        <Screen title={t('account.profile')} back="/g/account" nav={false}
                footer={<button type="button" className="btn btn-lg" disabled={!/\S+@\S+\.\S+/.test(email)}
                                onClick={() => {
                                    toast(email.trim() !== 'daniela.vega@correo.mx' ? t('form.emailSent', {email: email.trim()}) : t('form.saved'));
                                    router.back('/g/account');
                                }}>{t('form.saveChanges')}</button>}>
            <TextField id="pf-name" label={t('form.name')} defaultValue="Daniela Vega" autoComplete="name"/>
            <PhoneField id="pf-phone" label={t('form.phone')} defaultValue="55 2222 3333"/>
            <EmailField id="pf-email" label={t('signIn.email')} value={email}
                        onChange={event => setEmail(event.target.value)}
                        hint={t('form.emailHint')}/>
            <p className="hint">{t('account.profileHint')}</p>
        </Screen>
    );
}

export function DeleteSent() {
    const {base, router, guardian} = useWho();
    return (
        <Screen title={t('deleteSent.title')} back={`${base}/account`} nav={false} note={t('deleteSent.expires')}
                footer={<button type="button" className="btn btn-secondary btn-lg"
                                onClick={() => router.navigate('/delete-link')}>{t('proto.openEmailLink')}</button>}>
            <div className="done">
                <span className="avatar avatar-lg"><Icon name="mail" size={40}/></span>
                <p className="big">{t('deleteSent.body', {email: guardian ? 'daniela.vega@correo.mx' : 'sofia.ramirez@correo.mx'})}</p>
            </div>
        </Screen>
    );
}

export {dayShort, timeRange};
