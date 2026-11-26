import {useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, dayShort, money, personName, time} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {supabase} from '../../lib/supabase';
import {
    CLASSES,
    classById,
    ENROLLMENTS,
    GUARDIAN_KIDS,
    HISTORY,
    ME,
    PACKAGES,
    PRICES,
    PROOFS,
    SCHOOLS,
    schoolOfClass,
    SESSIONS,
    studentById,
    TODAY,
    type SchoolId,
    type Session,
} from '../../mock/data';
import {LIVE_FEES} from '../../live/state';
import {loadLive} from '../../live/load';
import {Carousel, Empty, TextField, useQueryIndex} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {useSheetRoute} from '../../ui/Layers';
import {Screen} from '../../ui/Screen';
import {SessionBody, SessionCard} from '../shared/pieces';
import {ClassSheet} from './ClassSheet';
import type {Plan} from './Student';

/**
 * The student's and guardian's screens on the real data: what each one shows comes from the
 * person's records (their enrollments, package, attendance, payments), never from the sample people.
 */

// ---- Their classes and sessions ----

/**
 * The classes a student usually comes to: the ones they're enrolled in, and, with a package (which
 * covers many classes), the ones they came to in the last four weeks.
 */
export function usualClasses(student: string): string[] {
    const enrolled = ENROLLMENTS.filter(e => e.student === student && e.classId).map(e => e.classId ?? '');
    const since = addDays(TODAY, -28);
    const came = SESSIONS.filter(s => s.date >= since && s.date <= TODAY && (HISTORY.attended.get(s.id) ?? []).some(a => a.student === student))
        .map(s => s.classId);
    return [...new Set([...enrolled, ...came])];
}

function addDays(iso: string, days: number): string {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

const sessionsFor = (student: string) => {
    const classes = new Set(usualClasses(student));
    return SESSIONS.filter(s => classes.has(s.classId) && s.status === 'scheduled' && s.date >= TODAY);
};

const schoolOf = (session: Session): SchoolId => schoolOfClass(classById(session.classId));

// ---- What they pay for ----

/** Each student the screens are for: the signed-in student, or the guardian's children. */
const scope = (guardian: boolean) => guardian ? GUARDIAN_KIDS.map(kid => kid.id) : [ME.student];

/** The day a month's plans are due: the 15th, or the 30th (February: its last day). */
function dueDay(month: string, paymentDay: number): string {
    if (paymentDay === 15) return `${month}-15`;
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return `${month}-${String(Math.min(30, last)).padStart(2, '0')}`;
}

export function livePlans(guardian: boolean): Plan[] {
    const month = TODAY.slice(0, 7);
    const plans: Plan[] = [];
    for (const id of scope(guardian)) {
        const student = studentById(id);
        const who = guardian ? `${student.name.split(' ')[0]} · ` : '';
        const latest = (covers: string) => PROOFS.filter(p => p.student === id && p.covers === covers)
            .sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt))[0]?.state;
        for (const enrollment of ENROLLMENTS.filter(e => e.student === id)) {
            if (enrollment.packageId) {
                const pack = PACKAGES.find(p => p.id === enrollment.packageId);
                const label = PRICES.find(p => p.id === enrollment.packageId)?.label ?? '';
                const covers = `${enrollment.packageId} · ${month}`;
                const week = SESSIONS.filter(s => s.date >= addDays(TODAY, -((new Date(`${TODAY}T12:00:00`).getDay() + 6) % 7)) && s.date <= TODAY
                    && (HISTORY.attended.get(s.id) ?? []).some(a => a.student === id)).length;
                plans.push({
                    key: `p:${enrollment.id}`,
                    kind: 'package',
                    title: `${who}${label}`,
                    school: pack?.school ?? student.school ?? '',
                    amount: pack?.price ?? 0,
                    due: t('payments.dueOn', {when: dayMonth(dueDay(month, student.paymentDay))}),
                    used: pack ? t('payments.week', {used: week, of: pack.perWeek}) : undefined,
                    progress: pack ? Math.min(100, Math.round(week / pack.perWeek * 100)) : undefined,
                    state: latest(covers),
                    proofs: proof => proof.student === id && proof.covers.startsWith(`${enrollment.packageId} ·`),
                    ref: {student: id, packageId: enrollment.id, month: `${month}-01`},
                });
            } else if (enrollment.how === 'monthly' && enrollment.classId) {
                const item = classById(enrollment.classId);
                const covers = `${item.name} · ${month}`;
                const used = SESSIONS.filter(s => s.classId === item.id && s.date.startsWith(month) && (HISTORY.attended.get(s.id) ?? []).some(a => a.student === id)).length;
                plans.push({
                    key: `m:${enrollment.id}`,
                    kind: 'monthly',
                    title: `${who}${item.name} · ${t('payments.monthlyPlan')}`,
                    school: schoolOfClass(item),
                    amount: item.monthly?.price ?? 0,
                    due: t('payments.dueOn', {when: dayMonth(dueDay(month, student.paymentDay))}),
                    used: item.monthly ? t('payments.monthly', {used, of: item.monthly.sessions}) : undefined,
                    progress: item.monthly ? Math.min(100, Math.round(used / item.monthly.sessions * 100)) : undefined,
                    state: latest(covers),
                    proofs: proof => proof.student === id && proof.covers.startsWith(`${item.name} ·`),
                    ref: {student: id, enrollmentId: enrollment.id, month: `${month}-01`},
                });
            }
        }
        // Classes paid per visit (cash, TotalPass, Wellhub): each one of the last two weeks still without a screenshot.
        for (const session of SESSIONS.filter(s => s.date >= addDays(TODAY, -14) && s.date <= TODAY && (HISTORY.attended.get(s.id) ?? [])
            .some(a => a.student === id && (a.as === 'visit' || a.as === 'pass' || a.as === 'trial')))) {
            const item = classById(session.classId);
            const covers = `${item.name} · ${session.date}`;
            const state = latest(covers);
            if (state && state !== 'rejected') continue;
            const trial = (HISTORY.attended.get(session.id) ?? []).find(a => a.student === id)?.as === 'trial';
            plans.push({
                key: `v:${session.id}:${id}`,
                kind: trial ? 'trial' : 'visit',
                title: `${who}${trial ? t('payments.trialOf', {name: item.name}) : item.name} · ${dayShort(session.date)}`,
                school: schoolOf(session),
                amount: PRICES.find(p => p.kind === (trial ? 'trial' : 'visit') && p.school === schoolOf(session))?.amount ?? 0,
                due: `${dayShort(session.date)} ${time(session.start)}`,
                state,
                proofs: proof => proof.student === id && proof.covers === covers,
                ref: {student: id, sessionId: session.id},
            });
        }
        for (const fee of LIVE_FEES.filter(f => f.student === id)) {
            plans.push({
                key: `f:${fee.id}`,
                kind: 'fee',
                title: `${who}${t('payments.fee')}`,
                school: fee.school,
                amount: fee.amount,
                due: t('payments.feeDue'),
                owed: true,
                proofs: proof => proof.student === id && proof.covers === 'Inscripción',
                ref: {student: id, feeId: fee.id},
            });
        }
    }
    return plans;
}

