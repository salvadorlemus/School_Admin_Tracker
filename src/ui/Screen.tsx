import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {recallScroll, rememberScroll, useRouter} from '../lib/router';
import {t, type TextKey} from '../lib/texts';
import {Icon, type IconName} from './Icon';
import {MenuText} from './Fields';
import {SchoolLogo} from '../screens/shared/pieces';
import {useSheetRoute} from './Layers';
import {NoticesSheet} from '../screens/shared/NoticesSheet';
import {CardSheet} from '../screens/shared/CardSheet';
import {PROOFS, REVIEWED, SCHOOLS, STAFF_ME, TEACHERS, teacherSchools, unreadNotices, isPass} from '../mock/data';
import {platformBillingPaused} from '../mock/admin';
import {setCurrentSchool, useCurrentSchool} from '../state/school';

export type Role = 's' | 'g' | 't' | 'd' | 'a';

interface NavItem {
    label: TextKey;
    path: string;
    icon: IconName;
    badge?: number;
}

const NAVS: Record<Role, NavItem[]> = {
    s: [
        {label: 'nav.home', path: '/s/home', icon: 'home'},
        {label: 'nav.classes', path: '/s/classes', icon: 'calendar'},
        {label: 'nav.payments', path: '/s/payments', icon: 'pay'},
        {label: 'nav.account', path: '/s/account', icon: 'user'},
    ],
    g: [
        {label: 'nav.home', path: '/g/home', icon: 'home'},
        {label: 'nav.classes', path: '/g/classes', icon: 'calendar'},
        {label: 'nav.payments', path: '/g/payments', icon: 'pay'},
        {label: 'nav.account', path: '/g/account', icon: 'user'},
    ],
    t: [
        {label: 'nav.schedule', path: '/t/schedule', icon: 'calendar'},
        {label: 'nav.students', path: '/t/students', icon: 'people'},
        {label: 'nav.payments', path: '/t/payments', icon: 'pay'},
        {label: 'nav.account', path: '/t/account', icon: 'user'},
    ],
    d: [
        {label: 'nav.dashboard', path: '/d/home', icon: 'home'},
        {label: 'nav.calendar', path: '/d/calendar', icon: 'calendar'},
        {label: 'nav.payments', path: '/d/payments', icon: 'pay', badge: 3},
        {label: 'nav.students', path: '/d/students', icon: 'people'},
        {label: 'nav.more', path: '/d/more', icon: 'more'},
    ],
    a: [
        {label: 'nav.schools', path: '/a/schools', icon: 'school'},
        {label: 'nav.payments', path: '/a/payments', icon: 'pay'},
        {label: 'nav.log', path: '/a/log', icon: 'log'},
        {label: 'nav.account', path: '/a/account', icon: 'user'},
    ],
};

export function roleOf(path: string): Role {
    const prefix = path.split('/')[1];
    return (['s', 'g', 't', 'd', 'a'] as const).find(role => role === prefix) ?? 's';
}

export {STAFF_ME};

/**
 * Every signed-in screen: a top bar (back arrow, title, and the buttons that stay in view: the
 * school switch for staff in several schools, the card, the notices), one scroll area that takes
 * all the room between the bars, the bottom texts and main action (always visible), and the
 * bottom bar. The scroll area remembers where it was for the back button.
 */
