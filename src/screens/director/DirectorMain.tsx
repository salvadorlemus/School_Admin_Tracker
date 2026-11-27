import {monthRange, shiftMonth} from '../../lib/months';
import {live} from '../../live/actions';
import {currentSchool} from '../../state/school';
import {useState} from 'react';
import {t} from '../../lib/texts';
import {
    addDays,
    dayLong,
    dayMonth,
    dayShort,
    money,
    monthYear,
    personName,
    time,
    timeRange,
    weekdayLetter,
    weekdayLong,
    weekdayOf,
    weekdayShort
} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {classById, CLASSES, isVacationDate, PRICES, schoolOfClass, schoolOfSession, PROOFS, REVIEWED, roomName, SCHOOLS, sessionById, SESSIONS, sessionsOn, studentById,
    teacherName, TEACHERS, TODAY, NOW, STRESS, STUDENTS, type SchoolClass, type Session, teacherSchools, isPass, roomsHere, studentsHere, pricesHere, type Student, STAFF_ME} from '../../mock/data';
import {Screen} from '../../ui/Screen';
import {Avatar, Carousel, Check, DateField, Empty, ListRow, NumberField, SearchField, Segmented, SelectField, TextField, TimeField, useQueryIndex} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';
import {DoneMessage, DotLegend, ProofChip, SessionCard, SessionBody} from '../shared/pieces';
import {SummaryView} from './Insights';
import {paymentState, payRule, periodsOf, teacherPay} from '../../mock/pay';
import {coversText, planText} from '../shared/labels';
import {cancelSession, changeTeacher, createClass, decideProof, FEES_DONE, GROWN, SEEN, termsState, editClass, endClass, giveToSubstitute, markVacation, moveSession, teacherOf, type ClassFields} from '../../mock/changes';

/** Director screens, part 1: dashboard, calendar (month and weekly plan), payments. Ana Torres, Colibrí. */

export function Dashboard() {
    const router = useRouter();
    const today = sessionsOn(TODAY);
    // Selected at first: the session going on now, or the next one to start.
    const now = today.findIndex(session => session.end > NOW);
    const [picked, setPicked] = useQueryIndex('pick', today.length, Math.max(now, 0));
    // Each to-do lasts until it's dealt with: screenshots reviewed, the fee marked paid, the student's
    // file opened (what's only to know), the adult registration done, every student's acceptance.
    const pendingProofs = PROOFS.filter(proof => proof.school === currentSchool() && proof.state === 'uploaded' && !isPass(proof.method) && !REVIEWED.has(proof.id));
    const colibri = currentSchool() === 'colibri';
    const here = studentsHere();
    const newOnes = here.filter(s => s.newEnrollment && !SEEN.has(`new:${s.id}`));
    const feesOwed = here.filter(s => s.feeOwed && s.status === 'active' && !FEES_DONE.has(s.id));
    const fee = pricesHere().find(price => price.kind === 'fee')?.amount ?? 0;
    const lastClosed = periodsOf(payRule(currentSchool())).find(period => !period.current);
    const payStates = lastClosed ? TEACHERS.filter(teacher => teacher.status === 'active' && teacherSchools(teacher).includes(currentSchool()) && teacherPay(teacher.id, currentSchool(), lastClosed).amount > 0)
        .map(teacher => ({teacher, state: paymentState(teacher.id, currentSchool(), lastClosed.from)})) : [];
    const flaggedPay = payStates.filter(row => row.state === 'flagged');
    const unpaidPay = payStates.filter(row => row.state === 'unpaid');
    const todos: { title: string; sub: string; to: string; chip?: JSX.Element }[] = [
        ...(pendingProofs.length ? [{title: t('todo.proofs', {n: pendingProofs.length}), sub: [...new Set(pendingProofs.map(proof => personName(studentById(proof.student).name)))].join(' · '), to: `/d/payments/review/${pendingProofs[0].id}`, chip: <span className="chip chip-uploaded">{pendingProofs.length}</span>}] : []),
        ...(flaggedPay.length ? [{title: t('todo.payFlagged', {n: flaggedPay.length}), sub: flaggedPay.map(row => personName(row.teacher.name)).join(' · '), to: `/d/teachers/${flaggedPay[0].teacher.id}/pay?period=${lastClosed?.from}`}] : []),
        ...(unpaidPay.length ? [{title: t('todo.payTeachers', {n: unpaidPay.length}), sub: lastClosed ? t('pay.periodPaid', {from: Number(lastClosed.from.slice(8)), to: dayMonth(lastClosed.to), payday: dayMonth(lastClosed.payday)}) : '', to: '/d/teacher-payments'}] : []),
        ...(!colibri || FEES_DONE.has('hector') ? [] : [{title: t('todo.fee', {n: 1}), sub: `Héctor Navarro · ${money(800)}`, to: '/d/payments?tab=fees'}]),
        ...(!colibri || SEEN.has('over:regina') ? [] : [{title: t('todo.overPlan', {n: 1}), sub: t('todo.overPlanSub', {name: 'Regina Flores', count: '5 / 4'}), to: '/d/students/regina'}]),
        // The other schools' to-dos come from their own records.
        ...(!colibri && feesOwed.length ? [{title: t('todo.fee', {n: feesOwed.length}), sub: `${feesOwed.map(s => personName(s.name)).join(' · ')} · ${money(fee)}`, to: '/d/payments?tab=fees'}] : []),
        ...(colibri ? [] : here.filter(s => s.overPlan && !SEEN.has(`over:${s.id}`)).map(s => ({title: t('todo.overPlan', {n: 1}), sub: t('todo.overPlanSub', {name: personName(s.name), count: s.overPlan ?? ''}), to: `/d/students/${s.id}`}))),
        ...(!colibri || SEEN.has('card:sofia') ? [] : [{title: t('todo.cardChanged', {n: 1}), sub: t('todo.cardChangedSub', {name: 'Sofía Ramírez', when: dayMonth('2026-11-24')}), to: '/d/students/sofia?tab=log'}]),
        ...[...GROWN].map(id => ({title: t('todo.deleteMinor', {name: personName(studentById(id).name)}), sub: t('todo.deleteMinorSub'), to: `/d/students/${id}/delete`})),
        ...(!colibri || GROWN.has('emilio') ? [] : [{title: t('todo.turns18', {n: 1}), sub: t('todo.turns18Sub', {name: 'Emilio Sánchez', when: dayMonth('2026-11-29')}), to: '/d/students/emilio'}]),
        ...(newOnes.length ? [{title: t('todo.newEnrollments', {n: newOnes.length}), sub: t('todo.newEnrollmentsSub', {names: newOnes.map(s => `${personName(s.name)} (${s.newEnrollment?.what})`).join(' · ')}), to: '/d/students?new=1'}] : []),
        ...(termsState().waiting.length ? [{title: t('todo.terms', {n: termsState().version}), sub: t('todo.termsSub', {done: termsState().accepted, of: termsState().students}), to: '/d/terms', chip: <span className="chip chip-terms">{termsState().waiting.length}</span>}] : []),
        ...(STRESS && colibri ? STUDENTS.filter(student => student.id.startsWith('st')).filter(student => !SEEN.has(`${Number(student.id.slice(2)) % 2 ? 'card' : 'new'}:${student.id}`)).map(student => Number(student.id.slice(2)) % 2
            ? {title: t('todo.cardChanged', {n: 1}), sub: t('todo.cardChangedSub', {name: personName(student.name), when: dayMonth('2026-11-25')}), to: `/d/students/${student.id}?tab=log`}
            : {title: t('todo.newEnrollments', {n: 1}), sub: t('todo.newEnrollmentsSub', {names: personName(student.name)}), to: `/d/students/${student.id}`}) : []),
    ];
    // The first few to-dos on the dashboard; the rest in a popup, so today's sessions stay near the top.
    const allTodos = useSheetRoute('todos');
    const FEW = 6;
    const view = router.query.get('view') === 'summary' ? 'summary' : 'today';
    return (
        <Screen title={t('dash.title')} subtitle={[SCHOOLS[currentSchool()].name, dayLong(TODAY)]}>
            <Segmented label={t('dash.title')} value={view} onChange={value => router.replace(router.withQuery('view', value === 'today' ? null : value))}
                       options={[{value: 'today', label: t('dash.viewToday')}, {value: 'summary', label: t('dash.viewSummary')}]}/>
            {view === 'summary' ? <SummaryView/> : (
            <>
            <div className="section-head">
                <h2 className="section-title">{t('dash.today', {n: today.length})}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.navigate('/d/calendar')}>{t('dash.calendar')}</button>
            </div>
            <Carousel label={t('dash.today', {n: today.length})} items={today} selected={picked} onSelect={setPicked} keyOf={session => session.id}
                      onOpen={index => router.navigate(`/d/session/${today[index].id}`)} openLabel={() => t('dash.openSession')}
                      render={session => (
                          <SessionBody session={session} extra={<span className="small strong">{session.checkedIn !== undefined
                              ? t('schedule.arrived', {n: session.checkedIn, of: session.expected ?? 0})
                              : t('schedule.expected', {n: session.expected ?? 0})}</span>}/>
                      )}/>
            <h2 className="section-title">{t('dash.todoN', {n: todos.length})}</h2>
            <ul className="list">
                {todos.slice(0, FEW).map((todo, index) => (
                    <ListRow key={index} fixed title={todo.title} sub={todo.sub} right={todo.chip} onClick={() => router.navigate(todo.to)}/>
                ))}
                {todos.length > FEW && (
                    <ListRow title={t('dash.moreTodos', {n: todos.length - FEW})} onClick={() => allTodos.show()}/>
                )}
            </ul>
            <Sheet open={allTodos.open} onClose={allTodos.close} title={t('dash.todoN', {n: todos.length})} tall>
                <p className="hint">{t('dash.todosHow')}</p>
                <ul className="list">
                    {todos.map((todo, index) => (
                        <ListRow key={index} fixed title={todo.title} sub={todo.sub} right={todo.chip} onClick={() => router.navigate(todo.to)}/>
                    ))}
                </ul>
            </Sheet>
            </>
            )}
        </Screen>
    );
}

