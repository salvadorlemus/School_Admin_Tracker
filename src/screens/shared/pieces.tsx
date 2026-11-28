import type {ReactNode} from 'react';
import {t} from '../../lib/texts';
import {dayShort, initials, timeRange, weekdayShort} from '../../lib/format';
import {classById, FAMILY, isVacationDate, type ProofState, roomName, SCHOOL_LOGOS, type SchoolClass, type SchoolId, SCHOOLS, type Session, sessionById, type Student, type Teacher, teacherName, schoolOfSession} from '../../mock/data';
import {teacherOf} from '../../mock/changes';
import {Icon} from '../../ui/Icon';
import {relationText} from './labels';
import {Confetti, PhotoPicker, Avatar} from '../../ui/Fields';

/** Pieces several roles' screens share: a session card, a student card, state chips, the finished screen. */

export function SchoolChip({school}: { school: SchoolId }) {
    return <span className="chip chip-outline">{SCHOOLS[school].short}</span>;
}

export function ProofChip({state}: { state: ProofState }) {
    const css = {
        uploaded: 'chip chip-uploaded',
        confirmed: 'chip chip-confirmed',
        rejected: 'chip chip-rejected'
    }[state];
    return <span className={css}>{t(`proof.${state}` as const)}</span>;
}

/** A school's logo; until one is uploaded, a badge with its initials in the school's place. */
export function SchoolLogo({school, size = 'sm'}: { school: SchoolId; size?: 'sm' | 'md' }) {
    const logo = SCHOOL_LOGOS.get(school);
    return logo ? <img className={`school-logo school-logo-${size}`} src={logo} alt=""/>
        : <span className={`school-logo school-logo-${size}`} aria-hidden="true">{initials(SCHOOLS[school]?.short ?? school)}</span>;
}

export function TermsChip() {
    return <span className="chip chip-terms" title={t('chip.termsPendingFull')}>{t('chip.termsPending')}</span>;
}

/** A plan or package payment for the month not confirmed yet: short, with the full words for screen readers. */
export function UnpaidChip() {
    return <span className="chip chip-warning" title={t('students.unpaidFull')} aria-label={t('students.unpaidFull')}><Icon name="pay" size={12}/>{t('students.unpaid')}</span>;
}

/** What a session card shows inside, for carousels (which draw their own card) and plain cards. */
/** The calendar dots' meaning, drawn with the same dots. */
export function DotLegend() {
    return (
        <p className="legend small muted">
            <span><i data-kind="class"/>{t('legend.class')}</span>
            <span><i data-kind="substitute"/>{t('legend.substitute')}</span>
            <span><i data-kind="cancelled"/>{t('legend.cancelled')}</span>
            <span><i data-kind="vacation"/>{t('legend.vacation')}</span>
        </p>
    );
}

export function SessionBody({session, showDate, school, extra, hideClass}: {
    session: Session;
    showDate?: boolean;
    school?: SchoolId;
    extra?: ReactNode;
    /** Inside the class's own popup, where its name is the title. */
    hideClass?: boolean;
}) {
    const item = classById(session.classId);
    const cancelled = session.status === 'cancelled';
    const vacation = isVacationDate(schoolOfSession(session), session.date);
    const when = `${showDate ? `${dayShort(session.date)} · ` : ''}${timeRange(session.start, session.end)}`;
    const replacement = session.replacementId ? sessionById(session.replacementId) : null;
    return (
        <>
            <div className="row session-card-head">
                <span className="small num">{when}</span>
                <span className="wrap session-card-chips">
                    {school && <SchoolChip school={school}/>}
                </span>
            </div>
            {!hideClass && <span className={cancelled || vacation ? 'big strike' : 'big'}>{item.name}</span>}
            {(cancelled || vacation || session.substitute || session.replaces) && (
                <span className="wrap session-status-chips">
                    {cancelled && <span className="chip chip-cancelled">{t('chip.cancelled')}</span>}
                    {vacation && <span className="chip chip-vacation">{t('chip.vacation')}</span>}
                    {session.substitute && <span className="chip chip-substitute">{t('chip.substitute')}</span>}
                    {session.replaces && <span className="chip">{t('chip.replacement')}</span>}
                </span>
            )}
            <span className="small">
                {/* The Suplente chip says it's a substitute: the line just names who gives it. */}
                {teacherName(session.substitute ?? teacherOf(session))}
                {' · '}{roomName(session.room)}
            </span>
            {cancelled && replacement && (
                <span className="small">{t('session.replacementOn', {
                    when: `${dayShort(replacement.date)}, ${timeRange(replacement.start, replacement.end)}`,
                })}</span>
            )}
            {extra}
        </>
    );
}

/** A session as a card; a substitute or a cancellation shows in its colour. */
export function SessionCard({session, showDate, school, onClick, extra, hideClass}: {
    session: Session;
    showDate?: boolean;
    school?: SchoolId;
    onClick?: () => void;
    extra?: ReactNode;
    hideClass?: boolean;
}) {
    const css = isVacationDate(schoolOfSession(session), session.date) ? 'card card-vacation'
        : session.status === 'cancelled' ? 'card card-cancelled' : session.substitute ? 'card card-substitute' : 'card';
    const body = <SessionBody session={session} showDate={showDate} school={school} extra={extra} hideClass={hideClass}/>;
    return onClick
        ? <button type="button" className={css} onClick={onClick}>{body}</button>
        : <div className={css}>{body}</div>;
}