export function Screen({title, subtitle, titleLine, back, onBack, nav = true, footer, note, children, topActions, fixedList}: {
    title: string;
    /** A pick that changes the whole screen, kept under the title like the staff's school line (the student's school). */
    titleLine?: ReactNode;
    /** One line, or several (the dashboard's school, then the date). */
    subtitle?: string | string[];
    /** Shows a back arrow; the path is where it goes when there's no previous page. */
    back?: string;
    /** Where back goes when it isn't the previous page (a finished flow going home). */
    onBack?: () => void;
    nav?: boolean;
    footer?: ReactNode;
    /** A short text that must always be seen; it sits above the bottom bar, never under the scroll. */
    note?: ReactNode;
    children: ReactNode;
    topActions?: ReactNode;
    /**
     * The screen doesn't scroll: its fields stay at the top and the `.list-fill` box below them takes
     * the room left, scrolling on its own and ending above the bottom bar (long lists of people).
     */
    fixedList?: boolean;
}) {
    const router = useRouter();
    const role = roleOf(router.path);
    const items = NAVS[role];
    const isTab = items.some(item => item.path === router.path);
    const scroll = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);
    const notices = useSheetRoute('notices');
    const card = useSheetRoute('card');
    const school = useCurrentSchool();
    // A main tab opened from a button on another screen (a dashboard to-do, a "see payments" link)
    // gets a back arrow to it; opened from the bottom bar, it has none.
    const fromPath = router.from?.split('?')[0];
    const backTo = back ?? (fromPath && fromPath !== router.path && fromPath.startsWith(`/${role}/`) ? fromPath : undefined);

    // Only on arriving at the screen: a popup opening on top of it doesn't move it.
    useLayoutEffect(() => {
        const element = fixedList ? scroll.current?.querySelector<HTMLElement>('.list-fill') : scroll.current;
        if (!element) return;
        element.scrollTop = recallScroll(router.key, router.path, isTab);
        setScrolled(element.scrollTop > 0);
    }, []);

    // The card and the notices stay on the main tabs; list screens opened from them keep the
    // notices; forms, done screens and a person's detail (nav off) keep the room for their title.
    const showCard = role !== 'a' && isTab;
    const showNotices = role !== 'a' && (isTab || nav);
    const staff = role === 't' || role === 'd';
    const me = staff ? TEACHERS.find(teacher => teacher.id === STAFF_ME[role]) ?? TEACHERS[0] : null;
    // A director switches between the schools they direct (and teach at); a teacher, the ones they teach at.
    const mySchools = me ? [...new Set([...(role === 'd' ? me.directs ?? [] : []), ...teacherSchools(me)])] : [];
    // Signing in as someone else: back to one of their own schools.
    useLayoutEffect(() => {
        if (mySchools.length && !mySchools.includes(school)) setCurrentSchool(mySchools[0]);
    }, [mySchools.join(), school]);
    const unread = unreadNotices(role);
    // Account isn't about a school: no switch there.
    const switching = mySchools.length > 1 && isTab && !router.path.endsWith('/account');
    const lines = Array.isArray(subtitle) ? subtitle : subtitle ? [subtitle] : [];

    return (
        <div className={nav ? 'screen' : 'screen screen-no-bottom'}>
            <header className="topbar" data-scrolled={scrolled}>
                {backTo && (
                    <button type="button" className="icon-btn" aria-label={t('common.back')}
                            onClick={() => onBack ? onBack() : router.back(backTo)}>
                        <Icon name="back"/>
                    </button>
                )}
                <div className="topbar-title">
                    <h1>{title}</h1>
                    {/* Staff in several schools: the line under the title names the school and switches it. */}
                    {switching && (
                        <span className="title-school">
                            <SchoolLogo school={school}/>
                            <MenuText id="top-school" label={t('top.pickSchool')} value={school} onChange={id => setCurrentSchool(id)}
                                      options={mySchools.map(id => ({value: id, label: SCHOOLS[id].name}))}/>
                        </span>
                    )}
                    {titleLine}
                    {lines.filter(line => !(switching && line === SCHOOLS[school].name)).map(line => <span key={line}>{line}</span>)}
                </div>
                <div className="topbar-actions">
                    {topActions}
                    {/* Register a student: on the director's main tabs, like the school switch, so detail screens keep room for their title. */}
                    {role === 'd' && isTab && (
                        <button type="button" className="icon-btn" aria-label={t('dstu.register')}
                                disabled={platformBillingPaused(school)}
                                title={platformBillingPaused(school) ? t('billing.growthPaused') : undefined}
                                onClick={() => router.navigate('/d/register')}>
                            <Icon name="userPlus"/>
                        </button>
                    )}
                    {showCard && (
                        <button type="button" className="icon-btn"
                                aria-label={t(role === 'g' ? 'top.cardsGuardian' : role === 't' || role === 'd' ? 'staff.myCard' : 'top.card')}
                                onClick={() => card.show()}>
                            <Icon name="card"/>
                        </button>
                    )}
                    {showNotices && (
                        <button type="button" className="icon-btn"
                                aria-label={unread ? t('top.noticesUnread', {count: unread}) : t('top.notices')}
                                onClick={() => notices.show()}>
                            <Icon name="bell"/>
                            {unread > 0 && <span className="badge" aria-hidden="true">{unread}</span>}
                        </button>
                    )}
                </div>
            </header>
            <div ref={scroll} className={fixedList ? 'scroll scroll-fixed' : 'scroll'} onScrollCapture={event => {
                const target = event.target as HTMLElement;
                if (fixedList ? !target.classList.contains('list-fill') : target !== event.currentTarget) return;
                rememberScroll(router.key, router.path, target.scrollTop);
                setScrolled(target.scrollTop > 0);
            }}>
                {children}
            </div>
            {(footer || note) && (
                <div className="footer">
                    {note && <p className="hint center">{note}</p>}
                    {footer}
                </div>
            )}
            {nav && (
                <nav className="nav" aria-label={t('nav.label')}>
                    {items.map(item => {
                        const current = router.path === item.path || router.path.startsWith(`${item.path}/`);
                        const badge = item.path === '/d/payments'
                            ? PROOFS.filter(proof => proof.school === school && proof.state === 'uploaded' && !isPass(proof.method) && !REVIEWED.has(proof.id)).length || undefined
                            : item.badge;
                        return (
                            <button key={item.path} type="button" aria-current={current ? 'page' : undefined}
                                    onClick={() => router.path !== item.path && router.navigate(item.path, {tab: true})}>
                                <Icon name={item.icon}/>
                                {badge && <span className="badge" aria-hidden="true">{badge}</span>}
                                {t(item.label)}
                                {badge &&
                                    <span className="sr-only">{t('nav.toReview', {count: badge})}</span>}
                            </button>
                        );
                    })}
                </nav>
            )}
            {showNotices && <NoticesSheet role={role} open={notices.open} onClose={notices.close} keepNav={nav}/>}
            {showCard && <CardSheet role={role} open={card.open} onClose={card.close}/>}
        </div>
    );
}

/** A screen with no bars at all (sign in, registration, the QR). */
export function BareScreen({children, footer, note}: { children: ReactNode; footer?: ReactNode; note?: ReactNode }) {
    return (
        <div className="screen screen-no-bottom">
            <div className="scroll scroll-bare-top" >{children}</div>
            {(footer || note) && (
                <div className="footer">
                    {note && <p className="hint center">{note}</p>}
                    {footer}
                </div>
            )}
        </div>
    );
}
