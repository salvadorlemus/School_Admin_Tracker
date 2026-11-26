import {useState} from 'react';
import {Icon} from '../../ui/Icon';
import {useRouter} from '../../lib/router';
import {t} from '../../lib/texts';
import {addDays, dayLong, dayMonth, dayShort, money, monthYear, personName, time, timeRange, weekdayLetter, weekdayLong, weekdayOf, weekdayShort} from '../../lib/format';
import {
    classById,
    classesOf,
    CLASSES,
    ENROLLMENTS,
    PACKAGES,
    PRICES,
    roomName,
    schoolOfClass,
    SCHOOLS,
    SESSIONS,
    studentById,
    teacherName,
    TODAY,
    TRIALS_TAKEN,
    type SchoolClass, SOFIA_SCHOOLS,
} from '../../mock/data';
import {Screen} from '../../ui/Screen';
import {Empty, ListRow, MenuText, Segmented, SelectField, TextField} from '../../ui/Fields';
import {useConfirm, useSheetRoute} from '../../ui/Layers';
import {DoneMessage, SchoolChip, SchoolLogo, SessionCard} from '../shared/pieces';
import {KIDS, useWho} from './Student';
import {ClassSheet} from './ClassSheet';
import {ENDED_ENROLLMENTS} from '../../mock/changes';

/**
 * Students (and guardians, for each child) choose their own classes: the school's weekly classes,
 * its packages and free hours. Enrolling is active at once and the director gets a notice; a full
 * class can't be joined; a trial class can be taken once per class, at the school's trial price.
 */

const TRIAL_PRICE = PRICES.find(price => price.id === 'trial')?.amount ?? 200;

const slots = (item: SchoolClass) => item.slots.map(slot => `${weekdayShort(slot.weekday)} ${timeRange(slot.start, slot.end)}`).join(' · ');
const placesLeft = (item: SchoolClass) => Math.max(0, (item.max ?? 99) - item.students);

function enrolledIn(student: string) {
    return ENROLLMENTS.filter(enrollment => enrollment.student === student);
}

function packageCovers(student: string, classId: string) {
    return enrolledIn(student).some(enrollment => enrollment.packageId
        && PACKAGES.find(pack => pack.id === enrollment.packageId)?.classes.includes(classId));
}

/**
 * The class of theirs (enrolled, at the same school) a class's times would overlap, if any: rule 5
 * refuses it, so the list says so before they try.
 */
export function clashOf(student: string, item: SchoolClass): string | undefined {
    const taken = enrolledIn(student).map(enrollment => enrollment.classId).filter((id): id is string => Boolean(id) && id !== item.id)
        .map(id => classById(id)).filter(other => schoolOfClass(other) === schoolOfClass(item));
    return taken.find(other => other.slots.some(a => item.slots.some(b => a.weekday === b.weekday && a.start < b.end && b.start < a.end)))?.name;
}

function useStudent() {
    const who = useWho();
    const kid = who.router.query.get('kid') ?? KIDS[0].id;
    return {...who, student: who.guardian ? kid : 'sofia'};
}