/** The people on a card: a minor's come from the guardian's family list, shared by siblings. */
export function cardPeople(student: Student) {
    if (!student.minor || !FAMILY.some(person => person.kids.includes(student.id))) {
        return {emergency: student.emergency, pickup: student.pickup};
    }
    const mine = FAMILY.filter(person => person.kids.includes(student.id));
    return {
        emergency: mine.filter(person => person.emergency && person.phone)
            .map(person => ({name: person.name, relation: person.relation, phone: person.phone ?? ''})),
        pickup: mine.filter(person => person.pickup).map(person => person.name),
    };
}

/**
 * Health conditions first, then emergency contacts with a call button each, then pickup people.
 * With `photo`, the photo is the button that changes it (camera badge on it).
 */
export function StudentCardView({student, compact, photo, onPhoto}: {
    student: Student;
    compact?: boolean;
    photo?: boolean;
    onPhoto?: (file: File) => void;
}) {
    const people = cardPeople(student);
    return (
        <div className="stack">
            {!compact && (
                <div className="row-start align-center" >
                    {photo
                        ? <PhotoPicker name={student.name} label={t('form.photo')} photo={student.photo} onPicked={(_, file) => onPhoto?.(file)}/>
                        : <Avatar large name={student.name} photo={student.photo}/>}
                    <div className="grow">
                        <span className="big">{student.name}</span>
                        <span
                            className="muted small">{t('card.age', {age: student.age})}{student.minor ? ` · ${t('card.minor')}` : ''}</span>
                        {student.guardian &&
                            <span className="muted small">{t('card.guardian', {name: student.guardian})}</span>}
                        {photo && <span className="hint">{t('form.photoHint')}</span>}
                    </div>
                </div>
            )}
            <div className={student.health ? 'banner banner-error' : 'banner'}>
                <span className="strong row-start"><Icon name="heart" size={18}/>{t('card.health')}</span>
                <span>{student.health ?? t('card.noHealth')}</span>
            </div>
            <h3 className="section-title">{t('card.emergency')}</h3>
            {people.emergency.length === 0
                ? <p className="empty">{t('card.noEmergency')}</p>
                : (
                    <ul className="list">
                        {people.emergency.map(contact => (
                            <li key={contact.phone} className="list-row">
                                <span className="grow">
                                    <span className="list-row-title">{contact.name}</span>
                                    <span className="list-row-sub">{relationText(contact.relation)} · <span
                                        className="num">{contact.phone}</span></span>
                                </span>
                                <a className="btn btn-secondary btn-sm" href={`tel:${contact.phone.replace(/\s/g, '')}`}
                                   aria-label={t('card.callName', {name: contact.name})}>
                                    <Icon name="phone" size={18}/>{t('card.call')}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            {people.pickup && (
                <>
                    <h3 className="section-title">{t('card.pickup')}</h3>
                    <ul className="list">
                        {people.pickup.map(name => (
                            <li key={name} className="list-row">
                                <span className="avatar" aria-hidden="true">{initials(name)}</span>
                                <span className="grow"><span className="list-row-title">{name}</span></span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

/** A finished step: the icon and message centred, with a short burst of confetti. */
export function DoneMessage({title, body, icon = 'check', confetti = true}: {
    title: string;
    body?: ReactNode;
    icon?: 'check' | 'heart';
    /** A finished step celebrates; ending something (a class) doesn't. */
    confetti?: boolean;
}) {
    return (
        <div className="done">
            {icon === 'check' && confetti && <Confetti/>}
            <span className="avatar avatar-lg avatar-ok">
                <Icon name={icon} size={40}/>
            </span>
            <p className="huge">{title}</p>
            {body && <div className="muted">{body}</div>}
        </div>
    );
}

/**
 * A person's details (name, phone, email), always in view under their own heading. On the person's
 * own card (`own`) they're edited with the rest of the card ("Editar tarjeta"); on someone else's,
 * the phone and email are links to call or write.
 */
export function DetailsCard({title, name, phone, email, own}: {
    title: string;
    name: string;
    phone: string;
    email: string;
    own?: boolean;
}) {
    return (
        <>
            <h3 className="section-title">{title}</h3>
            <div className="card">
                <dl className="dl">
                    <dt>{t('form.name')}</dt>
                    <dd>{name}</dd>
                    <dt>{t('form.phone')}</dt>
                    <dd className="num">{own ? phone : <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>}</dd>
                    <dt>{t('signIn.email')}</dt>
                    <dd>{own ? email : <a href={`mailto:${email}`}>{email}</a>}</dd>
                </dl>
                {own && <p className="hint">{t('card.detailsInEdit')}</p>}
            </div>
        </>
    );
}

/** A teacher's or director's card shown with the student card's view: health notes and emergency contacts. */
export function staffAsStudent(teacher: Teacher): Student {
    return {
        id: teacher.id, name: teacher.name, age: 0, plan: 'cash', planLabel: '', paymentDay: 30, status: 'active',
        health: teacher.health, emergency: teacher.emergency,
    };
}

/** "Mar 10:00 – 12:00 · Jue 10:00 – 12:00": when a weekly class meets. */
/** A class's days grouped by their hours, to tell apart classes with the same name: "Lun, Mié 18:00 – 20:00". */
export const classWhen = (item: SchoolClass) => {
    const groups = new Map<string, number[]>();
    for (const slot of item.slots) groups.set(timeRange(slot.start, slot.end), [...(groups.get(timeRange(slot.start, slot.end)) ?? []), slot.weekday]);
    return [...groups].map(([range, days]) => `${days.map(day => weekdayShort(day)).join(', ')} ${range}`).join(' · ');
};

export const classSlots = (item: SchoolClass) => item.slots.map(slot => `${weekdayShort(slot.weekday)} ${timeRange(slot.start, slot.end)}`).join(' · ');
