import {saveStaffCard} from '../../live/cards';
import {LIVE} from '../../live/state';
import {LiveQr} from './LiveQr';
import {monthRange, pickedMonth, shiftMonth} from '../../lib/months';
import {live} from '../../live/actions';
import {useEffect, useRef, useState} from 'react';
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
    weekdayOf,
    weekdayShort
} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {AMBAR_STUDENTS, classById, CLASSES, PACKAGES, PROOFS, roomName, SCHOOLS, schoolOfClass, schoolOfSession, sessionById, SESSIONS, STRESS, STUDENTS, studentById, teacherName, TEACHERS, sessionWindow, TODAY, TODAY_ROSTER, type Session, rosterOf, guestsOf, studentsOf, classStudents} from '../../mock/data';
import {teacherOf} from '../../mock/changes';
import {Screen, roleOf, STAFF_ME} from '../../ui/Screen';
import {Avatar, Check, Empty, ListRow, MenuText, SearchField, Segmented, SelectField, TextArea} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';
import {useCurrentSchool} from '../../state/school';
import {classSlots, DotLegend, ProofChip, SessionCard, StudentCardView, TermsChip, UnpaidChip} from '../shared/pieces';
import {LanguageRow, PasswordRow, SignOutButton, ThemeRow, LegalRow} from '../shared/Common';
import {useStaffCard} from './StaffCard';
import {PayView} from '../shared/PayView';
import {coversText, planText} from '../shared/labels';
import {monthPayment} from '../../mock/pay';

/** Teacher screens (Mariana Alvarez, at Helios). A director who teaches reaches them under /d/. */

function base(path: string) {
    return `/${roleOf(path)}`;
}

function me(path: string) {
    const role = roleOf(path) === 'd' ? 'd' : 't';
    return TEACHERS.find(teacher => teacher.id === STAFF_ME[role]) ?? TEACHERS[0];
}

/** Sessions the teacher gives (or that are theirs and covered by someone else) at a school. */
function mySessions(teacher: string, school: string): Session[] {
    return SESSIONS.filter(session => schoolOfSession(session) === school
        && (teacherOf(session) === teacher || session.substitute === teacher));
}

/**
 * My schedule: the month, with the days that have classes marked; tapping a day opens its
 * sessions in a popup. Today's sessions are listed under the month.
 */
export function Schedule() {
    const router = useRouter();
    const school = useCurrentSchool();
    const day = useSheetRoute('day');
    const month = pickedMonth(router.query.get('month'));
    const mine = me(router.path).id;
    const sessions = mySessions(mine, school);
    const lead = weekdayOf(month) - 1;
    const cells = Array.from({length: 42}, (_, i) => addDays(month, i - lead)).filter((date, i) => i < 35 || date.slice(5, 7) === month.slice(5, 7));
    const today = sessions.filter(session => session.date === TODAY);
    const onDay = day.item ? sessions.filter(session => session.date === day.item) : [];
    const todayList = useRef<HTMLHeadingElement>(null);

    const open = (session: Session) => {
        if (session.substitute && session.substitute !== mine) return undefined;
        return () => router.navigate(`/t/session/${session.id}`);
    };
    const extra = (session: Session) => session.substitute && session.substitute !== mine
        ? <span className="small">{t('schedule.coveredBy', {name: teacherName(session.substitute)})}</span>
        : session.checkedIn !== undefined
            ? <span className="small strong">{t('schedule.arrived', {
                n: session.checkedIn,
                of: session.expected ?? 0
            })}</span>
            : undefined;

    return (
        <Screen title={t('schedule.title')}>
            <div className="row">
                <button type="button" className="icon-btn" aria-label={t('schedule.prevMonth')}
                        disabled={month <= monthRange().min}
                        onClick={() => router.replace(router.withQuery('month', shiftMonth(month, -1)))}><Icon name="back"/></button>
                <span className="big">{monthYear(month)}</span>
                <button type="button" className="icon-btn" aria-label={t('schedule.nextMonth')}
                        disabled={month >= monthRange().max}
                        onClick={() => router.replace(router.withQuery('month', shiftMonth(month, 1)))}><Icon name="chevron"/></button>
            </div>
            <div className="month" role="group" aria-label={monthYear(month)}>
                {[1, 2, 3, 4, 5, 6, 7].map(w => <span key={w} className="month-head"
                                                      aria-hidden="true">{weekdayShort(w).slice(0, 2)}</span>)}
                {cells.map(date => {
                    const mine = sessions.filter(session => session.date === date);
                    const out = date.slice(5, 7) !== month.slice(5, 7);
                    return (
                        <button key={date} type="button" data-out={out} data-today={date === TODAY}
                                disabled={mine.length === 0}
                                aria-label={`${dayLong(date)}: ${t('cal.nSessions', {n: mine.length})}`}
                                onClick={() => date === TODAY
                                    ? todayList.current?.scrollIntoView({behavior: 'smooth', block: 'start'})
                                    : day.show(date)}>
                            {Number(date.slice(8))}
                            <span className="dots">
                                {mine.slice(0, 4).map(session => (
                                    <i key={session.id}
                                       data-kind={session.status === 'cancelled' ? 'cancelled' : session.substitute ? 'substitute' : 'class'}/>
                                ))}
                            </span>
                        </button>
                    );
                })}
            </div>
            <DotLegend/>
            <p className="hint">{t('schedule.hint')}</p>
            <h2 ref={todayList} className="section-title">{t('schedule.today')}</h2>
            {today.length === 0 && <Empty>{t('schedule.empty')}</Empty>}
            {today.map(session => <SessionCard key={session.id} session={session} onClick={open(session)}
                                               extra={extra(session)}/>)}
            <Sheet open={day.open} onClose={day.close} title={day.item ? dayLong(day.item) : ''}>
                {onDay.map(session => <SessionCard key={session.id} session={session} onClick={open(session)}
                                                   extra={extra(session)}/>)}
            </Sheet>
        </Screen>
    );
}

