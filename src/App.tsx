import {leaveForOwnHost} from './lib/hosts';
import {useEffect, useState} from 'react';
import {LIVE, useLiveVersion} from './live/state';
import {homePath, restoreSession} from './live/session';
import {onLiveError} from './live/actions';
import {t} from './lib/texts';
import {useCurrentSchool} from './state/school';
import type {ComponentType} from 'react';
import {InsightScreen} from './screens/director/Insights';
import {PaySettings, TeacherPaymentForm, TeacherPayouts, TeacherPayScreen} from './screens/director/TeacherPay';
import {matchPath, useRouter} from './lib/router';
import {Device} from './ui/Layers';
import {
    DeleteLink, InviteCard, InviteChild, InviteDone, InviteFamily, InviteLanding, InviteTeacherCard,
    SchoolDisabled, SignIn, JoinWithLink, TermsReader,
} from './screens/entry/Entry';
import {
    Account,
    CardEdit,
    CheckIn,
    CheckInResult,
    DeleteSent,
    Home,
    Payments,
    Profile,
    Upload
} from './screens/student/Student';
import {ClassDetail, ClassDone, Classes} from './screens/student/Classes';
import {
    AddAttendance, PostNotice, QrScreen, Schedule, SessionScreen, StaffCardEdit, StudentCard, Students,
    TeacherAccount, TeacherPayments,
} from './screens/teacher/Teacher';
import {
    ActivityForm,
    Calendar,
    CancelSession, ClassEnded, EndClass, MoveSession,
    Dashboard,
    Setup,
    DirectorPayments,
    Review,
    Substitute
} from './screens/director/DirectorMain';
import {
    DeleteStudent,
    DirectorStudent,
    DirectorStudents,
    Export,
    More,
    Prices, PackageForm,
    Reassign,
    Register,
    RegisterSent,
    Rooms, RoomScreen,
    TeacherDetail,
    Teachers,
    Terms,
} from './screens/director/DirectorPeople';
import {AdminAccount, AdminLog, AdminPaymentNew, AdminPayments, AdminSchool, AdminSchoolDelete, AdminSchoolEdit, SchoolCreated, SchoolNew, Schools} from './screens/admin/Admin';

type Params = Record<string, string>;
type Route = [string, ComponentType<Params>];

