import {t} from '../../lib/texts';
import {dayMonth} from '../../lib/format';
import {
    classById, ENROLLMENTS, PACKAGES, roomName, SCHOOLS, schoolOfClass, SESSIONS, teacherName, TODAY,
} from '../../mock/data';
import {ENDED_ENROLLMENTS, endEnrollment} from '../../mock/changes';
import {Sheet, useConfirm, useToast} from '../../ui/Layers';
import {classSlots, SessionCard} from '../shared/pieces';

const packageName = (id: string) => t(id === 'pk3' ? 'payments.package3' : 'payments.package2');

/**
 * One of the student's classes or their package, as a popup (like the board, it ends above the
 * bottom bar): when and where it meets, the teacher, how they pay and since when, its next sessions,
 * and leaving it. Opened from Inicio (a session's class) and from Clases (their list). A class their
 * package covers is left by leaving the package, so it only says so.
 */
export function ClassSheet({id, student, open, onClose}: {
    /** A class id, or a package id. */
    id: string | null;
    student: string;
    open: boolean;
    onClose: () => void;
}) {
    const confirm = useConfirm();
    const toast = useToast();
    const pack = PACKAGES.find(item => item.id === id);
    const item = !pack && id ? classById(id) : null;
    const mine = ENROLLMENTS.filter(entry => entry.student === student);
    const direct = mine.find(entry => (pack ? entry.packageId === pack.id : entry.classId === item?.id));
    const viaPackage = item && !direct ? mine.find(entry => entry.packageId
        && PACKAGES.find(other => other.id === entry.packageId)?.classes.includes(item.id)) : undefined;
    const enrollment = direct ?? viaPackage;
    // Leaving keeps them until the end of the month paid; a class they left says until when.
    const until = '2026-11-30';
    const ends = direct ? ENDED_ENROLLMENTS.get(`${student}:${direct.id}`) : undefined;
    const next = item ? SESSIONS.filter(session => session.classId === item.id && session.date > TODAY && (!ends || session.date <= ends)).slice(0, 3) : [];
    const last = item ? SESSIONS.filter(session => session.classId === item.id && session.status === 'scheduled' && session.date >= TODAY && session.date <= until).pop() : undefined;
    const title = pack ? packageName(pack.id) : item?.name ?? '';

    const leave = async () => {
        if (await confirm({
            title: t('classes.leaveTitle', {name: title}),
            body: pack || last ? t('classes.leaveBody', {when: dayMonth(until), last: last ? dayMonth(last.date) : dayMonth(until)}) : t('classes.leaveBodyNone', {when: dayMonth(until)}),
            confirm: t('classes.leave'),
            danger: true,
        })) {
            if (direct) endEnrollment(student, direct.id, until, true);
            toast(t('classes.left'));
            onClose();
        }
    };

    return (
        <Sheet open={open && Boolean(pack || item)} onClose={onClose} title={title} keepNav
               subtitle={item ? SCHOOLS[schoolOfClass(item)].name : pack ? SCHOOLS.colibri.name : undefined}
               footer={direct && !ends ? <button type="button" className="btn btn-secondary"
                                        onClick={leave}>{t('classes.leave')}</button> : undefined}>
            <dl className="dl">
                {item && (
                    <>
                        <dt>{t('classes.when')}</dt>
                        <dd>{classSlots(item)}</dd>
                        <dt>{t('classSheet.teacher')}</dt>
                        <dd>{teacherName(item.teacher)}</dd>
                        <dt>{t('classSheet.room')}</dt>
                        <dd>{roomName(item.slots[0]?.room ?? '')}</dd>
                    </>
                )}
                {pack && (
                    <>
                        <dt>{t('classSheet.covers')}</dt>
                        <dd>{pack.classes.map(classId => classById(classId).name).join(' · ')}</dd>
                        <dt>{t('classSheet.allows')}</dt>
                        <dd>{t('classSheet.perWeek', {n: pack.perWeek})}</dd>
                    </>
                )}
                {enrollment && (
                    <>
                        {!pack && (
                            <>
                                <dt>{t('classes.pays')}</dt>
                                <dd>{enrollment.packageId ? packageName(enrollment.packageId)
                                    : t(enrollment.how === 'monthly' ? 'enroll.monthly' : 'enroll.visit')}</dd>
                            </>
                        )}
                        <dt>{t('classes.since')}</dt>
                        <dd>{dayMonth(enrollment.from)}</dd>
                    </>
                )}
            </dl>
            {next.length > 0 && (
                <>
                    <h3 className="section-title">{t('classSheet.next')}</h3>
                    {next.map(session => <SessionCard key={session.id} session={session} showDate hideClass/>)}
                </>
            )}
            {(ends || !direct) && <p className="hint">{ends ? t('classes.leftUntil', {when: dayMonth(ends)}) : t('classSheet.leavePackage')}</p>}
        </Sheet>
    );
}