/**
 * A new school's first steps, in the order they depend on each other: the terms (students can't be
 * registered without them), rooms and teachers (a class needs both), prices (a class's payment
 * options take them), the classes in Plan, then the students. Each row opens its screen and shows
 * whether it's done; the sample school (Colibrí) has them all done, `?new=1` shows a new one.
 */
export function Setup() {
    const router = useRouter();
    const fresh = router.query.get('new') === '1';
    const steps: { title: string; sub: string; to: string; done: boolean }[] = [
        {title: t('setup.terms'), sub: t('setup.termsSub'), to: '/d/terms', done: !fresh},
        {title: t('setup.rooms'), sub: t('setup.roomsSub'), to: '/d/rooms', done: !fresh},
        {title: t('setup.teachers'), sub: t('setup.teachersSub'), to: '/d/teachers', done: !fresh},
        {title: t('setup.prices'), sub: t('setup.pricesSub'), to: '/d/prices', done: !fresh},
        {title: t('setup.classes'), sub: t('setup.classesSub'), to: '/d/calendar?tab=plan', done: !fresh},
        {title: t('setup.students'), sub: t('setup.studentsSub'), to: '/d/register', done: !fresh},
    ];
    const done = steps.filter(step => step.done).length;
    const next = steps.findIndex(step => !step.done);
    return (
        <Screen title={t('setup.title')} subtitle={fresh ? 'Estudio Aéreo del Sur' : SCHOOLS[currentSchool()].name} back="/d/home" nav={false}
                footer={next >= 0
                    ? <button type="button" className="btn btn-lg" onClick={() => router.navigate(steps[next].to)}>{t('setup.next', {step: steps[next].title})}</button>
                    : <button type="button" className="btn btn-lg" onClick={() => router.back('/d/home')}>{t('setup.toDashboard')}</button>}>
            <div className="card">
                <div className="row"><span className="strong">{t('setup.progress', {done, of: steps.length})}</span></div>
                <div className="progress"><span style={{width: `${Math.round(done / steps.length * 100)}%`}}/></div>
                <span className="small muted">{t('setup.body')}</span>
            </div>
            <ul className="list">
                {steps.map((step, index) => (
                    <ListRow key={step.to} title={step.title} sub={step.sub}
                             left={<span className={step.done ? 'avatar avatar-ok' : 'avatar'}>{step.done ? <Icon name="check" size={18}/> : index + 1}</span>}
                             right={index === next ? <span className="chip chip-outline">{t('setup.now')}</span> : undefined}
                             onClick={() => router.navigate(step.to)}/>
                ))}
            </ul>
        </Screen>
    );
}

// ---- Calendar: Mes (what happens) and Planear (the weekly pattern) ----

export function Calendar() {
    const router = useRouter();
    const confirm = useConfirm();
    const toast = useToast();
    const [vacationMode, setVacationMode] = useState(false);
    const [vacationDates, setVacationDates] = useState<string[]>([]);
    const tab = router.query.get('tab') === 'plan' ? 'plan' : 'month';
    const removeVacation = vacationDates.length > 0 && vacationDates.every(date => isVacationDate(currentSchool(), date));
    const vacationChanges = removeVacation ? vacationDates : vacationDates.filter(date => !isVacationDate(currentSchool(), date));
    return (
        <Screen title={t('cal.title')} subtitle={SCHOOLS[currentSchool()].name}
                footer={tab === 'plan' ? (
                    <div className="btn-row">
                        <button type="button" className="btn btn-secondary btn-lg" onClick={() => router.navigate('/d/activity/new?kind=free')}>
                            <Icon name="plus"/>{t('plan.addFreeShort')}
                        </button>
                        <button type="button" className="btn btn-lg" onClick={() => router.navigate('/d/activity/new')}>
                            <Icon name="plus"/>{t('plan.addShort')}
                        </button>
                    </div>
                ) : vacationMode && (
                    <button type="button" className="btn btn-lg" disabled={vacationChanges.length === 0} onClick={async () => {
                        if (await confirm({
                            title: t(removeVacation ? 'vacation.confirmRemoveTitle' : 'vacation.confirmTitle', {n: vacationChanges.length}),
                            body: t(removeVacation ? 'vacation.confirmRemoveBody' : 'vacation.confirmBody', {dates: vacationChanges.map(dayMonth).join(', ')}),
                            confirm: t(removeVacation ? 'vacation.remove' : 'vacation.publish'),
                        })) {
                            if (!await markVacation(vacationChanges, !removeVacation)) return;
                            toast(t(removeVacation ? 'vacation.removed' : 'vacation.published', {n: vacationChanges.length}));
                            setVacationDates([]);
                            setVacationMode(false);
                        }
                    }}>{t(removeVacation ? 'vacation.remove' : 'vacation.publish')}</button>
                )}>
            <Segmented label={t('cal.view')} value={tab}
                       onChange={value => router.replace(router.withQuery('tab', value === 'month' ? null : value))}
                       options={[{value: 'month', label: t('cal.month')}, {value: 'plan', label: t('cal.plan')}]}/>
            {tab === 'month' ? <MonthView vacationMode={vacationMode} vacationDates={vacationDates}
                                          onVacationMode={setVacationMode}
                                          onSelectVacation={date => setVacationDates(list => list.includes(date) ? list.filter(item => item !== date) : [...list, date])}
                                          onSelectWeek={date => {
                                              const monday = addDays(date, 1 - weekdayOf(date));
                                              const week = Array.from({length: 7}, (_, index) => addDays(monday, index))
                                                  .filter(selected => selected >= TODAY && !isVacationDate(currentSchool(), selected));
                                              setVacationDates(list => [...new Set([...list, ...week])]);
                                          }}
                                          onClearVacationSelection={() => setVacationDates([])}/> : <PlanView/>}
        </Screen>
    );
}