export function Classes() {
    const {base, router, guardian, student} = useStudent();
    const classSheet = useSheetRoute('class');
    const mineAll = enrolledIn(student);
    const [query, setQuery] = useState('');
    const join = router.query.get('join') ?? 'classes';
    const day = Number(router.query.get('wd')) || 0;
    // The school keeps to one school's classes in both views; kept in the URL, so back finds it.
    const school = router.query.get('school') ?? 'all';
    const setSchool = (value: string) => router.replace(router.withQuery('school', value === 'all' ? null : value));
    // Their schools: the ones they study at (a guardian, their children's).
    const memberOf = new Set<string>([...(guardian ? ['colibri'] : SOFIA_SCHOOLS), ...classesOf(student).map(id => schoolOfClass(classById(id)))]);
    const offered = CLASSES.filter(item => item.kind === 'weekly' && !item.ending && Boolean(item.forKids) === guardian && memberOf.has(schoolOfClass(item))
        && !mineAll.some(enrollment => enrollment.classId === item.id) && !packageCovers(student, item.id));
    const schools = [...new Set(offered.map(schoolOfClass))];
    const rank = (item: SchoolClass) => placesLeft(item) === 0 ? 2 : clashOf(student, item) ? 1 : 0;
    const catalogue = offered
        .filter(item => (!day || item.slots.some(slot => slot.weekday === day)) && (school === 'all' || schoolOfClass(item) === school))
        .filter(item => [item.name, teacherName(item.teacher), SCHOOLS[schoolOfClass(item)].short]
            .some(text => text.toLowerCase().includes((school === 'all' ? query : '').trim().toLowerCase())))
        .sort((a, b) => rank(a) - rank(b) || (a.slots[0]?.weekday ?? 0) - (b.slots[0]?.weekday ?? 0) || (a.slots[0]?.start ?? '').localeCompare(b.slots[0]?.start ?? ''));
    const mine = mineAll.filter(enrollment => school === 'all' || (enrollment.classId ? schoolOfClass(classById(enrollment.classId)) : 'colibri') === school);
    const many = offered.length > 8;
    const view = router.query.get('view') === 'cal' ? 'cal' : 'list';
    // Their own classes' schools and the ones they could join: the calendar filters by them too.
    const allSchools = [...new Set([...classesOf(student).map(id => schoolOfClass(classById(id))), ...schools])];
    const title = (enrollment: typeof mine[number]) => enrollment.packageId
        ? t(enrollment.packageId === 'pk3' ? 'payments.package3' : 'payments.package2')
        : classById(enrollment.classId ?? '').name;

    return (
        <Screen title={t('classes.title')} titleLine={allSchools.length > 1 && (
            <span className="title-school">{school !== 'all' && <SchoolLogo school={school}/>}<MenuText id="cl-school" label={t('classes.school')} value={school} onChange={setSchool}
                options={[{value: 'all', label: t('classes.allSchools', {n: allSchools.length})}, ...allSchools.map(id => ({value: id, label: SCHOOLS[id].name}))]}/></span>
        )}>
            {guardian && (
                <div className="heading-pick">{t('classes.forWhomPick')}<MenuText id="cl-kid" label={t('classes.forWhom')} value={student}
                             onChange={kid => router.replace(router.withQuery('kid', kid))}
                             options={KIDS.map(kid => ({value: kid.id, label: personName(kid.name)}))}/></div>
            )}
            <Segmented label={t('classes.view')} value={view} onChange={value => router.replace(router.withQuery('view', value === 'list' ? null : value))}
                       options={[{value: 'list', label: t('classes.viewList')}, {value: 'cal', label: t('classes.viewCalendar')}]}/>
            {view === 'cal' ? (
                <ClassesCalendar student={student} offered={offered} school={school}
                                 onOpenClass={id => classSheet.show(id)}
                                 onJoin={(id, date) => router.navigate(`${base}/classes/${id}?start=${date}${guardian ? `&kid=${student}` : ''}`)}/>
            ) : <>
            <h2 className="section-title">{t('classes.mine')}</h2>
            {mine.length === 0 ? <Empty>{t('classes.noneYet')}</Empty> : (
                <ul className="list">
                    {mine.map(enrollment => (
                        <ListRow key={enrollment.id} title={title(enrollment)}
                                 sub={enrollment.packageId
                                     ? PACKAGES.find(pack => pack.id === enrollment.packageId)?.classes.map(id => classById(id).name).join(' · ')
                                     : `${slots(classById(enrollment.classId ?? ''))} · ${t(enrollment.how === 'monthly' ? 'enroll.monthly' : 'enroll.visit')}`}
                                 chips={<>
                                     <SchoolChip school={enrollment.classId ? schoolOfClass(classById(enrollment.classId)) : 'colibri'}/>
                                     {ENDED_ENROLLMENTS.has(`${student}:${enrollment.id}`) &&
                                         <span className="chip">{t('dstu.endsOn', {when: dayMonth(ENDED_ENROLLMENTS.get(`${student}:${enrollment.id}`) ?? '')})}</span>}
                                 </>}
                                 onClick={() => classSheet.show(enrollment.classId ?? enrollment.packageId)}/>
                    ))}
                </ul>
            )}
            <section className="join-area">
            <h2 className="section-title">{t('classes.join')}</h2>
            {/* Classes, packages and free hours are three ways to join: tabs, so a long class list doesn't bury the others. */}
            <Segmented label={t('classes.join')} value={join}
                       onChange={value => router.replace(router.withQuery('join', value === 'classes' ? null : value))}
                       options={[{value: 'classes', label: t('classes.tabClasses')}, {value: 'packages', label: t('classes.packages')}, {value: 'free', label: t('plan.freeHours')}]}/>
            {join === 'classes' && (
                <>
                    {/* One school picked: its classes are few enough for the day row alone. */}
                    {many && school === 'all' && (
                        <TextField id="cl-search" label={t('classes.search')} type="search" value={query} onChange={event => setQuery(event.target.value)}/>
                    )}
                    {many && (
                        <div className="day-row" role="group" aria-label={t('plan.byDay')}>
                            {[1, 2, 3, 4, 5, 6, 7].map(weekday => (
                                <button key={weekday} type="button" className="day-toggle" aria-pressed={day === weekday} aria-label={weekdayLong(weekday)}
                                        onClick={() => router.replace(router.withQuery('wd', day === weekday ? null : String(weekday)))}>
                                    {weekdayLetter(weekday)}
                                </button>
                            ))}
                        </div>
                    )}
                    {many && <p className="small muted">{t('plan.count', {n: catalogue.length, of: offered.length})}</p>}
                    {catalogue.length === 0 && <Empty>{t('classes.noMatch')}</Empty>}
                    <ul className="list">
                        {catalogue.map(item => {
                            const left = placesLeft(item);
                            const clash = clashOf(student, item);
                            return (
                                <ListRow key={item.id} title={item.name} sub={`${slots(item)} · ${teacherName(item.teacher)}`}
                                         chips={<>
                                             <SchoolChip school={schoolOfClass(item)}/>
                                             {left === 0 ? <span className="chip chip-cancelled">{t('classes.full')}</span>
                                                 : clash ? <span className="chip chip-warning">{t('classes.clashes', {name: clash})}</span>
                                                     : <span className="chip">{t('classes.placesLeft', {n: left})}</span>}
                                             {item.from > TODAY && <span
                                                 className="chip chip-outline">{t('plan.startsOn', {when: dayMonth(item.from)})}</span>}
                                         </>}
                                         onClick={() => router.navigate(`${base}/classes/${item.id}${guardian ? `?kid=${student}` : ''}`)}/>
                            );
                        })}
                    </ul>
                </>
            )}
            {join === 'packages' && (school === 'all' || school === 'colibri') && (
                <ul className="list">
                    {PACKAGES.filter(pack => !pack.school && !pack.retired).map(pack => (
                        <ListRow key={pack.id}
                                 title={t(pack.id === 'pk3' ? 'payments.package3' : 'payments.package2')}
                                 sub={`${pack.classes.map(id => classById(id).name).join(' · ')} · ${money(pack.price)}`}
                                 chips={mine.some(enrollment => enrollment.packageId === pack.id) ? <span
                                     className="chip chip-confirmed">{t('classes.yourPackage')}</span> : undefined}
                                 onClick={() => router.navigate(`${base}/classes/${pack.id}${guardian ? `?kid=${student}` : ''}`)}/>
                    ))}
                </ul>
            )}
            {join === 'free' && (school === 'all' || school === 'colibri') && (
                <ul className="list">
                    <ListRow title="Práctica libre en aparatos"
                             sub={`${dayShort('2026-11-27')} · ${timeRange('18:00', '20:00')} · Fernanda Gil`}
                             chips={<span className="chip">{t('classes.placesLeft', {n: 1})}</span>}
                             onClick={() => router.navigate(`${base}/classes/libre${guardian ? `?kid=${student}` : ''}`)}/>
                </ul>
            )}
            </section>
            </>}
            <ClassSheet id={classSheet.item} student={student} open={classSheet.open} onClose={classSheet.close}/>
        </Screen>
    );
}