// ---- Upload: the photo, compressed on the phone, then the screenshot's row and its file ----

/** A photo made smaller on the phone (JPEG, at most 1600 px on its longest side). */
async function compress(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('photo')), 'image/jpeg', 0.8));
}

/** Sends a screenshot: returns an error message, or null once it's saved and the data reloaded. */
export async function uploadProof(plan: Plan, method: string, file: File): Promise<string | null> {
    const ref = plan.ref;
    if (!ref) return 'plan';
    const id = crypto.randomUUID();
    const path = `${plan.school}/proofs/${ref.student}/${id}.jpg`;
    const covers = plan.kind === 'fee' ? 'fee' : plan.kind === 'visit' || plan.kind === 'trial' ? 'visit' : 'month';
    const {error} = await supabase.from('payment_proof').insert({
        id, school_id: plan.school, student_id: ref.student, method, covers, amount: plan.amount, file_path: path,
        session_id: ref.sessionId ?? null, enrollment_id: ref.enrollmentId ?? null, package_id: ref.packageId ?? null,
        month: ref.month ?? null, fee_id: ref.feeId ?? null,
    });
    if (error) return error.message;
    const photo = await compress(file).catch(() => file);
    const {error: fileError} = await supabase.storage.from('lyra').upload(path, photo, {
        contentType: 'image/jpeg',
        upsert: false
    });
    await loadLive();
    return fileError ? fileError.message : null;
}

// ---- Home ----