/**
 * One session, for its teacher and for the school's directors: who's expected and who has arrived
 * (guest teachers counted apart), the QR and adding attendance. A director can also correct a
 * record (tap it) and sees the change history; a teacher's tap opens the student's card.
 */
export function SessionScreen({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const role = base(router.path);
    const director = role === '/d';
    const recordSheet = useSheetRoute('record');
    const session = sessionById(id);
    const item = classById(session.classId);
    const held = session.date <= TODAY;
    const before = session.date < TODAY;
    const roster: typeof TODAY_ROSTER = held ? rosterOf(session) : rosterOf(session).map(entry => ({student: entry.student}));
    const waiting = roster.filter(entry => !entry.at);
    const arrived = roster.filter(entry => entry.at);
    const window = sessionWindow(session);
    // The director can add or correct attendance at any time; a teacher only inside the window.
    const canAdd = director || window.addOpen;
    const record = director ? arrived.find(entry => entry.student === recordSheet.item) : undefined;
    const recordOf = record ? studentById(record.student) : null;
    // Every correction stays in the history (stress data: a dozen of them).
    const history = schoolOfSession(session) !== 'colibri' ? [] : [
        {title: t('att.logAdded', {name: 'Héctor Navarro'}), sub: `Mariana Ruiz · ${time('10:11')}`},
        ...(STRESS ? STUDENTS.slice(0, 12).map((student, index) => ({
            title: t(index % 2 ? 'att.logAdded' : 'att.logRemoved', {name: student.name}),
            sub: `Ana Torres · ${time(`11:${String(index * 4).padStart(2, '0')}`)}`,
        })) : []),
    ];
    const note = window.before ? t('session.opensOn', {when: dayShort(session.date), time: time(window.opensAt)})
        // The director adds and corrects at any time, so the teacher's limits don't apply.
        : director ? undefined
            : window.addOpen ? t('session.addUntil', {time: time(window.addUntil)}) : t('session.closed');
    return (
        <Screen title={item.name}
                subtitle={[`${dayShort(session.date)} · ${timeRange(session.start, session.end)}`, roomName(session.room)]}
                back={director ? '/d/calendar' : '/t/schedule'} nav={false}
                note={note}
                footer={
                    <div className={before ? 'stack' : 'btn-row'}>
                        {!before && (
                            <button type="button" className="btn btn-ink btn-lg" disabled={!window.qrOpen}
                                    onClick={() => router.navigate(`${role}/qr/${id}`)}><Icon
                                name="qr"/>{t('session.showQr')}</button>
                        )}
                        <button type="button" className="btn btn-secondary btn-lg" disabled={!canAdd}
                                onClick={() => router.navigate(`${role}/session/${id}/add`)}><Icon
                            name="plus"/>{t(before ? 'session.add' : 'session.addShort')}</button>
                    </div>
                }>
            {session.replaces && <div
                className="banner">{t('session.isReplacement', {when: dayShort(sessionById(session.replaces).date)})}</div>}
            <div className="stats">
                <div className="stat"><strong>{arrived.length}</strong>{t('session.arrived')}</div>
                <div className="stat"><strong>{roster.length}</strong>{t('session.expected')}</div>
                <div className="stat"><strong>{held ? guestsOf(session) : 0}</strong>{t('att.guests')}</div>
            </div>
            <p className="hint">{t('session.whoCanCome')}</p>
            <h2 className="section-title">{t(before ? 'session.didntCome' : 'session.notYet')}</h2>
            <ul className="list">
                {waiting.map(entry => {
                    const student = studentById(entry.student);
                    return (
                        <ListRow key={entry.student} left={<Avatar name={student.name}/>}
                                 title={personName(student.name)}
                                 chips={<>{student.health && <span className="chip chip-rejected"><Icon name="heart"
                                                                                                        size={12}/>{t('students.health')}</span>}<span
                                     className="chip">{planText(student)}</span>{student.termsPending &&
                                     <TermsChip/>}{!['confirmed', 'visit'].includes(monthPayment(student.id)) &&
                                     <UnpaidChip/>}</>}
                                 onClick={() => router.navigate(director ? `/d/students/${student.id}` : `/t/student/${student.id}`)}/>
                    );
                })}
            </ul>
            <h2 className="section-title">{t('session.arrivedList')}</h2>
            {director && arrived.length > 0 && <p className="hint">{t('session.fixHint')}</p>}
            <ul className="list">
                {arrived.map(entry => {
                    const student = studentById(entry.student);
                    return (
                        <ListRow key={entry.student} left={<Avatar name={student.name}/>}
                                 title={personName(student.name)}
                                 sub={director ? `${entry.at}${entry.by ? ` · ${t('session.byGuardian')}` : ''}` : entry.by ? t('session.byGuardian') : undefined}
                                 chips={<>{student.health && <span className="chip chip-rejected"><Icon name="heart"
                                                                                                        size={12}/>{t('students.health')}</span>}<span
                                     className="chip">{planText(student)}</span>{student.overPlan &&
                                     <span className="chip chip-over">{t('chip.overPlan')}</span>}</>}
                                 right={director ?
                                     <span className="row-action"><Icon name="edit" size={16}/>{t('att.fix')}</span> :
                                     <span className="small num">{entry.at}</span>}
                                 onClick={() => director ? recordSheet.show(student.id) : router.navigate(`/t/student/${student.id}`)}/>
                    );
                })}
                {held && (
                    <ListRow left={<Avatar name="Diego Herrera"/>} title="Diego Herrera" sub={t('att.guestRow')}
                             chips={<span className="chip">{t('att.guestChip')}</span>}/>
                )}
            </ul>
            {director && (
                <>
                    <h2 className="section-title">{t('att.historyN', {n: history.length})}</h2>
                    {/* A long history scrolls in its own box, five changes at a time. */}
                    <ul className={history.length > 5 ? 'list list-max-5' : 'list'}>
                        {history.map((row, index) => <ListRow key={index} title={row.title} sub={row.sub}/>)}
                    </ul>
                </>
            )}
            <Sheet open={recordSheet.open && Boolean(recordOf)} onClose={recordSheet.close} title={t('att.fixTitle')}>
                {recordOf && record && (
                    <>
                        <p><strong>{recordOf.name}</strong></p>
                        <p className="muted small">{t(record.by ? 'att.byGuardian' : 'att.byQr', {time: record.at ?? ''})}</p>
                        <p className="small">{t('att.fixBody')}</p>
                        <button type="button" className="btn btn-danger" onClick={async () => {
                            if (await confirm({
                                title: t('att.removeTitle', {name: recordOf.name}),
                                body: t('att.removeBody'),
                                confirm: t('att.remove'),
                                danger: true
                            })) {
                                toast(t('att.removed'));
                                recordSheet.close();
                            }
                        }}><Icon name="trash"/>{t('att.remove')}</button>
                        <button type="button" className="btn btn-secondary" onClick={async () => {
                            if (await confirm({
                                title: t('att.guestTitle', {name: recordOf.name}),
                                body: t('att.guestBody'),
                                confirm: t('att.toGuest')
                            })) {
                                toast(t('att.changed'));
                                recordSheet.close();
                            }
                        }}><Icon name="swap"/>{t('att.toGuest')}</button>
                        <p className="hint">{t('att.toGuestHint')}</p>
                        <button type="button" className="btn btn-ghost"
                                onClick={() => router.navigate(`/d/students/${recordOf.id}`)}>
                            {t('session.openFile')}</button>
                    </>
                )}
            </Sheet>
        </Screen>
    );
}

/** The check-in QR, full screen. It changes every 30 seconds; the ring shows how long is left. */
export function QrScreen({id}: { id: string }) {
    const router = useRouter();
    if (LIVE.on) return <LiveQr id={id} back={`${base(router.path)}/session/${id}`}/>;
    const session = sessionById(id);
    const [left, setLeft] = useState(30);
    const [seed, setSeed] = useState(1);
    useEffect(() => {
        const timer = window.setInterval(() => setLeft(value => {
            if (value <= 1) {
                setSeed(s => s + 1);
                return 30;
            }
            return value - 1;
        }), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const cells = Array.from({length: 21 * 21}, (_, i) => {
        const x = i % 21;
        const y = Math.floor(i / 21);
        const finder = (a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7;
        if (finder(0, 0) || finder(14, 0) || finder(0, 14)) {
            const lx = x % 14 === 0 || x % 14 === 6 || x === 6 || x === 20 || x === 14;
            const ly = y % 14 === 0 || y % 14 === 6 || y === 6 || y === 20 || y === 14;
            const inner = (x % 14 >= 2 && x % 14 <= 4) && (y % 14 >= 2 && y % 14 <= 4);
            return lx || ly || inner;
        }
        return ((x * 31 + y * 17 + seed * 13) ^ (x * y + seed)) % 3 === 0;
    });
    const ring = 2 * Math.PI * 22;
    const open = sessionWindow(session);
    return (
        <div className="screen">
            <div className="qr-full">
                <button type="button" className="icon-btn qr-close"
                        aria-label={t('common.close')}
                        onClick={() => router.back(`${base(router.path)}/session/${id}`)}>
                    <Icon name="close"/>
                </button>
                <p className="qr-title">{classById(session.classId).name}</p>
                <svg viewBox="0 0 21 21" width="300" height="300" role="img" aria-label={t('qr.label')}
                     shapeRendering="crispEdges" className="qr-code">
                    {cells.map((on, i) => on &&
                        <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1"/>)}
                </svg>
                <div className="row qr-timer">
                    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
                        <circle className="qr-track" cx="26" cy="26" r="22" fill="none" strokeWidth="5"/>
                        <circle className="qr-ring" cx="26" cy="26" r="22" fill="none" strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={ring} strokeDashoffset={ring * (1 - left / 30)}
                                transform="rotate(-90 26 26)"/>
                        <text x="26" y="31" textAnchor="middle" fontSize="15" fontWeight="700">{left}</text>
                    </svg>
                    <span className="qr-muted">{t('qr.renews')}</span>
                </div>
                <p className="qr-muted small">{t('qr.window', {from: time(open.opensAt), to: time(open.qrUntil)})}</p>
            </div>
        </div>
    );
}

export function AddAttendance({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const role = base(router.path);
    const session = sessionById(id);
    const waiting = rosterOf(session).filter(entry => !entry.at).map(entry => studentById(entry.student));
    const [picked, setPicked] = useState<string[]>([]);
    return (
        <Screen title={t('add.title')} subtitle={`${classById(session.classId).name} · ${time(session.start)}`}
                back={`${role}/session/${id}`} nav={false} note={role === '/d' ? undefined : t('add.noRemove')}
                footer={<button type="button" className="btn btn-lg" disabled={picked.length === 0} onClick={() => {
                    live.addAttendance(id, picked);
                    toast(t('add.saved', {n: picked.length}));
                    router.back(`${role}/session/${id}`);
                }}>{picked.length ? t('add.saveN', {n: picked.length}) : t('add.save')}</button>}>
            <p>{t('add.body')}</p>
            {waiting.map(student => (
                <div key={student.id} className="card">
                    <Check id={`add-${student.id}`} label={<strong>{personName(student.name)}</strong>}
                           hint={planText(student)}
                           checked={picked.includes(student.id)}
                           onChange={on => setPicked(list => on ? [...list, student.id] : list.filter(x => x !== student.id))}/>
                    {student.termsPending && <div className="banner banner-terms small">{t('add.termsNote')}</div>}
                </div>
            ))}
        </Screen>
    );
}

/** Students of the teacher's classes at the current school: every row one height, health notes first. */
export function Students() {
    const router = useRouter();
    const director = base(router.path) === '/d';
    const teacher = me(router.path);
    const school = useCurrentSchool();
    const [query, setQuery] = useState('');
    const pool = school === 'ambar' ? AMBAR_STUDENTS : school === 'colibri' ? STUDENTS.filter(student => student.status === 'active' && student.id !== 'julia')
        : studentsOf(school).filter(student => student.status === 'active');
    // The classes I give at this school, each with its current students (sample data: a child is in the
    // children's class; an adult in the class their plan names, their package covers, or pays per visit).
    const classes = CLASSES.filter(item => schoolOfClass(item) === school && item.teacher === teacher.id);
    // Helios: the students whose usual week includes the class.
    const takes = (student: typeof pool[number], item: typeof classes[number]) => school !== 'colibri' && school !== 'ambar' ? classStudents(item.id).includes(student.id)
        : Boolean(item.forKids) === Boolean(student.minor)
        && (student.minor || student.planLabel.startsWith(item.name) || student.plan === 'totalpass' || student.plan === 'wellhub' || student.plan === 'cash'
            || (student.plan === 'package3' && PACKAGES[0].classes.includes(item.id))
            || (student.plan === 'package2' && PACKAGES[1].classes.includes(item.id)));
    const groups = classes.map(item => ({
        item,
        students: pool.filter(student => takes(student, item) && student.name.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => Number(Boolean(b.health)) - Number(Boolean(a.health)) || a.name.localeCompare(b.name)),
    })).filter(group => group.students.length > 0);
    const only = router.query.get('class') ?? 'all';
    const setOnly = (value: string) => router.replace(router.withQuery('class', value === 'all' ? null : value));
    const several = classes.length > 3;
    const FEW = 3;
    const shown = groups.filter(group => only === 'all' || group.item.id === only);
    const cut = several && only === 'all' && !query.trim();
    return (
        <Screen title={t('students.title')} subtitle={t('students.subtitle')}
                back={director ? '/d/more' : undefined} fixedList>
            <SearchField id="st-search" label={t('students.search')} value={query} onChange={setQuery} beside={several ? (
                <MenuText id="st-class" label={t('students.whichClass')} value={only} onChange={setOnly}
                          options={[{value: 'all', label: t('students.allClasses', {n: classes.length})}, ...classes.map(item => ({value: item.id, label: item.name}))]}/>
            ) : <p className="hint">{t('students.intro')}</p>}/>
            <div className="list-fill">
                {shown.map(({item, students}) => (
                    <section key={item.id} className="stack">
                        <div className="sticky-head">
                            <h2 className="section-title">{t('students.classGroup', {
                                name: item.name,
                                n: students.length
                            })}</h2>
                            <span className="small muted">{classSlots(item)}</span>
                        </div>
                        <ul className="list">
                            {(cut ? students.slice(0, FEW) : students).map(student => (
                                <ListRow key={student.id} fixed left={<Avatar name={student.name}/>}
                                         title={personName(student.name)}
                                         sub={student.health ? student.health : planText(student)}
                                         chips={<>{student.health &&
                                             <span className="chip chip-rejected"><Icon name="heart"
                                                                                        size={12}/>{t('students.health')}</span>}
                                             {student.minor &&
                                                 <span
                                                     className="chip">{t('card.minor')}</span>}{student.termsPending &&
                                                 <TermsChip/>}
                                             {!['confirmed', 'visit'].includes(monthPayment(student.id)) &&
                                                 <UnpaidChip/>}</>}
                                         onClick={() => router.navigate(director ? `/d/students/${student.id}` : `/t/student/${student.id}`)}/>
                            ))}
                        </ul>
                        {cut && students.length > FEW && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOnly(item.id)}>
                                {t('students.seeClass', {n: students.length})}</button>
                        )}
                    </section>
                ))}
                {shown.length === 0 && <Empty>{t('students.none')}</Empty>}
            </div>
        </Screen>
    );
}

export function StudentCard({id}: { id: string }) {
    const student = studentById(id);
    return (
        <Screen title={t('card.titleOf')} subtitle={student.name} back="/t/students" nav={false}>
            <StudentCardView student={student}/>
            <p className="hint">{t('card.teacherHint')}</p>
        </Screen>
    );
}

/**
 * Pagos: the month's student attendance in my classes (what a teacher paid per student is paid
 * from), and my classes' payment screenshots, view only. Two tabs.
 */
export function TeacherPayments() {
    const router = useRouter();
    const school = useCurrentSchool();
    const sheet = useSheetRoute('proof');
    const director = base(router.path) === '/d';
    const tab = !director && router.query.get('tab') === 'proofs' ? 'proofs' : 'month';
    const teacher = me(router.path);
    // Helios: the last month's screenshots of the students who come to my classes.
    const theirs = new Set(CLASSES.filter(item => schoolOfClass(item) === school && item.teacher === teacher.id).flatMap(item => classStudents(item.id)));
    const mine = school === 'ambar' ? [] : school === 'colibri'
        ? PROOFS.filter(proof => ['mateo', 'valentina', 'sofia', 'andres'].includes(proof.student) && proof.school === 'colibri')
        : PROOFS.filter(proof => proof.school === school && theirs.has(proof.student) && proof.sent >= addDays(TODAY, -30)).sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt));
    const open = mine.find(proof => proof.id === sheet.item);
    return (
        <Screen title={director ? t('tpay.tabMonth') : t('tpay.title')}
                back={director ? '/d/more' : undefined}>
            {!director && <Segmented label={t('tpay.title')} value={tab}
                                     onChange={value => router.replace(router.withQuery('tab', value === 'month' ? null : value))}
                                     options={[{value: 'month', label: t('tpay.tabMonth')}, {
                                         value: 'proofs',
                                         label: t('tpay.tabProofs')
                                     }]}/>}
            {tab === 'month' ? (
                <PayView teacher={teacher.id} school={school}/>
            ) : mine.length === 0 ? <Empty>{t('tpay.none')}</Empty> : (
                <ul className="list">
                    {mine.map(proof => (
                        <ListRow key={proof.id} left={<Avatar name={studentById(proof.student).name}/>}
                                 title={personName(studentById(proof.student).name)}
                                 sub={`${coversText(proof.covers)} · ${t(`method.${proof.method}` as const)}${proof.amount ? ` · ${money(proof.amount)}` : ''}`}
                                 right={<ProofChip state={proof.state}/>} onClick={() => sheet.show(proof.id)}/>
                    ))}
                </ul>
            )}
            {tab === 'proofs' && <p className="hint">{t('tpay.viewOnly')}</p>}
            <Sheet open={sheet.open} onClose={sheet.close} title={open ? studentById(open.student).name : ''}>
                {open && (
                    <>
                        <div className="proof-image">{t('review.imagePlaceholder')}</div>
                        <dl className="dl">
                            <dt>{t('review.covers')}</dt>
                            <dd>{coversText(open.covers)}</dd>
                            <dt>{t('review.method')}</dt>
                            <dd>{t(`method.${open.method}` as const)}</dd>
                            <dt>{t('review.sent')}</dt>
                            <dd>{dayMonth(open.sent)} · {time(open.sentAt)}</dd>
                            <dt>{t('review.state')}</dt>
                            <dd><ProofChip state={open.state}/></dd>
                        </dl>
                        <p className="hint">{t('tpay.onlyDirector')}</p>
                    </>
                )}
            </Sheet>
        </Screen>
    );
}


/** Account: password and language, with signing out pinned at the bottom. The card is the button at the top; the month's attendance is in Pagos. */
export function TeacherAccount() {
    const router = useRouter();
    const director = base(router.path) === '/d';
    const teacher = me(router.path);
    return (
        <Screen title={t('account.title')} back={director ? '/d/more' : undefined} footer={<SignOutButton/>}>
            <p className="hint">{t('account.cardOnTop')}</p>
            <ul className="list">
                <PasswordRow email={teacher.email}/>
            </ul>
            <LanguageRow/>
            <ThemeRow/>
            <LegalRow/>
        </Screen>
    );
}

/** Edit my card: photo, name and phone (mine, for all my schools), emergency contacts, health notes. */
export function StaffCardEdit() {
    const router = useRouter();
    const toast = useToast();
    const role = base(router.path);
    const teacher = me(router.path);
    const home = role === '/d' ? '/d/home' : '/t/schedule';
    const card = useStaffCard({
        name: teacher.name,
        phone: teacher.phone,
        email: teacher.email,
        emergency: teacher.emergency,
        health: teacher.health,
        photoPath: teacher.photo,
    });
    const [busy, setBusy] = useState(false);
    return (
        <Screen title={t('staff.myCard')} back={home} nav={false}
                note={card.missing.length ? t('activity.missing', {list: card.missing.join(', ')}) : undefined}
                footer={<button type="button" className="btn btn-lg" disabled={card.missing.length > 0 || busy} onClick={async () => {
                    if (LIVE.on) {
                        setBusy(true);
                        const problem = await saveStaffCard(card.values, card.email);
                        setBusy(false);
                        if (problem) return toast(t('live.refused', {reason: problem}));
                    }
                    toast(card.emailChanged ? t('form.emailSent', {email: card.email}) : t('form.saved'));
                    router.back(home);
                }}>{t('form.saveChanges')}</button>}>
            {card.body}
            <p className="hint">{t('account.profileHint')}</p>
        </Screen>
    );
}


/** A post on the notices board, by a teacher (for one of their classes) or a director. */
export function PostNotice() {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const school = useCurrentSchool();
    const role = base(router.path);
    const director = role === '/d';
    const classes = CLASSES.filter(item => schoolOfClass(item) === school && (director || item.teacher === me(router.path).id));
    const [target, setTarget] = useState(director ? 'all' : classes[0]?.id ?? '');
    const [text, setText] = useState('');
    const reach = target === 'all' ? 58 : classById(target).students;
    const home = director ? '/d/home' : '/t/schedule';
    return (
        <Screen title={t('post.title')} subtitle={SCHOOLS[school].name} back={home} nav={false} note={t('post.noEmail')}
                footer={<button type="button" className="btn btn-lg" disabled={text.trim().length < 3}
                                onClick={async () => {
                                    if (await confirm({
                                        title: t('post.confirmTitle'),
                                        body: t('post.confirmBody', {n: reach}),
                                        confirm: t('post.publish')
                                    })) {
                                        live.postNotice(target === 'all' ? undefined : target, text.trim());
                                        toast(t('post.published'));
                                        router.back(home);
                                    }
                                }}>{t('post.publish')}</button>}>
            <SelectField id="post-class" label={t('post.for')} value={target} onChange={setTarget}
                         options={[...(director ? [{value: 'all', label: t('post.everyone')}] : []),
                             // Named with its days and start (two classes can share a name); the full times show under it.
                             ...classes.map(item => ({
                                 value: item.id,
                                 label: item.slots.length
                                     ? `${item.name} · ${item.slots.map(slot => weekdayShort(slot.weekday)).join(', ')} ${time(item.slots[0].start)}`
                                     : item.name,
                                 hint: [teacherName(item.teacher), classSlots(item)].filter(Boolean).join(' · '),
                             }))]}/>
            <TextArea id="post-text" label={t('post.text')} rows={6} value={text} onChange={setText}
                      hint={t('post.hint')}/>
            <p className="small muted">{t('post.reach', {n: reach})}</p>
        </Screen>
    );
}