/**
 * Clases › Calendario: the month with the days they have class (dots) and, when they choose, the
 * classes they could join (rings). A day lists their sessions, then "Puedes sumarte": classes with
 * places left that day, the ones at the same time as theirs marked. Joining opens the usual enroll
 * screen starting that day (it's every week, not one day). Packages and free hours stay in the list.
 */
function ClassesCalendar({student, offered, school, onOpenClass, onJoin}: {
    student: string;
    offered: SchoolClass[];
    school: string;
    onOpenClass: (id: string) => void;
    onJoin: (id: string, date: string) => void;
}) {
    const router = useRouter();
    const month = router.query.get('month') === '12' ? '2026-12-01' : '2026-11-01';
    const day = router.query.get('day') ?? (month === TODAY.slice(0, 7) + '-01' ? TODAY : month);
    const all = router.query.get('all') === '1';
    const takes = new Set(classesOf(student));
    const inSchool = (classId: string) => school === 'all' || schoolOfClass(classById(classId)) === school;
    const mineOn = (date: string) => SESSIONS.filter(session => session.date === date && takes.has(session.classId) && inSchool(session.classId));
    const joinOn = (date: string) => date < TODAY ? [] : offered.filter(item => inSchool(item.id) && placesLeft(item) > 0
        && date >= item.from && date <= item.until && item.slots.some(slot => slot.weekday === weekdayOf(date)))
        .sort((x, y) => (x.slots.find(slot => slot.weekday === weekdayOf(date))?.start ?? '').localeCompare(y.slots.find(slot => slot.weekday === weekdayOf(date))?.start ?? ''));
    const lead = weekdayOf(month) - 1;
    const cells = Array.from({length: 42}, (_, i) => addDays(month, i - lead)).filter((date, i) => i < 35 || date.slice(0, 7) === month.slice(0, 7));
    const mine = mineOn(day);
    const joinable = joinOn(day);
    return (
        <>
            <div className="row">
                <button type="button" className="icon-btn" aria-label={t('schedule.prevMonth')} disabled={month === '2026-11-01'}
                        onClick={() => router.replace(router.withQuery('month', null))}><Icon name="back"/></button>
                <span className="big">{monthYear(month)}</span>
                <button type="button" className="icon-btn" aria-label={t('schedule.nextMonth')} disabled={month === '2026-12-01'}
                        onClick={() => router.replace(router.withQuery('month', '12'))}><Icon name="chevron"/></button>
            </div>
            <div className="month" role="group" aria-label={monthYear(month)}>
                {[1, 2, 3, 4, 5, 6, 7].map(w => <span key={w} className="month-head" aria-hidden="true">{weekdayShort(w).slice(0, 2)}</span>)}
                {cells.map(date => {
                    const sessions = mineOn(date);
                    const rings = all ? joinOn(date) : [];
                    return (
                        <button key={date} type="button" aria-pressed={date === day} data-out={date.slice(0, 7) !== month.slice(0, 7)} data-today={date === TODAY}
                                aria-label={`${dayLong(date)}: ${t('cal.nSessions', {n: sessions.length})}`}
                                onClick={() => router.replace(router.withQuery('day', date))}>
                            {Number(date.slice(8))}
                            <span className="dots">
                                {sessions.slice(0, 4).map(session => (
                                    <i key={session.id} data-kind={session.status === 'cancelled' ? 'cancelled' : session.substitute ? 'substitute' : 'class'}/>
                                ))}
                                {rings.slice(0, Math.max(0, 4 - sessions.length)).map(item => <i key={item.id} data-kind="join"/>)}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="row">
                <div className="legend" aria-hidden="true">
                    <span><i data-kind="class"/>{t('classes.legendMine')}</span>
                    {all && <span><i data-kind="join"/>{t('classes.legendJoin')}</span>}
                </div>
                <button type="button" className="chip-toggle" aria-pressed={all} onClick={() => router.replace(router.withQuery('all', all ? null : '1'))}>
                    {t('classes.showJoinable')}
                </button>
            </div>
            <h2 className="section-title">{dayLong(day)}</h2>
            {mine.length === 0 ? <p className="small muted">{t('classes.noClassThisDay')}</p> : mine.map(session => (
                <SessionCard key={session.id} session={session} school={schoolOfClass(classById(session.classId))} onClick={() => onOpenClass(session.classId)}/>
            ))}
            {day >= TODAY && (
                <>
                    <h2 className="section-title">{t('classes.canJoin')}</h2>
                    {joinable.length === 0 ? <p className="small muted">{t('classes.nothingToJoin')}</p> : (
                        <ul className="list">
                            {joinable.map(item => {
                                const slot = item.slots.find(other => other.weekday === weekdayOf(day)) ?? item.slots[0];
                                const clash = clashOf(student, item);
                                return (
                                    <ListRow key={item.id} title={item.name}
                                             sub={`${timeRange(slot.start, slot.end)} · ${teacherName(item.teacher)} · ${roomName(slot.room)}`}
                                             chips={<>
                                                 <SchoolChip school={schoolOfClass(item)}/>
                                                 {clash ? <span className="chip chip-warning">{t('classes.clashes', {name: clash})}</span>
                                                     : <span className="chip">{t('classes.placesLeft', {n: placesLeft(item)})}</span>}
                                             </>}
                                             onClick={() => onJoin(item.id, day)}/>
                                );
                            })}
                        </ul>
                    )}
                    <p className="hint">{t('classes.joinWeekly')}</p>
                </>
            )}
        </>
    );
}

/** One class (or package, or free-hours session) to join: how to pay, when to start, or a trial. */
export function ClassDetail({id}: { id: string }) {
    const {base, router, guardian, student} = useStudent();
    const confirm = useConfirm();
    const pack = PACKAGES.find(item => item.id === id);
    const free = id === 'libre';
    const item = pack || free ? null : classById(id);
    // From the calendar (?start=), the first session on or after the day tapped comes first.
    const from = router.query.get('start');
    const next = item ? SESSIONS.filter(session => session.classId === item.id && session.date > TODAY && (!from || session.date >= from) && session.status !== 'cancelled').slice(0, 4) : [];
    const [chosen, setHow] = useState('');
    const [start, setStart] = useState(next[0]?.id ?? '');
    const left = item ? placesLeft(item) : 1;
    const covered = item ? packageCovers(student, item.id) : false;
    const trialTaken = item ? (TRIALS_TAKEN[student] ?? []).includes(item.id) : true;
    const back = `${base}/classes${guardian ? `?kid=${student}` : ''}`;
    const name = pack ? t(pack.id === 'pk3' ? 'payments.package3' : 'payments.package2') : free ? 'Práctica libre en aparatos' : item?.name ?? '';
    const payDay = studentById(student).paymentDay;

    const howOptions = item ? [
        ...(item.monthly ? [{
            value: 'monthly',
            label: `${t('enroll.monthly')} · ${money(item.monthly.price)}`,
            hint: t('enroll.monthlyHint', {amount: money(item.monthly.price), n: item.monthly.sessions})
        }] : []),
        ...(item.perVisit ? [{
            value: 'visit',
            label: t('enroll.visit'),
            hint: t('enroll.visitHint', {amount: money(250)})
        }] : []),
    ] : [];
    const how = howOptions.length === 1 ? howOptions[0].value : chosen;

    const done = (kind: string) => router.replace(`${base}/classes/done?kind=${kind}&c=${id}${guardian ? `&kid=${student}` : ''}`);

    const enroll = async () => {
        const price = pack ? money(pack.price) : free ? money(300) : how === 'monthly' && item?.monthly ? money(item.monthly.price) : money(250);
        if (await confirm({
            title: t('detail.confirmTitle', {name}),
            body: t(free ? 'detail.confirmFree' : how === 'visit' ? 'detail.confirmVisit' : 'detail.confirmMonthly', {
                price,
                day: payDay
            }),
            confirm: t(free ? 'detail.book' : 'detail.enroll'),
        })) done(free ? 'free' : 'enroll');
    };

    const trial = async () => {
        const session = next.find(s => s.id === start);
        if (await confirm({
            title: t('detail.trialTitle', {name}),
            body: t('detail.trialBody', {
                price: money(TRIAL_PRICE),
                when: session ? `${dayShort(session.date)} ${time(session.start)}` : ''
            }),
            confirm: t('detail.trialButton', {price: money(TRIAL_PRICE)}),
        })) done('trial');
    };

    // A student holds a package once: taking it again would charge twice for the same classes.
    const hasPack = pack ? ENROLLMENTS.some(enrollment => enrollment.student === student && enrollment.packageId === pack.id) : false;
    const clash = item ? clashOf(student, item) : undefined;
    const canEnroll = pack ? !hasPack : free ? true : left > 0 && !covered && !clash && Boolean(how) && Boolean(start);
    const why = hasPack ? t('detail.whyHasPackage') : item && left === 0 ? t('detail.whyFull') : clash ? t('detail.whyClash', {name: clash})
        : covered ? undefined : item && !how ? t('detail.whyHow') : undefined;

    return (
        <Screen title={name} subtitle={guardian ? studentById(student).name : undefined} back={back} nav={false}
                note={canEnroll ? undefined : why}
                // A class the package already covers has nothing to join: it shows when it meets instead.
                footer={covered || hasPack ? undefined : (
                    <>
                        {item && !trialTaken && !covered && !clash && left > 0 && (
                            <button type="button" className="btn btn-secondary" disabled={!start} onClick={trial}>
                                {t('detail.trialButton', {price: money(TRIAL_PRICE)})}
                            </button>
                        )}
                        <button type="button" className="btn btn-lg" disabled={!canEnroll} onClick={enroll}>
                            {t(free ? 'detail.book' : pack ? 'detail.takePackage' : 'detail.enroll')}
                        </button>
                    </>
                )}>
            {item && (
                <div className="card">
                    <div className="row"><span className="small">{slots(item)}</span><SchoolChip
                        school={schoolOfClass(item)}/></div>
                    <span className="small">{teacherName(item.teacher)} · {roomName(item.slots[0]?.room ?? '')}</span>
                    <span className="small muted">{t('detail.dates', {
                        from: dayMonth(item.from),
                        until: dayMonth(item.until)
                    })}</span>
                    <span
                        className={left === 0 ? 'chip chip-cancelled' : 'chip'}>{left === 0 ? t('classes.full') : t('detail.places', {
                        n: left,
                        of: item.max ?? 0
                    })}</span>
                </div>
            )}
            {pack && (
                <div className="card">
                    <span className="big num">{money(pack.price)} {t('detail.perMonth')}</span>
                    <span className="small">{t('detail.packageBody', {n: pack.perWeek})}</span>
                    <ul className="small" style={{margin: 0, paddingLeft: 18}}>{pack.classes.map(c => <li
                        key={c}>{classById(c).name} · {slots(classById(c))}</li>)}</ul>
                </div>
            )}
            {free && (
                <div className="card">
                    <span className="small">{dayShort('2026-11-27')} · {timeRange('18:00', '20:00')} · Sala aérea 1 · Fernanda Gil</span>
                    <span className="small">{t('detail.freeBody', {amount: money(300), n: 4})}</span>
                    <span className="chip">{t('plan.booked', {n: 3, of: 4})}</span>
                </div>
            )}
            {covered && (
                <>
                    <div className="banner banner-ok">{t('detail.whyCovered')}</div>
                    <h2 className="section-title">{t('classSheet.next')}</h2>
                    {next.map(session => <SessionCard key={session.id} session={session} showDate/>)}
                </>
            )}
            {hasPack && <div className="banner banner-ok">{t('detail.hasPackage')}</div>}
            {pack && !hasPack && <p className="hint">{t('detail.payDay', {day: payDay})}</p>}
            {clash && <div className="banner banner-warning">{t('detail.clash', {name: clash})}</div>}
            {item && left > 0 && !covered && !clash && (
                <>
                    {howOptions.length === 1 ? (
                        <div className="row"><span className="muted">{t('detail.how')}</span><span className="strong">{howOptions[0].label}</span></div>
                    ) : (
                        <SelectField id="cd-how" label={t('detail.how')} value={how} onChange={setHow}
                                     placeholder={t('common.pick')} options={howOptions}/>
                    )}
                    <SelectField id="cd-start" label={t('detail.start')} value={start} onChange={setStart}
                                 options={next.map(session => ({
                                     value: session.id,
                                     label: `${dayShort(session.date)} · ${time(session.start)}`
                                 }))}/>
                    <p className="hint">{t('detail.payDay', {day: payDay})}</p>
                </>
            )}
            {item && trialTaken && !covered && <p className="hint">{t('detail.trialTaken')}</p>}
        </Screen>
    );
}

export function ClassDone() {
    const {base, router, guardian} = useWho();
    const kind = router.query.get('kind') ?? 'enroll';
    const id = router.query.get('c') ?? '';
    const pack = PACKAGES.find(item => item.id === id);
    const name = pack ? t(pack.id === 'pk3' ? 'payments.package3' : 'payments.package2') : id === 'libre' ? 'Práctica libre en aparatos' : classById(id).name;
    const kid = router.query.get('kid');
    return (
        <Screen title={t('classes.title')} nav={false} back={`${base}/classes`}
                footer={
                    <div className="btn-row">
                        <button type="button" className="btn btn-secondary btn-lg"
                                onClick={() => router.replace(kind === 'trial' ? `${base}/upload?plan=trial-${id}${kid ? `-${kid}` : ''}` : `${base}/payments`)}>{t(kind === 'trial' ? 'done.toUpload' : 'done.toPayments')}</button>
                        <button type="button" className="btn btn-lg"
                                onClick={() => router.back(`${base}/classes${guardian && kid ? `?kid=${kid}` : ''}`)}>{t('done.toClasses')}</button>
                    </div>
                }>
            <DoneMessage
                title={t(kind === 'trial' ? 'done.trialTitle' : kind === 'free' ? 'done.freeTitle' : 'done.enrollTitle')}
                body={t(kind === 'trial' ? 'done.trialBody' : 'done.enrollBody', {name, price: money(TRIAL_PRICE)})}/>
        </Screen>
    );
}