/** Every screen of the prototype, by path. /s student, /g guardian, /t teacher, /d director, /a admin. */
const ROUTES: Route[] = [
    ['/', SignIn],
    ['/invite', () => <InviteLanding kind="adult"/>],
    ['/invite/card', InviteCard],
    ['/invite/terms', () => <TermsReader mode="invite"/>],
    ['/invite/done', () => <InviteDone kind="adult"/>],
    ['/invite/minor', () => <InviteLanding kind="minor"/>],
    ['/invite/minor/family', InviteFamily],
    ['/invite/minor/child/:id', ({id}) => <InviteChild id={id}/>],
    ['/invite/minor/terms', () => <TermsReader mode="invite-minor"/>],
    ['/invite/minor/done', () => <InviteDone kind="minor"/>],
    ['/invite/teacher', () => <InviteLanding kind="teacher"/>],
    ['/invite/teacher/card', () => <InviteTeacherCard/>],
    ['/invite/teacher/done', () => <InviteDone kind="teacher"/>],
    ['/invite/director', () => <InviteLanding kind="director"/>],
    ['/invite/director/card', () => <InviteTeacherCard kind="director"/>],
    ['/invite/director/done', () => <InviteDone kind="director"/>],
    ['/terms-new', () => <TermsReader mode="new"/>],
    ['/disabled', SchoolDisabled],
    ['/delete-link', DeleteLink],

    ...(['s', 'g'] as const).flatMap((role): Route[] => [
        [`/${role}/home`, Home],
        [`/${role}/checkin`, CheckIn],
        [`/${role}/checkin/scan`, CheckIn],
        [`/${role}/checkin/result`, CheckInResult],
        [`/${role}/classes`, Classes],
        [`/${role}/classes/done`, ClassDone],
        [`/${role}/classes/:id`, ({id}) => <ClassDetail id={id}/>],
        [`/${role}/payments`, Payments],
        [`/${role}/upload`, Upload],
        [`/${role}/card/:id`, ({id}) => <CardEdit id={id}/>],
        [`/${role}/account`, Account],
        [`/${role}/delete-sent`, DeleteSent],
    ]),

    ['/g/profile', Profile],

    ...(['t', 'd'] as const).flatMap((role): Route[] => [
        [`/${role}/session/:id`, ({id}) => <SessionScreen id={id}/>],
        [`/${role}/session/:id/add`, ({id}) => <AddAttendance id={id}/>],
        [`/${role}/qr/:id`, ({id}) => <QrScreen id={id}/>],
        [`/${role}/account`, TeacherAccount],
        [`/${role}/my-card`, StaffCardEdit],
        [`/${role}/notices/new`, PostNotice],
    ]),
    ['/t/schedule', Schedule],
    ['/t/students', Students],
    ['/t/student/:id', ({id}) => <StudentCard id={id}/>],
    ['/t/payments', TeacherPayments],
    // A director who teaches: the teacher's students and attendance, from Más.
    ['/d/my-students', Students],
    ['/d/my-payments', TeacherPayments],

    ['/d/home', Dashboard],
    ['/d/setup', Setup],
    ['/d/insights/:id', ({id}) => <InsightScreen id={id}/>],
    ['/d/calendar', Calendar],
    ['/d/activity/:id', ({id}) => <ActivityForm id={id}/>],
    ['/d/activity/:id/end', ({id}) => <EndClass id={id}/>],
    ['/d/activity/:id/ended', ({id}) => <ClassEnded id={id}/>],
    ['/d/move/:id', ({id}) => <MoveSession id={id}/>],
    ['/d/cancel/:id', ({id}) => <CancelSession id={id}/>],
    ['/d/substitute/:id', ({id}) => <Substitute id={id}/>],
    ['/d/payments', DirectorPayments],
    ['/d/payments/review/:id', ({id}) => <Review id={id}/>],
    ['/d/students', DirectorStudents],
    ['/d/students/:id', ({id}) => <DirectorStudent id={id}/>],
    ['/d/students/:id/delete', ({id}) => <DeleteStudent id={id}/>],
    ['/d/register', Register],
    ['/d/register/sent', RegisterSent],
    ['/d/more', More],
    ['/d/rooms', Rooms],
    ['/d/rooms/:id', ({id}) => <RoomScreen id={id}/>],
    ['/d/teachers', Teachers],
    ['/d/teachers/:id', ({id}) => <TeacherDetail id={id}/>],
    ['/d/teachers/:id/reassign', ({id}) => <Reassign id={id}/>],
    ['/d/teachers/:id/pay', ({id}) => <TeacherPayScreen id={id}/>],
    ['/d/teachers/:id/pay/record', ({id}) => <TeacherPaymentForm id={id}/>],
    ['/d/teacher-payments', TeacherPayouts],
    ['/d/teacher-pay', PaySettings],
    ['/d/prices', Prices],
    ['/d/package/:id', ({id}) => <PackageForm id={id}/>],
    ['/d/terms', Terms],
    ['/d/export', Export],

    ['/a/schools', Schools],
    ['/a/schools/new', SchoolNew],
    ['/a/schools/created', SchoolCreated],
    ['/a/schools/:id', ({id}) => <AdminSchool id={id}/>],
    ['/a/schools/:id/edit', ({id}) => <AdminSchoolEdit id={id}/>],
    ['/a/schools/:id/delete', ({id}) => <AdminSchoolDelete id={id}/>],
    ['/a/payments', AdminPayments],
    ['/a/payments/new', AdminPaymentNew],
    ['/a/log', AdminLog],
    ['/a/account', AdminAccount],
    ['/invite/:token', ({token}) => <JoinWithLink token={token}/>],
];

/** Opening the page: a saved session loads the real data first; otherwise the sign-in screen. */
let booted: Promise<boolean> | null = null;

export default function App() {
    const router = useRouter();
    const {path} = router;
    const version = useLiveVersion();
    const [ready, setReady] = useState(booted !== null && LIVE.on);
    const [problem, setProblem] = useState('');
    useEffect(() => {
        const stop = onLiveError(message => setProblem(message));
        return () => {
            stop();
        };
    }, []);
    useEffect(() => {
        booted ??= restoreSession().catch(() => false);
        void booted.then(on => {
            setReady(true);
            if (on && path === '/') router.replace(homePath());
        });
    }, []);
    let found: { Screen: ComponentType<Params>; params: Params } | null = null;
    for (const [pattern, Screen] of ROUTES) {
        const params = matchPath(pattern, path);
        if (params) {
            found = {Screen, params};
            break;
        }
    }
    const {Screen, params} = found ?? {Screen: SignIn, params: {}};
    // The admin panel and the app each live on their own address.
    if (leaveForOwnHost(path)) return null;
    // Keyed by path (and the staff's school, and each reload of the live data): a new screen starts fresh, while a popup opening (?sheet=) keeps the screen as it is.
    const school = useCurrentSchool();
    if (!ready) return <Device><div className="boot" aria-busy="true">{t('app.name')}</div></Device>;
    return (
        <Device>
            <Screen key={`${path}@${school}#${version}`} {...params}/>
            {problem && (
                <div className="live-problem" role="alert">
                    <span>{t('live.refused', {reason: problem})}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProblem('')}>{t('common.close')}</button>
                </div>
            )}
        </Device>
    );
}