export function LiveStudentHome() {
    const router = useRouter();
    const ahead = sessionsFor(ME.student);
    const today = ahead.filter(s => s.date === TODAY);
    const upcoming = ahead.filter(s => s.date > TODAY).slice(0, 8);
    const [picked, setPicked] = useQueryIndex('pick', upcoming.length);
    const classSheet = useSheetRoute('class');
    // Something to do about a payment: a fee owed, a rejected screenshot, or a plan due within five days with nothing sent.
    const due = livePlans(false).find(plan => plan.owed || plan.state === 'rejected' || (plan.kind !== 'visit' && plan.kind !== 'trial' && !plan.state));
    return (
        <>
            {due && (
                <button type="button" className="card card-accent"
                        onClick={() => router.navigate(`/s/upload?plan=${encodeURIComponent(due.key)}`)}>
                    <span className="row"><span className="strong">{t('home.dueTitle', {
                        what: due.title,
                        school: SCHOOLS[due.school]?.name ?? ''
                    })}</span><Icon name="chevron" size={18}/></span>
                    <span className="small">{due.due} · {money(due.amount)}</span>
                </button>
            )}
            <h2 className="section-title">{t('home.today')}</h2>
            {today.length ? today.map(session => <SessionCard key={session.id} session={session}
                                                              school={schoolOf(session)}/>)
                : <Empty>{t('home.nothingToday')}</Empty>}
            {upcoming.length > 0 && (
                <div className="stack">
                    <h2 className="section-title">{t('home.upcoming')}</h2>
                    <Carousel label={t('home.upcoming')} items={upcoming} selected={picked} onSelect={setPicked}
                              keyOf={s => s.id}
                              render={session => <SessionBody session={session} showDate school={schoolOf(session)}/>}
                              onOpen={index => classSheet.show(upcoming[index].classId)}
                              openLabel={() => t('home.openClass')}/>
                </div>
            )}
            <ClassSheet id={classSheet.item} student={ME.student} open={classSheet.open} onClose={classSheet.close}/>
        </>
    );
}

export function LiveGuardianHome() {
    const router = useRouter();
    const [picked, setPicked] = useQueryIndex('pick', GUARDIAN_KIDS.length);
    const kid = GUARDIAN_KIDS[picked];
    const classSheet = useSheetRoute('class');
    if (!kid) return <Empty>{t('home.noKids')}</Empty>;
    const first = kid.name.split(' ')[0];
    const ahead = sessionsFor(kid.id);
    const upcoming = ahead.filter(s => s.date > TODAY).slice(0, 6);
    const due = livePlans(true).find(plan => plan.ref?.student === kid.id && (plan.owed || plan.state === 'rejected'));
    return (
        <>
            <h2 className="section-title">{t('home.yourKids')}</h2>
            <Carousel label={t('home.yourKids')} items={GUARDIAN_KIDS} selected={picked} onSelect={setPicked}
                      keyOf={item => item.id}
                      render={item => {
                          const student = studentById(item.id);
                          return (
                              <span className="row-start">
                                  <span
                                      className="avatar">{student.name.split(' ').slice(0, 2).map(p => p[0]).join('')}</span>
                                  <span className="grow">
                                      <span className="big">{personName(student.name)}</span>
                                      <span className="small muted">{t('card.age', {age: student.age})}</span>
                                  </span>
                              </span>
                          );
                      }}/>
            {due && (
                <button type="button" className="card card-accent"
                        onClick={() => router.navigate(`/g/upload?plan=${encodeURIComponent(due.key)}`)}>
                    <span className="row"><span className="strong">{due.title}</span><Icon name="chevron"
                                                                                           size={18}/></span>
                    <span
                        className="small">{t(due.owed ? 'home.kidOwes' : 'home.kidRejected', {amount: money(due.amount)})}</span>
                </button>
            )}
            <h2 className="section-title">{t('home.todayFor', {name: first})}</h2>
            {ahead.filter(s => s.date === TODAY).map(session => <SessionCard key={session.id} session={session}
                                                                             school={schoolOf(session)}/>)}
            {!ahead.some(s => s.date === TODAY) && <Empty>{t('home.nothingToday')}</Empty>}
            {upcoming.length > 0 && (
                <>
                    <h2 className="section-title">{t('home.upcomingFor', {name: first})}</h2>
                    {upcoming.map(session => <SessionCard key={session.id} session={session} showDate
                                                          school={schoolOf(session)}
                                                          onClick={() => classSheet.show(session.classId)}/>)}
                </>
            )}
            <ClassSheet id={classSheet.item} student={kid.id} open={classSheet.open} onClose={classSheet.close}/>
        </>
    );
}

// ---- Check in: the code under the teacher's QR (or the link their QR opens) ----

type Outcome = { status: string; results?: { person_id: string; result: string }[]; session_id?: string };

export function LiveCheckIn() {
    const router = useRouter();
    const base = router.path.startsWith('/g') ? '/g' : '/s';
    const kids = router.query.get('kids');
    const [code, setCode] = useState(router.query.get('code') ?? '');
    const [busy, setBusy] = useState(false);
    const send = async () => {
        setBusy(true);
        const {data, error} = await supabase.rpc('check_in', {
            code: code.trim().toUpperCase(),
            students: kids ? kids.split(',') : []
        });
        setBusy(false);
        const outcome = (error ? {status: 'error'} : data) as Outcome;
        await loadLive().catch(() => undefined);
        router.navigate(`${base}/checkin/result?o=${encodeURIComponent(JSON.stringify(outcome))}`);
    };
    return (
        <Screen title={t('checkin.title')} back={`${base}/home`} nav={false}
                footer={<button type="button" className="btn btn-lg" disabled={busy || code.trim().length < 6}
                                onClick={() => void send()}>
                    <Icon name="check"/>{t('checkin.send')}</button>}>
            <p>{t('checkin.codeBody')}</p>
            <TextField id="checkin-code" label={t('checkin.codeLabel')} value={code} autoComplete="off"
                       autoCapitalize="characters" spellCheck={false}
                       inputMode="text" maxLength={12}
                       onChange={event => setCode(event.target.value.replace(/[^0-9a-fA-F]/g, ''))}
                       hint={t('checkin.codeHint')}/>
        </Screen>
    );
}

