import {currentSchool} from '../../state/school';
import {useEffect, useRef, useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, dayMonthYear, dayShort, money, personName, time, weekdayShort} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {classById, CLASSES, schoolOfClass, TODAY, PRICES, PROOFS, ROOMS, roomName, SCHOOLS, studentById, TEACHERS, teacherSchools, type Price, type Room, roomsHere, studentsHere, pricesHere, packageLabel, PACKAGES, teacherName} from '../../mock/data';
import {Screen} from '../../ui/Screen';
import {Avatar, Check, DateField, EmailField, Empty, ListRow, MoneyField, NumberField, PhoneField, SearchField, Segmented, SelectField, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';
import {DetailsCard, ProofChip, StudentCardView, TermsChip, classWhen} from '../shared/pieces';
import {NavRow} from '../shared/Common';
import {paymentState, payRule, type PayRule, periodsOf, teacherPay} from '../../mock/pay';

/** The last closed period: how many teachers are still to be paid, or flagged a payment. */
const toPayLine = () => {
    const period = periodsOf(payRule(currentSchool())).find(item => !item.current);
    if (!period) return '';
    const rows = TEACHERS.filter(teacher => teacher.status === 'active' && teacherSchools(teacher).includes(currentSchool()) && teacherPay(teacher.id, currentSchool(), period).amount > 0)
        .map(teacher => paymentState(teacher.id, currentSchool(), period.from));
    return t('tpayRec.moreSub', {unpaid: rows.filter(state => state === 'unpaid').length, flagged: rows.filter(state => state === 'flagged').length});
};

const schemeName = (rule: PayRule) => t(rule.scheme === 'perSession' ? 'tpaySet.perSession' : rule.scheme === 'percent' ? 'tpaySet.percent' : 'tpaySet.tiers');
import {archiveRoom, deactivateTeacher, ENDED_ENROLLMENTS, endEnrollment, futureSessionsIn, futureSessionsOf, publishTerms, reassignTeacher, schedulePrice, GROWN, SEEN, setStudentStatus, termsState, packageHolders, savePackage, removePackage, offerPackageAgain} from '../../mock/changes';
import {coversText, planText, priceLabel} from '../shared/labels';

/** Director screens, part 2: students, the Más menu (classes, rooms, teachers, prices, terms, attendance, export). */

/** The student list scrolls on its own; "Registrar alumno" is the top bar's button. */
export function DirectorStudents() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const status = router.query.get('status') ?? 'active';
    // From the to-do: just the new enrollments, until the director goes back to everyone.
    const onlyNew = router.query.get('new') === '1';
    const list = studentsHere().filter(student => onlyNew ? Boolean(student.newEnrollment) : student.status === status)
        .filter(student => student.name.toLowerCase().includes(query.toLowerCase()));
    return (
        <Screen title={t('dstu.title')} subtitle={t('dstu.subtitle', {n: studentsHere().filter(student => student.status === 'active').length})} fixedList>
            <SearchField id="ds-search" label={t('students.search')} value={query} onChange={setQuery} beside={<>
            {onlyNew ? (
                <div className="banner">
                    <span className="strong">{t('dstu.newOnly', {n: list.length})}</span>
                    <button type="button" className="btn btn-secondary btn-sm self-start"
                            onClick={() => router.replace(router.withQuery('new', null))}>{t('dstu.seeAll')}</button>
                </div>
            ) : <Segmented label={t('dstu.status')} value={status}
                       onChange={value => router.replace(router.withQuery('status', value === 'active' ? null : value))}
                       options={[{value: 'active', label: t('dstu.active')}, {
                           value: 'invited',
                           label: t('dstu.invited')
                       }, {value: 'inactive', label: t('dstu.inactive')}]}/>}
            </>}/>
            <div className="list-fill">
            <ul className="list">
                {list.map(student => (
                    <ListRow key={student.id} left={<Avatar name={student.name}/>} title={personName(student.name)}
                             sub={planText(student)}
                             chips={<>
                                 {student.newEnrollment && <span className="chip chip-confirmed">{t('chip.newEnrollment', {what: student.newEnrollment.what, when: dayMonth(student.newEnrollment.when)})}</span>}
                                 {student.minor && <span className="chip">{t('card.minor')}</span>}
                                 {student.termsPending && <TermsChip/>}
                                 {student.overPlan && <span className="chip chip-over">{t('chip.overPlan')}</span>}
                                 {student.feeOwed && <span className="chip chip-rejected">{t('chip.feeOwed')}</span>}
                                 {student.turns18 && <span
                                     className="chip">{t('chip.turns18', {when: dayMonth(student.turns18)})}</span>}
                             </>}
                             onClick={() => router.navigate(`/d/students/${student.id}`)}/>
                ))}
            </ul>
            {list.length === 0 && <Empty>{t('students.none')}</Empty>}
            </div>
        </Screen>
    );
}

/**
 * One student's file, in tabs so each part stays one screen tall: card, classes, payments,
 * history. Students enroll themselves; the director sees their classes and can end one.
 */
