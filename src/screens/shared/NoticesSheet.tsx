import {useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, listOf, shortName} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {BOARD_READERS, boardFor, classById, classesOf, PERSONAL, SCHOOLS, SOFIA_SCHOOLS, studentById, teacherName, type Notice, type SchoolId, GUARDIAN_SCHOOLS} from '../../mock/data';
import {Sheet} from '../../ui/Layers';
import {Icon} from '../../ui/Icon';
import {MenuText} from '../../ui/Fields';
import type {Role} from '../../ui/Screen';
import {useCurrentSchool} from '../../state/school';
import {noticeTitle, noticeVars} from './labels';
import {classSlots, SchoolLogo} from './pieces';
import {payReminders} from '../../mock/pay';

/**
 * The notices popup, opened from the bell at the top of every screen: personal notices first
 * (unread marked), then the board: only the posts for the whole school and for the person's classes
 * (a guardian's children's, a teacher's own; directors see all). It says whose board it is: staff see the school they're working
 * in (and post there), a student in two schools sees each school's board under its name. The line
 * about what's posted by itself stays at the bottom, with the post button for staff.
 */
export function NoticesSheet({role, open, onClose, keepNav}: {
    role: Role;
    open: boolean;
    onClose: () => void;
    keepNav?: boolean
}) {
    const router = useRouter();
    const current = useCurrentSchool();
    // A student in many schools can keep to one school's board.
    const [only, setOnly] = useState('all');
    const [limit, setLimit] = useState(10);
    if (role === 'a') return null;
    const personal = [...(role === 'd' ? payReminders(current) : []), ...PERSONAL[role].filter(item => role === 's' || role === 'g' || item.school === current)].sort((a, b) => Number(Boolean(b.unread)) - Number(Boolean(a.unread)));
    // Students see all their schools' boards; guardians their children's school; staff the school they're working in.
    const schools: SchoolId[] = role === 's' ? SOFIA_SCHOOLS : role === 'g' ? GUARDIAN_SCHOOLS : [current];
    const canPost = role === 't' || role === 'd';
    const several = schools.length > 1;
    const readers = BOARD_READERS[role] ?? [];
    // A guardian's class posts say which children they're for (a student only sees their own, so needs no mark).
    const mineLabel = (notice: Notice) => {
        if (!notice.classId || role !== 'g') return undefined;
        const who = readers.filter(id => classesOf(id).includes(notice.classId ?? ''));
        if (who.length === 0) return undefined;
        const names = who.map(id => studentById(id).name.split(' ')[0]);
        return names.length > 3 ? t('notices.classOfMore', {names: listOf(names.slice(0, 2)), n: names.length - 2})
            : t('notices.classOf', {names: listOf(names)});
    };

    return (
        <Sheet open={open} onClose={onClose} title={t('notices.title')} tall keepNav={keepNav}
               subtitle={several ? t('notices.schools', {n: schools.length}) : SCHOOLS[schools[0]].name}
               footer={<>
                   <p className="hint center">{t(canPost ? 'notices.lifeHint' : 'notices.boardHint')}</p>
                   {canPost && (
                       <button type="button" className="btn btn-lg"
                               onClick={() => router.navigate(`/${role}/notices/new`)}>
                           <Icon name="plus"/>{t('notices.postIn', {school: SCHOOLS[current].short})}
                       </button>
                   )}
               </>}>
            <h3 className="section-title">{t('notices.forYou')}</h3>
            <ul className="list">
                {personal.map(item => (
                    <li key={item.id} className="list-row">
                        <span className="grow">
                            <span className={item.unread ? 'strong' : undefined}>{t(item.text, noticeVars(item.vars))}</span>
                            <span
                                className="list-row-sub">{dayMonth(item.date)}{several ? ` · ${SCHOOLS[item.school].short}` : ''}</span>
                        </span>
                        {item.unread && <span className="chip chip-outline">{t('notices.new')}</span>}
                    </li>
                ))}
            </ul>
            {schools.length > 2 && (
                <h3 className="section-title heading-pick">
                    {only !== 'all' && <SchoolLogo school={only}/>}
                    {t('notices.boardOfPick')}
                    <MenuText id="notices-school" label={t('notices.whichBoard')} value={only} onChange={setOnly}
                              options={[{value: 'all', label: t('notices.allBoards', {n: schools.length})}, ...schools.map(id => ({value: id, label: SCHOOLS[id].name}))]}/>
                </h3>
            )}
            {schools.filter(school => only === 'all' || school === only).map(school => (
                <section key={school} className="stack">
                    {!(schools.length > 2 && only !== 'all') && <h3 className="section-title heading-pick"><SchoolLogo school={school}/><span className="one-line">{t('notices.boardOf', {school: SCHOOLS[school].name})}</span></h3>}
                    {boardFor(role, school).slice(0, only === 'all' && schools.length > 2 ? 3 : limit).map(notice => (
                        <BoardPost key={notice.id} notice={notice} mine={mineLabel(notice)}/>
                    ))}
                    {!(only === 'all' && schools.length > 2) && boardFor(role, school).length > limit && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit(limit + 10)}>
                            {t('notices.more', {n: Math.min(10, boardFor(role, school).length - limit)})}
                        </button>
                    )}
                    {only === 'all' && schools.length > 2 && boardFor(role, school).length > 3 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOnly(school)}>
                            {t('notices.seeBoard', {n: boardFor(role, school).length, school: SCHOOLS[school].short})}
                        </button>
                    )}
                </section>
            ))}
        </Sheet>
    );
}

/**
 * One post. A class post shows the class's teacher, days and times under its title, so two classes
 * with the same name can't be mistaken for each other; `mine` marks it as the reader's class.
 */
export function BoardPost({notice, showSchool, mine}: { notice: Notice; showSchool?: boolean; mine?: string }) {
    const css = notice.kind === 'price' ? 'card card-important'
        : notice.kind === 'substitute' ? 'card card-substitute' : 'card';
    const chip = {
        price: <span className="chip chip-important"><Icon name="star" size={12}/>{t('notices.important')}</span>,
        substitute: <span className="chip chip-substitute">{t('chip.substitute')}</span>,
        cancelled: <span className="chip chip-cancelled">{t('chip.cancelled')}</span>,
        schedule: <span className="chip">{t('notices.scheduleChange')}</span>,
        ended: <span className="chip chip-cancelled">{t('notices.ended')}</span>,
        teacher: <span className="chip">{t('notices.teacherChange')}</span>,
        note: <span className="chip chip-outline">{t('notices.noteBy', {name: shortName(notice.author ?? '')})}</span>,
    }[notice.kind];
    const item = notice.classId ? classById(notice.classId) : undefined;
    const everyone = !item && notice.kind === 'note';
    return (
        <article className={css}>
            <div className="row">
                <span
                    className="small muted">{dayMonth(notice.date)}{showSchool ? ` · ${SCHOOLS[notice.school].short}` : ''}</span>
                {notice.unread && <span className="chip chip-outline">{t('notices.new')}</span>}
            </div>
            <span className="strong">{noticeTitle(notice)}</span>
            {item && <span
                className="small muted">{[teacherName(item.teacher), classSlots(item)].filter(Boolean).join(' · ')}</span>}
            <p className="small">{notice.text ? t(notice.text, noticeVars(notice.vars)) : notice.body}</p>
            <span className="wrap">
                {mine && <span className="chip chip-confirmed">{mine}</span>}
                {everyone && <span className="chip">{t('post.everyone')}</span>}
                {chip}
            </span>
        </article>
    );
}