export function LiveCheckInResult() {
    const router = useRouter();
    const base = router.path.startsWith('/g') ? '/g' : '/s';
    let outcome: Outcome = {status: 'error'};
    try {
        outcome = JSON.parse(router.query.get('o') ?? '{}') as Outcome;
    } catch {
        // A broken link: shown as an error.
    }
    const session = SESSIONS.find(s => s.id === outcome.session_id);
    const name = session ? classById(session.classId).name : '';
    const results = outcome.results ?? [];
    const okCount = results.filter(r => r.result === 'ok' || r.result === 'already' || r.result === 'guest').length;
    const ok = outcome.status === 'ok' && okCount > 0;
    const reason = (key: string) => t(({
        code: 'checkin.expired',
        too_early: 'checkin.earlyLive',
        too_late: 'checkin.lateLive',
        error: 'join.error',
        not_enrolled: 'checkin.notEnrolled',
        terms_pending: 'checkin.termsLive',
        not_yours: 'checkin.notYours',
        already: 'checkin.already',
    } as Record<string, Parameters<typeof t>[0]>)[key] ?? 'join.error');
    return (
        <Screen title={ok ? t('checkin.okTitle') : t('checkin.failTitle')} nav={false} back={`${base}/home`}
                footer={<>
                    {(outcome.status === 'code' || outcome.status === 'too_early') &&
                        <button type="button" className="btn btn-lg"
                                onClick={() => router.back(`${base}/checkin`)}>{t('checkin.again')}</button>}
                    <button type="button" className={ok ? 'btn btn-lg' : 'btn btn-secondary btn-lg'}
                            onClick={() => router.navigate(`${base}/home`)}>{t('checkin.toHome')}</button>
                </>}>
            <div className="done">
                <span className={ok ? 'avatar avatar-lg avatar-ok' : 'avatar avatar-lg avatar-error'}><Icon
                    name={ok ? 'check' : 'alert'} size={40}/></span>
                {ok && <p className="huge">{t('checkin.ok')}</p>}
                {name && <p className="big">{name}</p>}
                {outcome.status !== 'ok' && <p className="big">{reason(outcome.status)}</p>}
                {results.map(r => (
                    <p key={r.person_id} className={r.result === 'ok' || r.result === 'guest' ? 'muted' : 'big'}>
                        {studentById(r.person_id).id === r.person_id ? `${personName(studentById(r.person_id).name)}: ` : ''}
                        {r.result === 'ok' || r.result === 'guest' ? t('checkin.okShort') : reason(r.result)}
                    </p>
                ))}
            </div>
        </Screen>
    );
}

/** Whether a class belongs to the student's schools (for the classes they can join). */
export const inMySchools = (classId: string, schools: string[]) => schools.includes(schoolOfClass(CLASSES.find(c => c.id === classId) ?? classById(classId)));

// ---- Joining: a class, a package, free hours or a trial (the database checks places, clashes and prices) ----

export async function liveJoin(request: {
    student: string;
    classId?: string;
    packageId?: string;
    how?: string;
    sessionId?: string;
    kind: 'enroll' | 'package' | 'trial' | 'free';
}): Promise<string | null> {
    const session = SESSIONS.find(s => s.id === request.sessionId);
    const school = request.packageId ? PACKAGES.find(p => p.id === request.packageId)?.school ?? '' : schoolOfClass(classById(request.classId ?? session?.classId ?? ''));
    const result = request.kind === 'package'
        ? await supabase.from('student_package').insert({school_id: school, student_id: request.student, offer_id: request.packageId, starts_on: TODAY})
        : request.kind === 'enroll'
            ? await supabase.from('enrollment').insert({school_id: school, student_id: request.student, class_id: request.classId, how: request.how, starts_on: session?.date ?? TODAY})
            : await supabase.from('booking').insert({school_id: school, student_id: request.student, session_id: request.sessionId, kind: request.kind === 'trial' ? 'trial' : 'free'});
    await loadLive().catch(() => undefined);
    return result.error ? result.error.message : null;
}