export function DirectorStudent({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const student = studentById(id);
    const tab = router.query.get('tab') ?? 'card';
    const proofs = PROOFS.filter(proof => proof.student === id && proof.school === currentSchool());
    const since = dayMonth(student.since ?? '2026-09-01');
    const classes = student.plan === 'package'
        ? [{title: packageLabel(student.packageId ?? ''), sub: t('dstu.packageSub', {classes: t('dstu.anyClass'), from: since})}]
        : student.plan === 'totalpass' || student.plan === 'wellhub' ? [{title: planText(student), sub: t('dstu.passSub', {from: since})}]
        : student.plan === 'cash' && student.school ? [{title: planText(student), sub: t('dstu.visitSub', {from: since})}]
        : student.plan.startsWith('package')
        ? [{
            title: student.plan === 'package3' ? t('payments.package3') : t('payments.package2'),
            sub: t('dstu.packageSub', {
                classes: student.plan === 'package3' ? 'Telas intermedio · Aro aéreo · Trapecio' : 'Telas intermedio · Aro aéreo',
                from: dayMonth('2026-09-01')
            })
        }]
        : [{title: student.planLabel.split(' · ')[0], sub: t('dstu.enrollmentSub', {from: dayMonth(student.since ?? '2026-09-03')})}];
    const endsOn = (title: string) => ENDED_ENROLLMENTS.get(`${id}:${title}`);
    // The end of the month already paid: their next payment day.
    const paidUntil = student.paymentDay === 30 ? '2026-11-30' : '2026-12-15';
    const open = classes.filter(item => !endsOn(item.title)).length;
    const inactive = student.status === 'inactive';
    const [, redraw] = useState(0);
    useEffect(() => {
        SEEN.add(`new:${id}`);
        SEEN.add(`over:${id}`);
        if (tab === 'log') SEEN.add(`card:${id}`);
    }, [id, tab]);
    return (
        <Screen title={student.name} subtitle={planText(student)} back="/d/students" nav={false}
                note={!inactive && open > 0 ? t('dstu.endFirst') : undefined}
                footer={<>
                    {inactive ? (
                        <button type="button" className="btn btn-secondary" onClick={() => {
                            setStudentStatus(id, 'active');
                            redraw(n => n + 1);
                            toast(t('dstu.reactivated'));
                        }}>{t('dstu.reactivate')}</button>
                    ) : (
                        <button type="button" className="btn btn-secondary" disabled={open > 0} onClick={async () => {
                            if (await confirm({
                                title: t('dstu.deactivateTitle', {name: student.name}),
                                body: t('dstu.deactivateBody'),
                                confirm: t('dstu.deactivate'),
                            })) {
                                setStudentStatus(id, 'inactive');
                                redraw(n => n + 1);
                                toast(t('dstu.deactivated'));
                            }
                        }}>{t('dstu.deactivate')}</button>
                    )}
                    <button type="button" className="btn btn-danger-outline"
                            onClick={() => router.navigate(`/d/students/${id}/delete`)}>
                        <Icon name="trash"/>{t('dstu.delete')}
                    </button>
                </>}>
            {student.turns18 && (
                <div className="banner">
                    <span className="strong">{t('dstu.turns18', {when: dayMonth(student.turns18)})}</span>
                    <span>{t('dstu.turns18Body')}</span>
                    <button type="button" className="btn btn-secondary btn-sm self-start"
                            onClick={() => router.navigate(`/d/register?adult=${id}`)}>{t('dstu.registerAdult')}</button>
                </div>
            )}
            {inactive && <div className="banner">{t('dstu.inactiveBody')}</div>}
            {student.newEnrollment && <div className="banner">{t('dstu.newEnrollment', {what: student.newEnrollment.what, when: dayMonth(student.newEnrollment.when)})}</div>}
            {student.termsPending && <div className="banner banner-terms">{t('dstu.termsPending')}</div>}
            {student.overPlan && <div className="banner banner-over">{t('dstu.overPlan', {count: student.overPlan})}</div>}
            {student.feeOwed && <div className="banner banner-error">{t('dstu.feeOwed', {amount: money(800)})}</div>}
            <Segmented label={t('dstu.sections')} value={tab}
                       onChange={value => router.replace(router.withQuery('tab', value === 'card' ? null : value))}
                       options={[{value: 'card', label: t('dstu.tabCard')}, {
                           value: 'classes',
                           label: t('dstu.tabClasses')
                       }, {value: 'pay', label: t('dstu.tabPay')}, {value: 'log', label: t('dstu.tabLog')}]}/>
            {tab === 'card' && (
                <>
                    <p className="small">{t('dstu.payDayLine', {day: student.paymentDay})}</p>
                    <StudentCardView student={student}/>
                </>
            )}
            {tab === 'classes' && (
                <>
                    <ul className="list">
                        {classes.map(item => (
                            <ListRow key={item.title} title={item.title} sub={item.sub}
                                     right={endsOn(item.title) ? <span className="chip">{t('dstu.endsOn', {when: dayMonth(endsOn(item.title) ?? '')})}</span> : <button type="button" className="btn btn-ghost-danger btn-sm"
                                                    onClick={async () => {
                                                        if (await confirm({
                                                            title: t('dstu.endTitle', {name: item.title}),
                                                            body: t('dstu.endBody', {name: student.name.split(' ')[0], when: dayMonth(paidUntil)}),
                                                            confirm: t('dstu.end'),
                                                            danger: true
                                                        })) {
                                                            endEnrollment(id, item.title, paidUntil);
                                                            redraw(n => n + 1);
                                                            toast(t('dstu.ended'));
                                                        }
                                                    }}>{t('dstu.end')}</button>}/>
                        ))}
                    </ul>
                    <p className="hint">{t('dstu.selfEnrollHint')}</p>
                </>
            )}
            {tab === 'pay' && (
                proofs.length === 0 ? <Empty>{t('dstu.noProofs')}</Empty> : (
                    <ul className="list">
                        {proofs.map(proof => (
                            <ListRow key={proof.id} title={coversText(proof.covers)}
                                     sub={`${t(`method.${proof.method}` as const)} · ${money(proof.amount)} · ${dayMonth(proof.sent)} ${time(proof.sentAt)}`}
                                     right={<ProofChip state={proof.state}/>}
                                     onClick={proof.state === 'uploaded' ? () => router.navigate(`/d/payments/review/${proof.id}`) : undefined}/>
                        ))}
                    </ul>
                )
            )}
            {tab === 'log' && (
                <ul className="list">
                    <ListRow title={t('dstu.logHealth')}
                             sub={`${student.name.split(' ')[0]} · ${dayShort('2026-11-24')} · ${time('21:14')}`}/>
                    <ListRow title={t('dstu.logContact')}
                             sub={`${student.name.split(' ')[0]} · ${dayShort('2026-10-02')}`}/>
                    <ListRow title={t('dstu.logCreated')}
                             sub={`${student.name.split(' ')[0]} · ${dayShort('2026-09-01')}`}/>
                </ul>
            )}
        </Screen>
    );
}

export function DeleteStudent({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const student = studentById(id);
    const [typed, setTyped] = useState('');
    const matches = typed.trim().toLowerCase() === student.name.toLowerCase();
    return (
        <Screen title={t('ddel.title')} subtitle={student.name} back={`/d/students/${id}`} nav={false}
                footer={<button type="button" className="btn btn-danger btn-lg" disabled={!matches}
                                onClick={async () => {
                                    if (await confirm({
                                        title: t('ddel.confirmTitle', {name: student.name}),
                                        body: t('ddel.confirmBody'),
                                        confirm: t('ddel.button'),
                                        danger: true
                                    })) {
                                        toast(t('ddel.done'));
                                        // The student's file and this screen leave the history with them.
                                        router.leave(2, '/d/students');
                                    }
                                }}>{t('ddel.button')}</button>}>
            <div className="card">
                <span className="strong">{t('delete.goes')}</span>
                <p className="small">{t('ddel.goes')}</p>
            </div>
            <div className="card">
                <span className="strong">{t('ddel.staysTitle')}</span>
                <p className="small">{t('ddel.stays')}</p>
            </div>
            <p className="small">{t('ddel.email')}</p>
            <TextField id="ddel-name" label={t('ddel.type', {name: student.name})} value={typed}
                       onChange={event => setTyped(event.target.value)}
                       autoComplete="off" autoCapitalize="none" spellCheck={false}/>
        </Screen>
    );
}

/**
 * Register a student. For minors, the guardian is entered once with all their children: the
 * guardian then fills the family's people once, and each child's own part.
 */
export function Register() {
    const router = useRouter();
    const adult = router.query.get('adult');
    const grown = adult ? studentById(adult) : null;
    const [who, setWho] = useState<string>(adult ? 'adult' : 'minor');
    const [kids, setKids] = useState<string[]>(['Lucas Medina Paz', 'Emma Medina Paz']);
    const [day, setDay] = useState(grown ? String(grown.paymentDay) : '');
    return (
        <Screen title={t('reg.title')} back="/d/students" nav={false} note={day ? t('reg.termsNote') : t('reg.pickDay')}
                footer={<button type="button" className="btn btn-lg" disabled={!day}
                                onClick={() => {
                                    if (adult) GROWN.add(adult);
                                    router.replace(`/d/register/sent?who=${who}${adult ? `&adult=${adult}` : ''}`);
                                }}>{t('reg.send')}</button>}>
            {grown && <div className="banner">{t('reg.grownNote', {name: grown.name, when: dayMonth(grown.turns18 ?? TODAY)})}</div>}
            {!grown && <SelectField id="rg-who" label={t('reg.who')} value={who} onChange={setWho}
                         options={[{value: 'minor', label: t('reg.minor'), hint: t('reg.minorHint')}, {
                             value: 'adult',
                             label: t('reg.adult'),
                             hint: t('reg.adultHint')
                         }]}/>}
            <SelectField id="rg-day" label={t('reg.payDay')} value={day} onChange={setDay}
                         placeholder={t('common.pick')}
                         options={[{value: '15', label: t('reg.day15')}, {value: '30', label: t('reg.day30')}]}
                         hint={t('reg.payDayHint')}/>
            {who === 'minor' ? (
                <>
                    <h2 className="section-title">{t('reg.children')}</h2>
                    {kids.map((name, index) => (
                        <div key={index} className="row align-end" >
                            <div className="grow">
                                <TextField id={`rg-kid-${index}`} label={t('reg.childN', {n: index + 1})} value={name}
                                           autoComplete="off"
                                           onChange={event => setKids(list => list.map((item, i) => i === index ? event.target.value : item))}/>
                            </div>
                            {kids.length > 1 && (
                                <button type="button" className="icon-btn" aria-label={t('form.remove')}
                                        onClick={() => setKids(list => list.filter((_, i) => i !== index))}>
                                    <Icon name="trash" size={18}/>
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" className="btn btn-secondary" onClick={() => setKids(list => [...list, ''])}>
                        <Icon name="plus"/>{t('reg.addChild')}</button>
                    <h2 className="section-title">{t('reg.guardian')}</h2>
                    <TextField id="rg-gname" label={t('form.name')} defaultValue="Rosa Paz" autoComplete="off"/>
                    <EmailField id="rg-gemail" label={t('signIn.email')} defaultValue="rosa.paz@correo.mx"/>
                    <PhoneField id="rg-gphone" label={t('form.phone')} defaultValue="55 3030 4040"/>
                    <p className="hint">{t('reg.familyOnce')}</p>
                </>
            ) : (
                <>
                    <TextField id="rg-aname" label={t('form.name')}
                               defaultValue={adult ? 'Emilio Sánchez' : 'Iván Cruz'} autoComplete="off"/>
                    <EmailField id="rg-aemail" label={t('signIn.email')}
                                defaultValue={adult ? 'emilio.sanchez@correo.mx' : 'ivan.cruz@correo.mx'}/>
                </>
            )}
            <p className="hint">{t('reg.selfEnroll')}</p>
        </Screen>
    );
}

export function RegisterSent() {
    const router = useRouter();
    const toast = useToast();
    const minor = router.query.get('who') !== 'adult';
    const adult = router.query.get('adult');
    const grown = adult ? studentById(adult) : null;
    return (
        <Screen title={t('regSent.title')} back="/d/students" nav={false} note={t('regSent.linkNote')}
                footer={
                    <div className="btn-row">
                        <button type="button" className="btn btn-secondary btn-lg"
                                onClick={() => toast(t('regSent.resent'))}><Icon name="repeat"/>{t('regSent.resend')}
                        </button>
                        <button type="button" className="btn btn-lg"
                                onClick={() => router.back('/d/students')}>{t('common.done')}</button>
                    </div>
                }>
            <div className="done">
                <span className="avatar avatar-lg"><Icon name="mail" size={40}/></span>
                <p className="big">{t(minor ? 'regSent.bodyMinor' : 'regSent.body', {email: minor ? 'rosa.paz@correo.mx' : grown ? 'emilio.sanchez@correo.mx' : 'ivan.cruz@correo.mx'})}</p>
                <p className="muted">{t('regSent.same')}</p>
                <p className="muted">{t('regSent.next')}</p>
            </div>
            {grown && <p className="small">{t('regSent.grownLater', {name: grown.name.split(' ')[0]})}</p>}
        </Screen>
    );
}


export function More() {
    return (
        <Screen title={t('more.title')} subtitle={SCHOOLS[currentSchool()].name}>
            <h2 className="section-title">{t('more.school')}</h2>
            <ul className="list">
                <NavRow label={t('more.setup')} sub={t('setup.progress', {done: 6, of: 6})} to="/d/setup" icon="check"/>
                <NavRow label={t('more.rooms')}
                        sub={t('more.roomsSub', {n: roomsHere().filter(r => !r.archived).length})} to="/d/rooms"
                        icon="room"/>
                <NavRow label={t('more.teachers')} sub={t('more.teachersSub', {n: TEACHERS.filter(teacher => teacher.status === 'active' && teacherSchools(teacher).includes(currentSchool())).length})} to="/d/teachers" icon="people"/>
                <NavRow label={t('more.prices')} sub={t('more.pricesSub')} to="/d/prices" icon="pay"/>
                <NavRow label={t('tpayRec.title')} sub={toPayLine()} to="/d/teacher-payments" icon="pay"/>
                <NavRow label={t('more.payRule')} sub={schemeName(payRule(currentSchool()))} to="/d/teacher-pay" icon="chart"/>
                <NavRow label={t('more.terms')} sub={t('todo.termsSub', {done: termsState().accepted, of: termsState().students})} to="/d/terms" icon="file"/>
                <NavRow label={t('more.export')} sub={t('more.exportSub')} to="/d/export" icon="download"/>
            </ul>
            <h2 className="section-title">{t('more.me')}</h2>
            <ul className="list">
                <NavRow label={t('more.myStudents')} sub={t('more.myStudentsSub')} to="/d/my-students" icon="people"/>
                <NavRow label={t('more.myAttendance')} sub={t('more.myAttendanceSub')} to="/d/my-payments" icon="chart"/>
                <NavRow label={t('account.title')} sub={t('more.accountSub')} to="/d/account" icon="user"/>
            </ul>
        </Screen>
    );
}

export function Rooms() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const ours = roomsHere();
    const many = ours.length > 10;
    const tab = router.query.get('tab') === 'archived' ? 'archived' : 'active';
    const shown = ours.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase()));
    return (
        <Screen title={t('more.rooms')} subtitle={many ? t('rooms.count', {n: ours.filter(r => !r.archived).length}) : undefined} back="/d/more" fixedList={many}
                footer={<button type="button" className="btn btn-lg" onClick={() => router.navigate('/d/rooms/new')}><Icon name="plus"/>{t('rooms.add')}</button>}>
            {many && <SearchField id="rm-search" label={t('list.search')} value={query} onChange={setQuery}
                                  beside={<Segmented label={t('more.rooms')} value={tab} onChange={value => router.replace(router.withQuery('tab', value === 'active' ? null : value))}
                                                     options={[{value: 'active', label: t('rooms.tabActive', {n: ours.filter(r => !r.archived).length})}, {value: 'archived', label: t('rooms.tabArchived', {n: ours.filter(r => r.archived).length})}]}/>}/>}
            <div className={many ? 'list-fill' : 'stack'}>
            <ul className="list">
                {shown.filter(r => !r.archived && (!many || tab === 'active')).map(r => (
                    <ListRow key={r.id} title={r.name}
                             sub={r.classesAtOnce ? t('rooms.capacity', {classes: r.classesAtOnce, students: r.students ?? 0}) : t('rooms.noCapacity')}
                             onClick={() => router.navigate(`/d/rooms/${r.id}`)}/>
                ))}
            </ul>
            {(!many || tab === 'active') && <p className="hint">{t('rooms.hint')}</p>}
            {!many && <h2 className="section-title">{t('rooms.archived')}</h2>}
            <ul className="list">
                {shown.filter(r => r.archived && (!many || tab === 'archived')).map(r => <ListRow key={r.id} title={r.name} sub={t('rooms.archivedSub')}/>)}
            </ul>
            </div>
        </Screen>
    );
}

/**
 * One room (a screen: it's a form, and it links out to the classes that use the room): its name and
 * capacity, archive pinned apart from saving, and, while it has sessions ahead, the classes holding
 * them, each opening its Plan form from its next session there.
 */
export function RoomScreen({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const room: Room | undefined = ROOMS.find(r => r.id === id);
    const ahead = room ? futureSessionsIn(room.id) : [];
    const holding = [...new Set(ahead.map(session => session.classId))].map(classId => ({
        item: classById(classId), first: ahead.find(session => session.classId === classId)?.date ?? TODAY, n: ahead.filter(session => session.classId === classId).length,
    }));
    const [name, setName] = useState(room?.name ?? '');
    const [classes, setClasses] = useState(room?.classesAtOnce ? String(room.classesAtOnce) : '');
    const [students, setStudents] = useState(room?.students ? String(room.students) : '');
    const named = name.trim().length > 0;
    return (
        <Screen title={room ? room.name : t('rooms.add')} back="/d/rooms" nav={false}
                note={named ? undefined : t('rooms.needName')}
                footer={<>
                    <button type="button" className="btn btn-lg" disabled={!named} onClick={() => {
                        const fields = {name: name.trim(), classesAtOnce: Number(classes) || undefined, students: Number(students) || undefined};
                        if (room) Object.assign(room, fields);
                        else ROOMS.push({id: `room-${ROOMS.length + 1}`, school: currentSchool() === 'colibri' ? undefined : currentSchool(), futureSessions: 0, ...fields});
                        toast(t('form.saved'));
                        router.back('/d/rooms');
                    }}>{room ? t('form.saveChanges') : t('rooms.add')}</button>
                    {room && !room.archived && ahead.length === 0 && (
                        <button type="button" className="btn btn-secondary" onClick={async () => {
                            if (await confirm({title: t('rooms.archiveTitle', {name: room.name}), body: t('rooms.archiveBody'), confirm: t('rooms.archive')})) {
                                archiveRoom(room.id);
                                toast(t('rooms.archived1'));
                                router.back('/d/rooms');
                            }
                        }}>{t('rooms.archive')}</button>
                    )}
                </>}>
            <TextField id="rm-name" label={t('rooms.name')} value={name} onChange={event => setName(event.target.value)}/>
            <div className="two">
                <NumberField id="rm-classes" label={t('rooms.classesAtOnce')} value={classes} onChange={event => setClasses(event.target.value.replace(/\D/g, ''))}/>
                <NumberField id="rm-students" label={t('rooms.students')} value={students} onChange={event => setStudents(event.target.value.replace(/\D/g, ''))}/>
            </div>
            <p className="hint">{t('rooms.capacityHint')}</p>
            {room && ahead.length > 0 && (
                <>
                    <h2 className="section-title">{t('rooms.usedBy')}</h2>
                    <p className="small">{t('rooms.cantArchiveBody', {n: ahead.length})}</p>
                    <ul className="list">
                        {holding.map(({item, first, n}) => (
                            <ListRow key={item.id} title={item.name} sub={t('rooms.holdingSub', {n, when: dayMonth(first)})}
                                     onClick={() => router.navigate(item.kind === 'weekly' ? `/d/activity/${item.id}?since=${first}` : `/d/activity/${item.id}`)}/>
                        ))}
                    </ul>
                </>
            )}
        </Screen>
    );
}

/** A teacher's classes in a list row: the first two, then how many more. */
const classesLine = (names: string[]) => names.length > 2 ? `${names.slice(0, 2).join(' · ')} ${t('list.andMore', {n: names.length - 2})}` : names.join(' · ');

export function Teachers() {
    const router = useRouter();
    const toast = useToast();
    const invite = useSheetRoute('invite');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const ready = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);
    const [query, setQuery] = useState('');
    const ours = TEACHERS.filter(teacher => teacherSchools(teacher).includes(currentSchool()));
    const many = ours.length > 10;
    const status = router.query.get('status') ?? 'active';
    const counts = {active: 0, invited: 0, inactive: 0};
    ours.forEach(teacher => counts[teacher.status]++);
    const shown = ours.filter(teacher => (!many || teacher.status === status) && teacher.name.toLowerCase().includes(query.trim().toLowerCase()));
    return (
        <Screen title={t('more.teachers')} subtitle={many ? t('teachers.count', {n: ours.length}) : undefined} back="/d/more" fixedList={many}
                footer={<button type="button" className="btn btn-lg" onClick={() => invite.show()}>
                    <Icon name="mail"/>{t('teachers.invite')}
                </button>}>
            {many && <SearchField id="tc-search" label={t('list.search')} value={query} onChange={setQuery}
                                  beside={<Segmented label={t('dstu.status')} value={status} onChange={value => router.replace(router.withQuery('status', value === 'active' ? null : value))}
                                                     options={[{value: 'active', label: t('teachers.tabActive', {n: counts.active})}, {value: 'invited', label: t('teachers.tabInvited', {n: counts.invited})}, {value: 'inactive', label: t('teachers.tabInactive', {n: counts.inactive})}]}/>}/>}
            <div className={many ? 'list-fill' : 'stack'}>
            <ul className="list">
                {shown.map(teacher => (
                    <ListRow key={teacher.id} fixed left={<Avatar name={teacher.name}/>} title={personName(teacher.name)}
                             sub={classesLine([...new Set(CLASSES.filter(c => c.teacher === teacher.id && schoolOfClass(c) === currentSchool()).map(c => c.name))]) || teacher.email}
                             chips={<>
                                 {teacher.director && <span className="chip">{t('teachers.director')}</span>}
                                 {teacher.status === 'invited' && <span className="chip chip-uploaded">{t('teachers.invited')}</span>}
                                 {teacher.status === 'inactive' && <span className="chip">{t('dstu.inactive')}</span>}
                                 {teacher.emergency.length === 0 && teacher.status === 'active' &&
                                     <span className="chip chip-warning">{t('teachers.noEmergency')}</span>}
                             </>}
                             onClick={() => router.navigate(`/d/teachers/${teacher.id}`)}/>
                ))}
            </ul>
            </div>
            <Sheet open={invite.open} onClose={invite.close} title={t('teachers.invite')}
                   footer={<>
                       {!ready && <p className="hint center">{t('teachers.inviteNeed')}</p>}
                       <button type="button" className="btn btn-lg" disabled={!ready} onClick={() => {
                           toast(t('teachers.inviteSent'));
                           setName('');
                           setEmail('');
                           invite.close();
                       }}>{t('teachers.inviteSend')}</button>
                   </>}>
                <TextField id="ti-name" label={t('form.name')} autoComplete="off" value={name} onChange={event => setName(event.target.value)}/>
                <EmailField id="ti-email" label={t('signIn.email')} value={email} onChange={event => setEmail(event.target.value)}/>
                <p className="hint">{t('teachers.inviteHint')}</p>
            </Sheet>
        </Screen>
    );
}

export function TeacherDetail({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const teacher = TEACHERS.find(item => item.id === id) ?? TEACHERS[0];
    const classes = CLASSES.filter(c => c.teacher === id && schoolOfClass(c) === currentSchool());
    const [, redraw] = useState(0);
    // Rule 2: a teacher with sessions ahead (theirs, or covering someone) is reassigned before leaving.
    const ahead = futureSessionsOf(id);
    const canLeave = teacher.status === 'active' && !teacher.director;
    return (
        <Screen title={teacher.name} subtitle={teacher.email} back="/d/teachers" nav={false}
                note={canLeave && ahead.length > 0 ? t('teachers.reassignFirst') : undefined}
                footer={canLeave ? (
                    <button type="button" className="btn btn-secondary" disabled={ahead.length > 0} onClick={async () => {
                        if (await confirm({
                            title: t('teachers.deactivateTitle', {name: teacher.name}),
                            body: t('teachers.deactivateBody'),
                            confirm: t('dstu.deactivate'),
                        })) {
                            deactivateTeacher(id);
                            redraw(n => n + 1);
                            toast(t('dstu.deactivated'));
                        }
                    }}>{t('dstu.deactivate')}</button>
                ) : teacher.status === 'inactive' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => {
                        teacher.status = 'active';
                        redraw(n => n + 1);
                        toast(t('dstu.reactivated'));
                    }}>{t('dstu.reactivate')}</button>
                ) : undefined}>
            {teacher.status === 'invited' && (
                <div className="banner">
                    <span>{t('teachers.invitedBody')}</span>
                    <button type="button" className="btn btn-secondary btn-sm self-start"
                            onClick={() => toast(t('regSent.resent'))}>{t('regSent.resend')}</button>
                </div>
            )}
            {teacher.status === 'inactive' && <div className="banner">{t('teachers.inactiveBody')}</div>}
            {canLeave && ahead.length > 0 && (
                <ul className="list">
                    <NavRow label={t('teachers.reassign')} sub={t('teachers.aheadBody', {n: ahead.length})} to={`/d/teachers/${id}/reassign`} icon="swap"/>
                </ul>
            )}
            <h2 className="section-title">{t('staff.card')}</h2>
            <StudentCardView compact student={{
                id: teacher.id,
                name: teacher.name,
                age: 0,
                plan: 'cash',
                planLabel: '',
                paymentDay: 30,
                status: 'active',
                health: teacher.health,
                emergency: teacher.emergency,
            }}/>
            <DetailsCard title={t('staff.contact')} name={teacher.name} phone={teacher.phone} email={teacher.email}/>
            <p className="hint">{t('staff.directorHint')}</p>
            {teacher.status !== 'invited' && (
                <ul className="list">
                    <NavRow label={t('tpaySet.theirPay')} sub={schemeName(payRule(currentSchool()))} to={`/d/teachers/${id}/pay`} icon="chart"/>
                </ul>
            )}
            <h2 className="section-title">{t('teachers.classes')}</h2>
            {classes.length === 0 ? <Empty>{t('teachers.noClasses')}</Empty> : (
                <ul className="list">
                    {classes.map(c => <ListRow key={c.id} title={c.name}
                                               sub={c.slots.map(s => `${weekdayShort(s.weekday)} ${time(s.start)} · ${roomName(s.room)}`).join(', ')}
                                               onClick={() => router.navigate(`/d/activity/${c.id}`)}/>)}
                </ul>
            )}
        </Screen>
    );
}

/**
 * Before a teacher leaves: a new teacher for each of their classes from a date, and the sessions
 * they'd cover as a substitute go back to their own teacher. Saved only once every class has one.
 */
export function Reassign({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const teacher = TEACHERS.find(item => item.id === id) ?? TEACHERS[0];
    const classes = CLASSES.filter(c => c.teacher === id && schoolOfClass(c) === currentSchool() && c.until >= TODAY);
    const covering = futureSessionsOf(id).filter(session => session.substitute === id);
    const others = TEACHERS.filter(item => item.status === 'active' && item.id !== id && teacherSchools(item).includes(currentSchool()))
        .map(item => ({value: item.id, label: personName(item.name)}));
    const [to, setTo] = useState<Record<string, string>>({});
    const [since, setSince] = useState(TODAY);
    const missing = classes.filter(c => !to[c.id]).length;
    return (
        <Screen title={t('teachers.reassign')} subtitle={personName(teacher.name)} back={`/d/teachers/${id}`} nav={false}
                note={missing ? t('reassign.pickAll', {n: missing}) : t('sub.hint')}
                footer={<button type="button" className="btn btn-lg" disabled={missing > 0 || !since} onClick={async () => {
                    if (await confirm({
                        title: t('reassign.confirmTitle'),
                        body: t('reassign.confirmBody', {n: futureSessionsOf(id).filter(session => session.date >= since).length}),
                        confirm: t('form.saveChanges')
                    })) {
                        reassignTeacher(id, to, since);
                        toast(t('reassign.done'));
                        router.back(`/d/teachers/${id}`);
                    }
                }}>{t('form.saveChanges')}</button>}>
            <p>{t('reassign.body')}</p>
            <DateField id="ra-from" label={t('reassign.since')} min={TODAY} value={since} onChange={setSince}/>
            {classes.map(c => (
                <div key={c.id} className="card">
                    <span className="strong">{c.name}</span>
                    <span className="small muted">{c.slots.map(s => `${weekdayShort(s.weekday)} ${time(s.start)}`).join(', ')}</span>
                    <SelectField id={`ra-${c.id}`} label={t('sub.newTeacher')} value={to[c.id] ?? ''} placeholder={t('common.pick')}
                                 onChange={value => setTo(map => ({...map, [c.id]: value}))} options={others}/>
                </div>
            ))}
            {covering.length > 0 && (
                <div className="card">
                    <span className="strong">{t('reassign.covering', {n: covering.length})}</span>
                    <span className="small">{covering.map(session => `${classById(session.classId).name}, ${dayMonth(session.date)}`).join(' · ')}</span>
                    <span className="small muted">{t('reassign.coveringBody')}</span>
                </div>
            )}
        </Screen>
    );
}

const PRICE_GROUPS: { kind: Price['kind']; label: Parameters<typeof t>[0] }[] = [
    {kind: 'fee', label: 'prices.fee'}, {kind: 'package', label: 'prices.packages'}, {
        kind: 'monthly',
        label: 'prices.monthly'
    },
    {kind: 'visit', label: 'prices.visit'}, {kind: 'trial', label: 'prices.trial'}, {
        kind: 'free',
        label: 'prices.free'
    },
];

/** Prices. A change is a new price from a date, never an edit; it's posted on the board as important. */
export function Prices() {
    const toast = useToast();
    const confirm = useConfirm();
    const sheet = useSheetRoute('price');
    const [amount, setAmount] = useState('');
    const [from, setFrom] = useState('2027-01-01');
    const price = PRICES.find(p => p.id === sheet.item);
    const label = priceLabel;
    const router = useRouter();
    return (
        <Screen title={t('more.prices')} back="/d/more"
                footer={<button type="button" className="btn btn-lg" onClick={() => router.navigate('/d/package/new')}><Icon name="plus"/>{t('pack.add')}</button>}>
            <div className="banner">{t('prices.intro')}</div>
            {PRICE_GROUPS.map(group => (
                <section key={group.kind} className="stack">
                    <h2 className="section-title">{t(group.label)}</h2>
                    <ul className="list">
                        {pricesHere().filter(p => p.kind === group.kind).map(p => (
                            <ListRow key={p.id} title={label(p)}
                                     sub={p.kind === 'fee' ? t('prices.feeSub', {
                                         months: p.extra ?? '3',
                                         when: dayMonthYear(p.from)
                                     }) : t('prices.since', {when: dayMonthYear(p.from)})}
                                     right={<span className="big num">{money(p.amount)}</span>}
                                     chips={<>
                                         {p.next && <span className="chip chip-important">{t('prices.nextChip', {amount: money(p.next.amount), when: dayMonthYear(p.next.from)})}</span>}
                                         {PACKAGES.find(pack => pack.id === p.id)?.retired && <span className="chip">{t('pack.retiredChip')}</span>}
                                     </>}
                                     onClick={() => p.kind === 'package' ? router.navigate(`/d/package/${p.id}`) : sheet.show(p.id)}/>
                        ))}
                    </ul>
                </section>
            ))}
            <Sheet open={sheet.open} onClose={sheet.close} title={price ? label(price) : ''}
                   footer={<>
                       {!amount && <p className="hint center">{t('prices.needAmount')}</p>}
                       <button type="button" className="btn btn-lg" disabled={!amount || !from} onClick={async () => {
                           if (await confirm({title: t('prices.confirmTitleWhat', {amount: money(Number(amount)), when: dayMonthYear(from)}), body: t('prices.confirmBody'), confirm: t('prices.confirmButton')})) {
                               if (price) schedulePrice(price.id, Number(amount), from);
                               toast(t('prices.saved'));
                               setAmount('');
                               sheet.close();
                           }
                       }}>{t('prices.save')}</button>
                   </>}>
                {price && (
                    <>
                        <p className="muted">{t('prices.current', {
                            amount: money(price.amount),
                            when: dayMonthYear(price.from)
                        })}</p>
                        <MoneyField id="pr-amount" label={t('prices.newAmount')} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))}/>
                        {price.next && <div className="banner banner-important small">{t('prices.nextBody', {amount: money(price.next.amount), when: dayMonthYear(price.next.from)})}</div>}
                        <DateField id="pr-from" label={t('prices.from')} min={TODAY} value={from} onChange={setFrom}/>
                        {price.kind === 'fee' && (
                            <TextField id="pr-months" label={t('prices.months')} inputMode="numeric" pattern="[0-9]*"
                                       defaultValue={price.extra}
                                       hint={t('prices.monthsHint')}/>
                        )}
                        <div className="banner banner-important small">
                            <span className="row-start"><Icon name="star" size={16}/>{t('prices.boardNote')}</span>
                        </div>
                        <h3 className="section-title">{t('prices.history')}</h3>
                        <ul className="list">
                            <ListRow title={money(price.amount)} sub={t('prices.since', {when: dayMonthYear(price.from)})}
                                     right={<span className="chip chip-confirmed">{t('prices.now')}</span>}/>
                            {price.history.map(h => <ListRow key={h.from} title={money(h.amount)}
                                                             sub={t('prices.since', {when: dayMonthYear(h.from)})}/>)}
                        </ul>
                        <p className="hint">{t('prices.keptHint')}</p>
                    </>
                )}
            </Sheet>
        </Screen>
    );
}

/**
 * A package: its name, how many classes a week, and which of the school's classes it covers (all of
 * them, or some). A new one also takes its price; an existing one changes its price in Prices, as
 * every price does. One nobody has can be deleted; one in use stops being offered instead.
 */
export function PackageForm({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const pack = PACKAGES.find(item => item.id === id);
    const price = PRICES.find(item => item.id === id);
    const classes = CLASSES.filter(item => item.kind === 'weekly' && schoolOfClass(item) === currentSchool() && !item.ending);
    const [name, setName] = useState(price ? priceLabel(price) : '');
    const [perWeek, setPerWeek] = useState(pack ? String(pack.perWeek) : '');
    const [covers, setCovers] = useState<string[]>(pack ? pack.classes : classes.map(item => item.id));
    const [amount, setAmount] = useState('');
    const holders = pack ? packageHolders(pack.id) : [];
    const ready = name.trim().length > 0 && Number(perWeek) > 0 && covers.length > 0 && (pack ? true : Number(amount) > 0);
    const missing = !name.trim() ? t('pack.needName') : !(Number(perWeek) > 0) ? t('pack.needPerWeek') : covers.length === 0 ? t('pack.needClasses') : !pack && !(Number(amount) > 0) ? t('pack.needPrice') : undefined;
    const allOn = covers.length === classes.length;
    return (
        <Screen title={pack ? priceLabel(price ?? {id, kind: 'package', label: name, amount: 0, from: TODAY, history: []}) : t('pack.add')} back="/d/prices" nav={false}
                note={missing}
                footer={<>
                    <button type="button" className="btn btn-lg" disabled={!ready} onClick={async () => {
                        const fields = {label: name.trim(), perWeek: Number(perWeek), classes: covers};
                        if (pack) {
                            if (holders.length && !await confirm({title: t('pack.confirmEdit'), body: t('pack.confirmEditBody', {n: holders.length}), confirm: t('form.saveChanges')})) return;
                            savePackage(fields, pack.id);
                        } else {
                            if (!await confirm({title: t('pack.confirmNew', {amount: money(Number(amount))}), body: t('pack.confirmNewBody'), confirm: t('pack.add')})) return;
                            savePackage(fields, undefined, Number(amount));
                        }
                        toast(t('form.saved'));
                        router.back('/d/prices');
                    }}>{pack ? t('form.saveChanges') : t('pack.add')}</button>
                    {pack && !pack.retired && (
                        <button type="button" className={holders.length ? 'btn btn-secondary' : 'btn btn-danger-outline'} onClick={async () => {
                            if (await confirm(holders.length
                                ? {title: t('pack.retireTitle'), body: t('pack.retireBody', {n: holders.length}), confirm: t('pack.retire')}
                                : {title: t('pack.deleteTitle'), body: t('pack.deleteBody'), confirm: t('pack.delete'), danger: true})) {
                                removePackage(pack.id);
                                toast(t(holders.length ? 'pack.retired' : 'pack.deleted'));
                                router.back('/d/prices');
                            }
                        }}>{t(holders.length ? 'pack.retire' : 'pack.delete')}</button>
                    )}
                    {pack?.retired && (
                        <button type="button" className="btn btn-secondary" onClick={() => {
                            offerPackageAgain(pack.id);
                            toast(t('pack.offeredAgain'));
                            router.back('/d/prices');
                        }}>{t('pack.offerAgain')}</button>
                    )}
                </>}>
            {pack?.retired && <div className="banner">{t('pack.retiredBody', {n: holders.length})}</div>}
            <TextField id="pk-name" label={t('pack.name')} value={name} onChange={event => setName(event.target.value)} placeholder={t('pack.namePlaceholder')}/>
            <NumberField id="pk-week" label={t('pack.perWeek')} value={perWeek} onChange={event => setPerWeek(event.target.value.replace(/\D/g, ''))} hint={t('pack.perWeekHint')}/>
            {pack && price ? (
                <ListRow title={t('pack.price')} sub={t('pack.priceWhere')} right={<span className="big num">{money(price.amount)}</span>}
                         onClick={() => router.navigate(`/d/prices?sheet=price&item=${pack.id}`)}/>
            ) : (
                <MoneyField id="pk-price" label={t('pack.priceMonth')} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))}/>
            )}
            {pack && <p className="small muted">{t('pack.holders', {n: holders.length})}</p>}
            <div className="section-head">
                <h2 className="section-title">{t('pack.covers', {n: covers.length, of: classes.length})}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCovers(allOn ? [] : classes.map(item => item.id))}>
                    {t(allOn ? 'pack.none' : 'pack.all')}</button>
            </div>
            {classes.map(item => (
                <Check key={item.id} id={`pk-${item.id}`} label={item.name} hint={`${teacherName(item.teacher)} · ${classWhen(item)}`}
                       checked={covers.includes(item.id)}
                       onChange={on => setCovers(list => on ? [...list, item.id] : list.filter(other => other !== item.id))}/>
            ))}
            <p className="hint">{t('pack.coversHint')}</p>
        </Screen>
    );
}