/** Is the session over? Past sessions only offer their attendance: there's nothing left to change. */
const isPast = (session: Session) => session.date < TODAY || (session.date === TODAY && session.end <= NOW);

function MonthView({vacationMode, vacationDates, onVacationMode, onSelectVacation, onSelectWeek, onClearVacationSelection}: {
    vacationMode: boolean;
    vacationDates: string[];
    onVacationMode: (enabled: boolean) => void;
    onSelectVacation: (date: string) => void;
    onSelectWeek: (date: string) => void;
    onClearVacationSelection: () => void;
}) {
    const router = useRouter();
    const day = router.query.get('day') ?? TODAY;
    const onlyMine = router.query.get('mine') === '1';
    // A director who teaches: their own sessions, or ones they cover.
    const isMine = (session: Session) => teacherOf(session) === STAFF_ME.d || session.substitute === STAFF_ME.d;
    const on = (date: string) => sessionsOn(date).filter(session => !onlyMine || isMine(session));
    const sheet = useSheetRoute('session');
    const first = `${day.slice(0, 7)}-01`;
    const lead = weekdayOf(first) - 1;
    const cells = Array.from({length: 42}, (_, i) => addDays(first, i - lead)).filter((date, i) => i < 35 || date.startsWith(first.slice(0, 7)));
    const goMonth = (iso: string) => router.replace(router.withQuery('day', iso === TODAY.slice(0, 7) + '-01' ? TODAY : iso));
    const list = on(day);
    const open = sheet.item ? sessionById(sheet.item) : null;

    return (
        <>
            <div className="row">
                <span className="month-nav">
                    <button type="button" className="icon-btn" aria-label={t('schedule.prevMonth')} disabled={first <= monthRange().min}
                            onClick={() => goMonth(shiftMonth(first, -1))}><Icon name="back"/></button>
                    <span className="big">{monthYear(first)}</span>
                    <button type="button" className="icon-btn" aria-label={t('schedule.nextMonth')} disabled={first >= monthRange().max}
                            onClick={() => goMonth(shiftMonth(first, 1))}><Icon name="chevron"/></button>
                </span>
                <div className="wrap">
                    <button type="button" className="chip-toggle" aria-pressed={onlyMine}
                            onClick={() => router.replace(router.withQuery('mine', onlyMine ? null : '1'))}>
                        {t('cal.mine')}
                    </button>
                    <button type="button" className="chip-toggle" aria-pressed={vacationMode}
                            onClick={() => onVacationMode(!vacationMode)}>{t(vacationMode ? 'vacation.doneSelecting' : 'vacation.select')}</button>
                </div>
            </div>
            {vacationMode && (
                <div className="card">
                    <p className="small">{t('vacation.selectHint')}</p>
                    <div className="row">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectWeek(day)}>{t('vacation.selectWeek')}</button>
                        {vacationDates.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onClearVacationSelection}>{t('vacation.clear')}</button>}
                    </div>
                    {vacationDates.length > 0 && <p className="small muted">{t('vacation.selected', {n: vacationDates.length})}</p>}
                </div>
            )}
            <div className="month" role="group" aria-label={monthYear(first)}>
                {[1, 2, 3, 4, 5, 6, 7].map(w => <span key={w} className="month-head" aria-hidden="true">{weekdayShort(w).slice(0, 2)}</span>)}
                {cells.map(date => {
                    const sessions = on(date);
                    const out = !date.startsWith(first.slice(0, 7));
                    const vacation = isVacationDate(currentSchool(), date);
                    const selected = vacationDates.includes(date);
                    return (
                        <button key={date} type="button" aria-pressed={vacationMode ? selected : date === day} data-out={out} data-today={date === TODAY}
                                data-vacation={vacation || undefined} data-selected={selected || undefined}
                                disabled={vacationMode && date < TODAY && !vacation}
                                aria-label={`${dayLong(date)}: ${t('cal.nSessions', {n: sessions.length})}${vacation ? `, ${t('legend.vacation')}` : ''}`}
                                onClick={() => vacationMode ? onSelectVacation(date) : router.replace(router.withQuery('day', date))}>
                            {Number(date.slice(8))}
                            <span className="dots">
                                {vacation && <i data-kind="vacation"/>}
                                {sessions.slice(0, 4).map(session => (
                                    <i key={session.id} data-kind={session.status === 'cancelled' ? 'cancelled' : session.substitute ? 'substitute' : 'class'}/>
                                ))}
                            </span>
                        </button>
                    );
                })}
            </div>
            <DotLegend/>
            {!vacationMode && isVacationDate(currentSchool(), day) && <div className="banner banner-vacation">{t('vacation.classesCanceled')}</div>}
            <h2 className="section-title">{dayLong(day)}</h2>
            {list.length === 0 && <Empty>{t('cal.noSessions')}</Empty>}
            {list.map(session => (
                <SessionCard key={session.id} session={session} onClick={() => sheet.show(session.id)}
                             extra={(isPast(session) && session.status !== 'cancelled') || isMine(session) ? (
                                 <span className="wrap">
                                     {isMine(session) && <span className="chip chip-outline">{t('cal.yours')}</span>}
                                     {isPast(session) && session.status !== 'cancelled' && <span className="chip">{t('cal.past')}</span>}
                                 </span>
                             ) : undefined}/>
            ))}
            <Sheet open={sheet.open} onClose={sheet.close} title={open ? classById(open.classId).name : ''}>
                {open && (
                    <>
                        {isVacationDate(currentSchool(), open.date) && <div className="banner banner-vacation">{t('vacation.classesCanceled')}</div>}
                        <p className="muted">{dayLong(open.date)} · {timeRange(open.start, open.end)} · {roomName(open.room)}</p>
                        <p>{open.substitute ? t('session.givenBy', {name: teacherName(open.substitute)}) : teacherName(teacherOf(open))}</p>
                        {open.status === 'cancelled' ? (
                            <div className="banner">{t('cal.isCancelled')}</div>
                        ) : isPast(open) ? (
                            <>
                                <p className="hint">{t('cal.pastHint')}</p>
                                <ul className="list">
                                    <ListRow left={<Icon name="people"/>} title={t('cal.attendance')} sub={t('cal.attendanceSub')} onClick={() => router.navigate(`/d/session/${open.id}`)}/>
                                </ul>
                            </>
                        ) : (
                            <>
                                <ul className="list">
                                    <ListRow left={<Icon name="qr"/>} title={t('cal.openSession')} sub={t('cal.sessionSub')} onClick={() => router.navigate(`/d/session/${open.id}`)}/>
                                </ul>
                                {/* Once or from now on: the two ways a director thinks of a change, each with its own rows. */}
                                <h3 className="section-title">{t('cal.onlyThis', {when: dayMonth(open.date)})}</h3>
                                <ul className="list">
                                    <ListRow left={<Icon name="clock"/>} title={t('cal.move')} sub={t('cal.moveSub')} onClick={() => router.navigate(`/d/move/${open.id}`)}/>
                                    <ListRow left={<Icon name="swap"/>} title={t('cal.substitute')} sub={t('cal.substituteSub')} onClick={() => router.navigate(`/d/substitute/${open.id}`)}/>
                                    <ListRow left={<span className="text-danger"><Icon name="close"/></span>} title={<span className="text-danger">{t('cal.cancel')}</span>} sub={t('cal.cancelSub')} onClick={() => router.navigate(`/d/cancel/${open.id}`)}/>
                                </ul>
                                {classById(open.classId).kind === 'weekly' && (
                                    <>
                                        <h3 className="section-title">{t('cal.fromThis', {when: dayMonth(open.date)})}</h3>
                                        <ul className="list">
                                            <ListRow left={<Icon name="repeat"/>} title={t('cal.editPattern')} sub={t('cal.editPatternSub')}
                                                     onClick={() => router.navigate(`/d/activity/${open.classId}?since=${open.date}`)}/>
                                            <ListRow left={<Icon name="people"/>} title={t('cal.newTeacher')} sub={t('cal.newTeacherSub')}
                                                     onClick={() => router.navigate(`/d/substitute/${open.id}?all=1`)}/>
                                            <ListRow left={<span className="text-danger"><Icon name="trash"/></span>} title={<span className="text-danger">{t('cal.endClass')}</span>} sub={t('cal.endClassSub')}
                                                     onClick={() => router.navigate(`/d/activity/${open.classId}/end?last=${open.date}&via=cal`)}/>
                                        </ul>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </Sheet>
        </>
    );
}

function PlanView() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const ours = CLASSES.filter(item => item.kind === 'weekly' && schoolOfClass(item) === currentSchool());
    const matches = (item: typeof ours[number]) => [item.name, teacherName(item.teacher), ...item.slots.map(slot => roomName(slot.room))]
        .some(text => text.toLowerCase().includes(query.trim().toLowerCase()));
    const weekly = ours.filter(matches);
    const many = ours.length > 15;
    const onlyDay = Number(router.query.get('wd')) || 0;
    const free = SESSIONS.filter(session => classById(session.classId).kind === 'free' && schoolOfSession(session) === currentSchool());
    return (
        <>
            <p className="small">{t('plan.intro')}</p>
            {ours.length > 15 && (
                <SearchField id="plan-search" label={t('plan.search')} value={query} onChange={setQuery}
                             beside={<span className="small muted">{t('plan.count', {n: weekly.filter(item => !onlyDay || item.slots.some(slot => slot.weekday === onlyDay)).length, of: ours.length})}</span>}/>
            )}
            {many && (
                <div className="day-row" role="group" aria-label={t('plan.byDay')}>
                    {[1, 2, 3, 4, 5, 6, 7].map(weekday => (
                        <button key={weekday} type="button" className="day-toggle" aria-pressed={onlyDay === weekday} aria-label={weekdayLong(weekday)}
                                onClick={() => router.replace(router.withQuery('wd', onlyDay === weekday ? null : String(weekday)))}>
                            {weekdayLetter(weekday)}
                        </button>
                    ))}
                </div>
            )}
            {[1, 2, 3, 4, 5, 6, 7].filter(weekday => !onlyDay || weekday === onlyDay).map(weekday => {
                const slots = weekly.flatMap(item => item.slots.filter(slot => slot.weekday === weekday).map(slot => ({
                    item,
                    slot
                })))
                    .sort((a, b) => a.slot.start.localeCompare(b.slot.start));
                if (slots.length === 0) return null;
                return (
                    <section key={weekday} className="stack">
                        <h2 className="section-title">{weekdayLong(weekday)}</h2>
                        {slots.map(({item, slot}) => {
                            const overCapacity = weekday === 6 && slot.room === 's1' && item.id === 'retrato';
                            return (
                                <div key={item.id + slot.start} className="card">
                                    <button type="button" className="list-row list-row-bare" 
                                            onClick={() => router.navigate(`/d/activity/${item.id}`)}>
                                        <span className="grow">
                                            <span className="big">{item.name}</span>
                                            <span
                                                className="small">{teacherName(item.teacher)} · {roomName(slot.room)}</span>
                                            <span className="small muted">{t('plan.slotSub', {
                                                start: time(slot.start),
                                                end: time(slot.end),
                                                n: item.students,
                                                until: dayMonth(item.until)
                                            })}</span>
                                        </span>
                                        <span className="chev"><Icon name="chevron" size={18}/></span>
                                    </button>
                                    <span className="wrap">
                                        {overCapacity && <span className="chip chip-warning"><Icon name="alert" size={12}/>{t('plan.capacityChip')}</span>}
                                        {item.ending && <span className="chip chip-cancelled">{t('plan.ends', {when: dayMonth(item.until)})}</span>}
                                        {item.from > TODAY && <span className="chip">{t('plan.startsOn', {when: dayMonth(item.from)})}</span>}
                                        {item.inPackages && <span className="chip">{t('classes.inPackages')}</span>}
                                        {item.monthly && <span className="chip">{t('classes.monthly', {amount: money(item.monthly.price)})}</span>}
                                        {item.perVisit && <span className="chip">{t('classes.perVisit')}</span>}
                                    </span>
                                    <button type="button" className="btn btn-ghost btn-sm self-start"
                                            onClick={() => router.navigate(`/d/activity/new?from=${item.id}`)}>
                                        <Icon name="copy" size={18}/>{t('plan.duplicate')}
                                    </button>
                                </div>
                            );
                        })}
                    </section>
                );
            })}
            <h2 className="section-title">{t('plan.freeHours')}</h2>
            {free.map(session => (
                <SessionCard key={session.id} session={session} showDate
                             onClick={() => router.navigate(`/d/activity/${session.classId}`)}
                             extra={<span className="small">{t('plan.booked', {n: 3, of: 4})}</span>}/>
            ))}
        </>
    );
}

/**
 * One activity of the plan: a class with its teacher, days and times, room, dates and maximum of
 * students. "Duplicar" opens this prefilled from another one. Students enroll themselves from
 * their app; the button turns on once everything needed is filled in.
 */
export function ActivityForm({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const copyOf = router.query.get('from');
    // A replacement for a class that ends: it starts the day after the old one's last session.
    const after = router.query.get('after');
    const starts = after ? addDays(after, 1) : TODAY;
    const source = id !== 'new' ? classById(id) : copyOf ? classById(copyOf) : null;
    const editing = id !== 'new';
    const isGrabado = id === 'grabado';
    const [name, setName] = useState(source ? source.name : '');
    const [teacher, setTeacher] = useState(source?.teacher ?? '');
    // Which kind it is was chosen already: the button (Actividad or Horas libres), or the activity itself.
    const kind = router.query.get('kind') === 'free' || source?.kind === 'free' ? 'free' : 'weekly';
    const [days, setDays] = useState<number[]>((editing || after) && source ? source.slots.map(slot => slot.weekday) : []);
    // Editing a weekly class changes it from one of its next sessions on; the earlier ones stay.
    const upcoming = editing && source && kind === 'weekly' ? datesOf(source, TODAY) : [];
    const [since, setSince] = useState(router.query.get('since') ?? upcoming[0] ?? '');
    const started = editing && source ? source.from <= TODAY : false;
    const [notify, setNotify] = useState(true);
    const [from, setFrom] = useState(editing && source ? source.from : starts);
    const [until, setUntil] = useState(source && source.until > starts ? source.until : addDays(starts, 84));
    const [start, setStart] = useState(isGrabado ? '13:30' : source?.slots[0]?.start ?? '');
    const [end, setEnd] = useState(isGrabado ? '15:30' : source?.slots[0]?.end ?? '');
    const [room, setRoom] = useState(source?.slots[0]?.room ?? '');
    const [max, setMax] = useState(source?.max ? String(source.max) : '');
    const [pays, setPays] = useState({pkg: Boolean(source?.inPackages), monthly: Boolean(source?.monthly), visit: Boolean(source?.perVisit)});
    const capacity = days.includes(6) && room === 's1' && start >= '13:00' && start < '15:00';
    // Editing: the name is the first field, so the title says what's being done and the subtitle which one.
    const title = editing ? t(kind === 'free' ? 'activity.editFreeTitle' : 'activity.editTitle') : after ? t('activity.replaceTitle') : copyOf ? t('activity.copyTitle') : t(kind === 'free' ? 'activity.newFreeTitle' : 'activity.newTitle');
    const missing = [
        name.trim().length < 2 && t('activity.name'),
        !teacher && t('activity.teacher'),
        kind === 'weekly' && days.length === 0 && t('activity.days'),
        kind === 'weekly' && (!from || !until || until < from) && t('activity.dates'),
        (!start || !end || end <= start) && t('activity.times'),
        !room && t('activity.room'),
        !Number(max) && t('activity.max'),
        kind === 'weekly' && !pays.pkg && !pays.monthly && !pays.visit && t('activity.howPaid'),
    ].filter(Boolean) as string[];

    return (
        <Screen title={title} subtitle={editing ? source?.name : after ? t('activity.replaceSub', {name: source?.name ?? ''}) : copyOf ? t(kind === 'free' ? 'activity.free' : 'activity.weekly') : undefined} back="/d/calendar?tab=plan" nav={false}
                note={missing.length ? t('activity.missing', {list: missing.join(', ')}) : undefined}
                footer={<>
                    <button type="button" className="btn btn-lg" disabled={missing.length > 0} onClick={async () => {
                        if (editing && !(await confirm({
                            title: t('activity.saveTitle'),
                            body: kind === 'weekly' ? t('activity.saveBody', {when: dayMonth(since), n: source?.students ?? 0}) : t('activity.saveBodyFree'),
                            confirm: t('form.saveChanges'),
                        }))) return;
                        if (kind === 'weekly') {
                            const fields: ClassFields = {
                                name: name.trim(), teacher, from, until, max: Number(max), inPackages: pays.pkg, perVisit: pays.visit,
                                monthly: pays.monthly ? source?.monthly : undefined,
                                slots: [...days].sort().map(weekday => ({weekday, start, end, room})),
                            };
                            if (editing) editClass(id, fields, since);
                            else createClass(fields, after && notify ? copyOf ?? undefined : undefined);
                        }
                        toast(t(after && notify ? 'activity.savedNotified' : 'activity.saved', {n: source?.students ?? 0}));
                        if (after) router.leave(1, '/d/calendar?tab=plan');
                        else router.back('/d/calendar?tab=plan');
                    }}>{editing ? t('form.saveChanges') : t(kind === 'free' ? 'activity.createFree' : 'activity.create')}</button>
                    {editing && kind === 'weekly' && (
                        <button type="button" className="btn btn-ghost-danger" onClick={() => router.navigate(`/d/activity/${id}/end`)}>{t('cal.endClass')}</button>
                    )}
                </>}>
            {copyOf && <div className="banner">{after ? t('activity.replaceNote', {name: source?.name ?? '', when: dayMonth(after)}) : t('activity.copyNote', {name: source?.name ?? ''})}</div>}
            {upcoming.length > 0 && (
                <SelectField id="ac-since" label={t('activity.since')} value={since} onChange={setSince} hint={t('activity.sinceHint')}
                             options={upcoming.map(date => ({value: date, label: dayLong(date)}))}/>
            )}
            <TextField id="ac-name" label={t('activity.name')} value={name} onChange={event => setName(event.target.value)}/>
            <SelectField id="ac-teacher" label={t('activity.teacher')} value={teacher} onChange={setTeacher} placeholder={t('common.pick')}
                         options={TEACHERS.filter(item => item.status === 'active' && (item.schools ?? ['colibri']).includes(currentSchool())).map(item => ({value: item.id, label: item.name}))}/>
            {kind === 'weekly' ? (
                <>
                    <div className="field">
                        <span className="label" id="ac-days">{t('activity.days')}</span>
                        <div className="day-row" role="group" aria-labelledby="ac-days">
                            {[1, 2, 3, 4, 5, 6, 7].map(weekday => {
                                const on = days.includes(weekday);
                                return (
                                    <button key={weekday} type="button" className="day-toggle" aria-pressed={on} aria-label={weekdayLong(weekday)}
                                            onClick={() => setDays(list => on ? list.filter(d => d !== weekday) : [...list, weekday])}>
                                        {weekdayLetter(weekday)}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="hint">{t('activity.daysHint')}</span>
                    </div>
                    <div className="two">
                        <DateField id="ac-from" label={t('activity.from')} disabled={started} hint={started ? t('activity.startedHint') : undefined}
                                   value={from} onChange={setFrom}/>
                        <DateField id="ac-until" label={t('activity.until')} hint={editing ? t('activity.untilHint') : undefined}
                                   value={until} onChange={setUntil}/>
                    </div>
                </>
            ) : (
                <DateField id="ac-date" label={t('activity.date')} defaultValue="2026-11-27"/>
            )}
            <div className="two">
                <TimeField id="ac-start" label={t('activity.start')} value={start} onChange={setStart}/>
                <TimeField id="ac-end" label={t('activity.end')} value={end} onChange={setEnd}/>
            </div>
            <SelectField id="ac-room" label={t('activity.room')} value={room} onChange={setRoom} placeholder={t('common.pick')}
                         options={roomsHere().filter(r => !r.archived).map(r => ({value: r.id, label: r.name}))}/>
            {capacity && (
                <div className="banner banner-warning" role="status">
                    <span className="strong row-start"><Icon name="alert" size={18}/>{t('activity.capacityTitle')}</span>
                    <span>{t('activity.capacityBody', {room: 'Sala aérea 1', n: 32, max: 30, other: 'Pole dance'})}</span>
                    <span className="small">{t('activity.capacityCan')}</span>
                </div>
            )}
            <h2 className="section-title">{t('activity.students')}</h2>
            <NumberField id="ac-max" label={t(kind === 'free' ? 'activity.maxFree' : 'activity.max')} value={max} onChange={event => setMax(event.target.value)}
                         hint={t(kind === 'free' ? 'activity.maxFreeHint' : 'activity.maxHint')}/>
            {source && editing && <p className="small">{t(kind === 'free' ? 'activity.bookedN' : 'activity.enrolledN', {n: source.students})}{source.inPackages ? ` · ${t('activity.packageNote')}` : ''}</p>}
            <p className="hint">{t('activity.selfEnroll')}</p>
            {after && source && source.students > 0 && (
                <Check id="ac-notify" label={t('activity.notifyOld', {n: source.students, name: source.name})} checked={notify} onChange={setNotify}
                       hint={t('activity.notifyOldHint')}/>
            )}
            {kind === 'weekly' && (
                <>
                    <h2 className="section-title">{t('activity.howPaid')}</h2>
                    <Check id="ac-pkg" label={t('activity.inPackages')} checked={pays.pkg} onChange={pkg => setPays({...pays, pkg})}/>
                    <Check id="ac-monthly" label={t('activity.monthly')} checked={pays.monthly} onChange={monthly => setPays({...pays, monthly})}
                           hint={source?.monthly ? t('activity.monthlyPrice', {amount: money(source.monthly.price), n: source.monthly.sessions}) : undefined}/>
                    <Check id="ac-visit" label={t('activity.perVisit')} checked={pays.visit} onChange={visit => setPays({...pays, visit})}/>
                    <p className="hint">{t('activity.pricesHint')}</p>
                </>
            )}
        </Screen>
    );
}

/** A weekly class's next dates (from a date on, up to its last date): for "from when" and "last session" dropdowns. */
function datesOf(item: SchoolClass, since: string, count = 16): string[] {
    const out: string[] = [];
    for (let date = since < item.from ? item.from : since; date <= item.until && out.length < count; date = addDays(date, 1)) {
        if (item.slots.some(slot => slot.weekday === weekdayOf(date))) out.push(date);
    }
    return out;
}

const ourRooms = () => roomsHere().filter(r => !r.archived).map(r => ({value: r.id, label: r.name}));

/**
 * Moving a session to another day, time or room: in the data, a cancellation with its replacement
 * linked to it (rule 17), so there's no separate "move"; on screen it's what the director means.
 */
export function MoveSession({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const session = sessionById(id);
    const [date, setDate] = useState(session.date);
    const [start, setStart] = useState(session.start);
    const [end, setEnd] = useState(session.end);
    const [room, setRoom] = useState(session.room);
    const changed = date !== session.date || start !== session.start || end !== session.end || room !== session.room;
    const valid = changed && Boolean(date) && date >= TODAY && end > start;
    return (
        <Screen title={t('move.title')} back="/d/calendar" nav={false}
                note={valid ? t('cancel.hint') : changed && end <= start ? t('move.badTimes') : t('move.pick')}
                footer={<button type="button" className="btn btn-lg" disabled={!valid} onClick={async () => {
                    if (await confirm({
                        title: t('move.confirmTitle'),
                        body: t('move.confirmBody', {when: `${dayMonth(date)} · ${timeRange(start, end)}`, n: session.expected ?? 0}),
                        confirm: t('move.button'),
                    })) {
                        moveSession(id, {date, start, end, room});
                        toast(t('move.done'));
                        router.back('/d/calendar');
                    }
                }}>{t('move.button')}</button>}>
            <SessionCard session={session} showDate/>
            <h2 className="section-title">{t('move.to')}</h2>
            <DateField id="mv-date" label={t('activity.date')} min={TODAY} value={date} onChange={setDate}/>
            <div className="two">
                <TimeField id="mv-start" label={t('activity.start')} value={start} onChange={setStart}/>
                <TimeField id="mv-end" label={t('activity.end')} value={end} onChange={setEnd}/>
            </div>
            <SelectField id="mv-room" label={t('activity.room')} value={room} onChange={setRoom} options={ourRooms()}/>
            <p className="hint">{t('move.onlyThis')}</p>
        </Screen>
    );
}

/** Cancelling a session that won't be given at all; one given another day is moved instead. */
export function CancelSession({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const session = sessionById(id);
    return (
        <Screen title={t('cancel.title')} back="/d/calendar" nav={false}
                note={t('cancel.hint')}
                footer={<button type="button" className="btn btn-danger btn-lg" onClick={async () => {
                    if (await confirm({
                        title: t('cancel.confirmTitle'),
                        body: t('cancel.confirmBody', {n: session.expected ?? 0}),
                        confirm: t('cancel.button'),
                        danger: true,
                    })) {
                        cancelSession(id);
                        toast(t('cancel.done'));
                        router.back('/d/calendar');
                    }
                }}>{t('cancel.button')}</button>}>
            <SessionCard session={session} showDate/>
            <p>{t('cancel.what', {n: session.expected ?? 0})}</p>
            <div className="card">
                <span>{t('cancel.otherDay')}</span>
                <button type="button" className="btn btn-secondary" onClick={() => router.replace(`/d/move/${id}`)}>
                    <Icon name="clock" size={18}/>{t('cancel.moveInstead')}
                </button>
            </div>
        </Screen>
    );
}

/**
 * Who gives it: a substitute for this session only, or (`?all=1`) a new teacher for the class from
 * one of its sessions on. The popup's two rows open it in one mode each, so it doesn't ask which.
 */
export function Substitute({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const session = sessionById(id);
    const item = classById(session.classId);
    const all = router.query.get('all') === '1';
    const [who, setWho] = useState('');
    const dates = datesOf(item, session.date);
    const [from, setFrom] = useState(session.date);
    // This session's own teacher (it may differ from the class's now, after a change of teacher).
    const regular = all ? item.teacher : teacherOf(session);
    const others = TEACHERS.filter(teacher => teacher.status === 'active' && teacher.id !== regular && teacher.id !== session.substitute
        && (teacher.schools ?? ['colibri']).includes(currentSchool())).map(teacher => ({value: teacher.id, label: personName(teacher.name)}));
    // Already given to a substitute: the session's teacher is offered first, to take it back.
    const options = !all && session.substitute ? [{value: regular, label: t('sub.backTo', {name: teacherName(regular)})}, ...others] : others;
    return (
        <Screen title={t(all ? 'sub.allTitle' : 'sub.title')} subtitle={all ? item.name : undefined} back="/d/calendar" nav={false}
                note={who ? t('sub.hint') : t('sub.pickWho')}
                footer={<button type="button" className="btn btn-lg" disabled={!who} onClick={async () => {
                    if (await confirm({
                        title: t(all ? 'sub.confirmAll' : 'sub.confirmOne'),
                        body: all ? t('sub.confirmAllBody', {name: teacherName(who), when: dayMonth(from)}) : t('sub.confirmBody'),
                        confirm: t('form.saveChanges'),
                    })) {
                        if (all) changeTeacher(item.id, who, from);
                        else giveToSubstitute(id, who);
                        toast(t('sub.done'));
                        router.back('/d/calendar');
                    }
                }}>{t('form.saveChanges')}</button>}>
            {all ? (
                <p>{t('sub.nowAll', {name: teacherName(item.teacher), slots: item.slots.map(slot => `${weekdayShort(slot.weekday)} ${time(slot.start)}`).join(', ')})}</p>
            ) : (
                <>
                    <SessionCard session={session} showDate/>
                    <p>{session.substitute ? t('sub.nowSub', {name: teacherName(session.substitute), teacher: teacherName(regular)}) : t('sub.now', {name: teacherName(regular)})}</p>
                </>
            )}
            <SelectField id="sub-who" label={t(all ? 'sub.newTeacher' : 'sub.who')} value={who} onChange={setWho} placeholder={t('common.pick')}
                         options={options}/>
            {all && (
                <SelectField id="sub-from" label={t('sub.from')} value={from} onChange={setFrom} hint={t('sub.fromHint', {name: teacherName(item.teacher)})}
                             options={dates.map(date => ({value: date, label: dayLong(date)}))}/>
            )}
            <p className="hint">{t(all ? 'sub.allHint' : 'sub.oneHint')}</p>
        </Screen>
    );
}

/**
 * Ending a class: its last session is picked from the ones ahead; the sessions after it go, the past
 * ones and their attendance stay, and its students' enrollments end with it.
 */
export function EndClass({id}: { id: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const item = classById(id);
    const dates = datesOf(item, TODAY);
    const [last, setLast] = useState(router.query.get('last') ?? '');
    const via = router.query.get('via');
    return (
        <Screen title={t('end.title')} subtitle={item.name} back={via === 'cal' ? '/d/calendar' : `/d/activity/${id}`} nav={false}
                note={last ? t('end.hint') : t('end.pick')}
                footer={<button type="button" className="btn btn-danger btn-lg" disabled={!last} onClick={async () => {
                    if (await confirm({title: t('end.confirmTitle', {name: item.name}), body: t('end.confirmBody', {when: dayMonth(last)}), confirm: t('end.button'), danger: true})) {
                        endClass(id, last);
                        const done = `/d/activity/${id}/ended?last=${last}${via ? `&via=${via}` : ''}`;
                        // From the class's form, the form goes too: back from done lands on Plan.
                        if (via === 'cal') router.replace(done);
                        else router.leave(1, done);
                    }
                }}>{t('end.button')}</button>}>
            <p className="muted">{t('sub.nowAll', {name: teacherName(item.teacher), slots: item.slots.map(slot => `${weekdayShort(slot.weekday)} ${time(slot.start)}`).join(', ')})}</p>
            <SelectField id="end-last" label={t('end.last')} value={last} onChange={setLast} placeholder={t('common.pick')}
                         options={dates.map(date => ({value: date, label: dayLong(date)}))}/>
            <h2 className="section-title">{t('end.what')}</h2>
            <ul className="stack plain-list" >
                <li>{t('end.enrollments', {n: item.students})}</li>
                {item.inPackages && <li>{t('end.packages')}</li>}
                <li>{t('end.board')}</li>
                <li>{t('end.kept')}</li>
            </ul>
            <ul className="list">
                <ListRow left={<Icon name="repeat"/>} title={t('cal.editPattern')} sub={t('end.onlyChangeShort')} onClick={() => router.replace(`/d/activity/${id}`)}/>
            </ul>
        </Screen>
    );
}

/** The class is ended; the one that takes its place can start from a copy of it. */
export function ClassEnded({id}: { id: string }) {
    const router = useRouter();
    const item = classById(id);
    const last = router.query.get('last') ?? TODAY;
    const exit = router.query.get('via') === 'cal' ? '/d/calendar' : '/d/calendar?tab=plan';
    return (
        <Screen title={t('end.title')} back={exit} nav={false}
                footer={<>
                    <button type="button" className="btn btn-lg" onClick={() => router.replace(`/d/activity/new?from=${id}&after=${last}`)}>{t('end.replace')}</button>
                    <button type="button" className="btn btn-secondary btn-lg" onClick={() => router.leave(1, exit)}>{t('common.done')}</button>
                </>}>
            <DoneMessage title={t('end.doneTitle', {name: item.name, when: dayMonth(last)})} body={t('end.doneBody', {n: item.students})} confetti={false}/>
        </Screen>
    );
}

// ---- Payments ----

export function DirectorPayments() {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const tab = router.query.get('tab') ?? 'review';
    const pending = PROOFS.filter(proof => proof.school === currentSchool() && proof.state === 'uploaded' && !isPass(proof.method) && !REVIEWED.has(proof.id));
    const [, redraw] = useState(0);
    const feeDone = FEES_DONE.has('hector');
    const colibri = currentSchool() === 'colibri';
    return (
        <Screen title={t('dpay.title')} subtitle={SCHOOLS[currentSchool()].name}
>
            <Segmented label={t('dpay.title')} value={tab}
                       onChange={value => router.replace(router.withQuery('tab', value === 'review' ? null : value))}
                       options={[{value: 'review', label: t('dpay.review', {n: pending.length})}, {
                           value: 'fees',
                           label: t('dpay.fees')
                       }, {value: 'due', label: t('dpay.due')}]}/>
            {tab === 'review' && (
                <>
                    {pending.length === 0 && <Empty>{t('dpay.allDone')}</Empty>}
                    <ul className="list">
                        {pending.map(proof => (
                            <ListRow key={proof.id} left={<Avatar name={studentById(proof.student).name}/>}
                                     title={personName(studentById(proof.student).name)}
                                     sub={`${coversText(proof.covers)} · ${t(`method.${proof.method}` as const)} · ${money(proof.amount)} · ${dayMonth(proof.sent)} ${time(proof.sentAt)}`}
                                     right={<ProofChip state="uploaded"/>}
                                     onClick={() => router.navigate(`/d/payments/review/${proof.id}`)}/>
                        ))}
                    </ul>
                    <p className="hint">{t('dpay.totalpassHint')}</p>
                </>
            )}
            {!colibri && tab !== 'review' && <SchoolDues tab={tab} redraw={() => redraw(n => n + 1)}/>}
            {tab === 'fees' && colibri && (
                <ul className="list">
                    <ListRow left={<Avatar name="Héctor Navarro"/>} title="Héctor Navarro"
                             sub={t('dpay.feeSub', {amount: money(800)})}
                             right={feeDone
                                 ? <span className="chip chip-confirmed">{t('dpay.feeDone')}</span>
                                 : <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                                     if (await confirm({
                                         title: t('dpay.feeConfirm', {name: 'Héctor Navarro'}),
                                         body: t('dpay.feeConfirmBody'),
                                         confirm: t('dpay.markDone')
                                     })) {
                                         FEES_DONE.add('hector');
                                         redraw(n => n + 1);
                                         toast(t('dpay.feeSaved'));
                                     }
                                 }}>{t('dpay.markDone')}</button>}/>
                </ul>
            )}
            {tab === 'due' && colibri && (
                <>
                    <h2 className="section-title">{t('dpay.dueOn', {when: dayMonth('2026-11-30')})}</h2>
                    <ul className="list">
                        {['camila', 'regina', 'mateo', 'valentina', 'jimena'].map(id => {
                            const student = studentById(id);
                            const state = id === 'camila' ? 'rejected' : ['regina', 'mateo', 'valentina'].includes(id) ? 'uploaded' : null;
                            return (
                                <ListRow key={id} left={<Avatar name={student.name}/>} title={personName(student.name)}
                                         sub={planText(student)}
                                         right={state ? <ProofChip state={state}/> :
                                             <span className="chip">{t('dpay.nothingYet')}</span>}
                                         onClick={() => router.navigate(`/d/students/${id}?tab=pay`)}/>
                            );
                        })}
                    </ul>
                    <h2 className="section-title">{t('dpay.overdue')}</h2>
                    <Empty>{t('dpay.noOverdue')}</Empty>
                </>
            )}
        </Screen>
    );
}

/** Fees owed and this month's plan payments, from the school's own records (every school but the sample's Colibrí). */
function SchoolDues({tab, redraw}: { tab: string; redraw: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const here = studentsHere().filter(student => student.status === 'active');
    if (tab === 'fees') {
        const fee = pricesHere().find(price => price.kind === 'fee')?.amount ?? 0;
        const owing = here.filter(student => student.feeOwed);
        if (owing.length === 0) return <Empty>{t('dpay.noFees')}</Empty>;
        return (
            <ul className="list">
                {owing.map(student => (
                    <ListRow key={student.id} left={<Avatar name={student.name}/>} title={personName(student.name)}
                             sub={student.since && student.since >= addDays(TODAY, -31) ? t('dpay.feeNewSub', {when: dayMonth(student.since), amount: money(fee)}) : t('dpay.feeSub', {amount: money(fee)})}
                             right={FEES_DONE.has(student.id)
                                 ? <span className="chip chip-confirmed">{t('dpay.feeDone')}</span>
                                 : <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                                     if (await confirm({title: t('dpay.feeConfirm', {name: personName(student.name)}), body: t('dpay.feeConfirmBody'), confirm: t('dpay.markDone')})) {
                                         FEES_DONE.add(student.id);
                                         live.markFeeDone(student.id);
                                         redraw();
                                         toast(t('dpay.feeSaved'));
                                     }
                                 }}>{t('dpay.markDone')}</button>}/>
                ))}
            </ul>
        );
    }
    // Who pays monthly, and where this month's payment stands.
    const month = TODAY.slice(0, 7);
    const dueOf = (student: Student) => `${month}-${student.paymentDay === 15 ? '15' : '30'}`;
    const stateOf = (student: Student) => PROOFS.filter(proof => proof.student === student.id && proof.covers.endsWith(`· ${month}`))
        .sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt))[0]?.state;
    const monthly = here.filter(student => (student.plan === 'package' || student.plan === 'monthly' || student.passExtra) && (student.since ?? '') <= dueOf(student) && stateOf(student) !== 'confirmed');
    const upcoming = monthly.filter(student => dueOf(student) >= TODAY);
    const overdue = monthly.filter(student => dueOf(student) < TODAY && stateOf(student) !== 'uploaded');
    const row = (student: Student, right: JSX.Element) => (
        <ListRow key={student.id} left={<Avatar name={student.name}/>} title={personName(student.name)} sub={planText(student)} right={right}
                 onClick={() => router.navigate(`/d/students/${student.id}?tab=pay`)}/>
    );
    const days = (student: Student) => Math.round((Date.parse(TODAY) - Date.parse(dueOf(student))) / 86400000);
    return (
        <>
            {[...new Set(upcoming.map(dueOf))].sort().map(due => (
                <section key={due} className="stack">
                    <h2 className="section-title">{t('dpay.dueOn', {when: dayMonth(due)})}</h2>
                    <ul className="list">
                        {upcoming.filter(student => dueOf(student) === due).map(student => {
                            const state = stateOf(student);
                            return row(student, state ? <ProofChip state={state}/> : <span className="chip">{t('dpay.nothingYet')}</span>);
                        })}
                    </ul>
                </section>
            ))}
            <h2 className="section-title">{t('dpay.overdue')}</h2>
            {overdue.length === 0 ? <Empty>{t('dpay.noOverdue')}</Empty> : (
                <ul className="list">
                    {overdue.map(student => row(student, stateOf(student) === 'rejected' ? <ProofChip state="rejected"/>
                        : <span className="chip chip-rejected">{t('dpay.daysLate', {n: days(student)})}</span>))}
                </ul>
            )}
        </>
    );
}

const REASONS = ['review.reasonBlurry', 'review.reasonAmount', 'review.reasonMonth'] as const;

/**
 * One screenshot to check. Confirming or rejecting moves straight on to the next one waiting;
 * the back arrow returns to the list, not through every screenshot already checked.
 */
export function Review({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    // The reject popup is a history entry (back closes it); sending drops it and replaces the screen with the next one.
    const rejectSheet = useSheetRoute('reject');
    const [reason, setReason] = useState('');
    const proof = PROOFS.find(item => item.id === id) ?? PROOFS[0];
    const queue = PROOFS.filter(item => item.school === currentSchool() && (item.state === 'uploaded' || REVIEWED.has(item.id)) && !isPass(item.method));
    const left = queue.filter(item => !REVIEWED.has(item.id));
    const position = queue.findIndex(item => item.id === id) + 1;
    const student = studentById(proof.student);
    // What the plan it covers costs, to match against the amount sent (the price the enrollment was created with).
    const expected = PRICES.find(price => (price.kind === 'monthly' || price.kind === 'package') && (proof.covers.startsWith(`${price.label} ·`) || proof.covers.startsWith(`${price.id} ·`)))?.amount;
    const mismatch = expected !== undefined && proof.amount !== expected;

    const done = (message: string, fromSheet = false) => {
        decideProof(proof.id, fromSheet ? 'rejected' : 'confirmed', reason.trim());
        REVIEWED.add(proof.id);
        toast(message);
        const next = queue.find(item => !REVIEWED.has(item.id));
        const url = next ? `/d/payments/review/${next.id}` : '/d/payments/review/done';
        if (fromSheet) router.leave(1, url);
        else router.replace(url);
    };

    if (id === 'done' || REVIEWED.has(proof.id) && left.length === 0) {
        return (
            <Screen title={t('review.title')} back="/d/payments" nav={false}
                    footer={<button type="button" className="btn btn-lg"
                                    onClick={() => router.back('/d/payments')}>{t('review.backToList')}</button>}>
                <DoneMessage title={t('review.allDone')} body={t('review.allDoneBody')}/>
            </Screen>
        );
    }

    return (
        <Screen title={student.name} subtitle={t('review.position', {at: position, of: queue.length})}
                back="/d/payments" nav={false} note={t('review.autoNext')}
                footer={
                    <div className="btn-row">
                        <button type="button" className="btn btn-secondary btn-lg"
                                onClick={() => rejectSheet.show()}>{t('review.reject')}</button>
                        <button type="button" className="btn btn-lg"
                                onClick={() => done(t('review.confirmed'))}>{t('review.confirm')}</button>
                    </div>
                }>
            <dl className="dl">
                <dt>{t('review.covers')}</dt>
                <dd>{coversText(proof.covers)}</dd>
                <dt>{t('review.method')}</dt>
                <dd>{t(`method.${proof.method}` as const)}</dd>
                <dt>{t('review.amount')}</dt>
                <dd className="num">{money(proof.amount)}</dd>
                <dt>{t('review.sent')}</dt>
                <dd>{dayShort(proof.sent)} · {time(proof.sentAt)}</dd>
                {expected !== undefined && (
                    <>
                        <dt>{t('review.expected')}</dt>
                        <dd className="num">{money(expected)} {mismatch
                            ? <span className="chip chip-warning">{t('review.differs')}</span>
                            : <span className="chip chip-confirmed">{t('review.matches')}</span>}</dd>
                    </>
                )}
            </dl>
            {mismatch && <div className="banner banner-warning small">{t('review.mismatch', {sent: money(proof.amount), expected: money(expected ?? 0)})}</div>}
            {proof.method === 'cash' && <p className="hint">{t('review.cashHint')}</p>}
            {student.overPlan && <div className="banner banner-over small">{t('review.overPlan', {count: student.overPlan})}</div>}
            <div className="proof-image proof-image-review">{t('review.imagePlaceholder')}</div>
            <Sheet open={rejectSheet.open} onClose={rejectSheet.close} title={t('review.rejectTitle')}
                   footer={<>
                       {reason.trim().length < 3 && <p className="hint center">{t('review.needReason')}</p>}
                       <button type="button" className="btn btn-danger btn-lg" disabled={reason.trim().length < 3}
                                   onClick={() => {
                                       setReason('');
                                       done(t('review.rejected'), true);
                                   }}>{t('review.rejectSend')}</button>
                   </>}>
                {/* The usual reasons, or "Other…" to write one; what's picked is what the student reads. */}
                <SelectField id="rej-reason" label={t('review.reason')} value={reason} onChange={setReason} other placeholder={t('common.pick')}
                             hint={t(student.minor ? 'review.reasonHintGuardian' : 'review.reasonHint')}
                             options={REASONS.filter(key => key !== 'review.reasonAmount' || mismatch).map(key => ({value: t(key), label: t(key)}))}/>
            </Sheet>
        </Screen>
    );
}