export function Terms() {
    const toast = useToast();
    const confirm = useConfirm();
    const input = useRef<HTMLInputElement>(null);
    // Who hasn't accepted: a few at first, all of them (in a box that shows five at a time) on request.
    const fresh = termsState().uploaded === TODAY;
    const waiting = termsState().waiting;
    const [showAll, setShowAll] = useState(false);
    const [, redraw] = useState(0);
    return (
        <Screen title={t('more.terms')} back="/d/more"
                footer={<button type="button" className="btn btn-lg" onClick={() => input.current?.click()}><Icon name="upload"/>{t('dterms.upload')}</button>}>
            <div className="card">
                <div className="row"><span className="big">{t('terms.version', {n: termsState().version})}</span><span
                    className="chip chip-confirmed">{t('dterms.current')}</span></div>
                <span className="small muted">{t('dterms.uploaded', {when: dayMonthYear(termsState().uploaded)})}</span>
                <div className="progress"><span style={{width: `${Math.round(termsState().accepted / termsState().students * 100)}%`}}/></div>
                <span className="small">{t('todo.termsSub', {done: termsState().accepted, of: termsState().students})}</span>
            </div>
            <input ref={input} type="file" accept="application/pdf" hidden onChange={async event => {
                if (!event.target.files?.[0]) return;
                const ok = await confirm({
                    title: t('dterms.confirmTitle'),
                    body: t('dterms.confirmBodyFile', {n: termsState().students, file: event.target.files[0].name, version: termsState().version + 1}),
                    confirm: t('dterms.confirmButton')
                });
                event.target.value = '';
                if (ok) {
                    publishTerms();
                    redraw(n => n + 1);
                    toast(t('dterms.uploadedToast', {n: termsState().version}));
                }
            }}/>
            {fresh && <p className="small">{t('dterms.freshBody')}</p>}
            <h2 className="section-title">{t('dterms.notYet', {n: waiting.length})}</h2>
            <ul id="terms-waiting" className={showAll ? 'list list-max-5' : 'list'}>
                {(showAll ? waiting : waiting.slice(0, 2)).map(name => (
                    <ListRow key={name} left={<Avatar name={name}/>} title={personName(name)} right={<TermsChip/>}/>
                ))}
                {!showAll && waiting.length > 2 && <ListRow title={t('dterms.andMore', {n: waiting.length - 2})} onClick={() => setShowAll(true)}/>}
            </ul>
            {showAll && (
                <button type="button" className="btn btn-ghost btn-sm self-center" aria-controls="terms-waiting"
                        onClick={() => setShowAll(false)}>{t('dterms.showLess')}</button>
            )}
            <h2 className="section-title">{t('dterms.versions')}</h2>
            <ul className="list">
                {termsState().earlier.map(item => <ListRow key={item.version} title={t('terms.version', {n: item.version})} sub={dayMonthYear(item.uploaded)}/>)}
            </ul>
        </Screen>
    );
}

export function Export() {
    const toast = useToast();
    const confirm = useConfirm();
    const [health, setHealth] = useState(false);
    return (
        <Screen note={t('export.logged')} title={t('more.export')} back="/d/more"
                footer={<button type="button" className="btn btn-lg" onClick={async () => {
                    if (health && !(await confirm({
                        title: t('export.healthTitle'),
                        body: t('export.healthBody'),
                        confirm: t('export.healthConfirm'),
                        danger: true
                    }))) return;
                    toast(t('export.started'));
                }}><Icon name="download"/>{t('export.button')}</button>}>
            <p>{t('export.body', {school: SCHOOLS[currentSchool()].name})}</p>
            <div className="card">
                <Check id="ex-people" label={t('export.people')} defaultChecked/>
                <Check id="ex-classes" label={t('export.classes')} defaultChecked/>
                <Check id="ex-pay" label={t('export.pay')} defaultChecked/>
            </div>
            <div className="card">
                <Check id="ex-health" label={<strong>{t('export.health')}</strong>} hint={t('export.healthHint')}
                       checked={health} onChange={setHealth}/>
            </div>
        </Screen>
    );
}
