import {num, rows, type Row, str} from './query';
import {money} from '../lib/format';
import {DEFAULT_ZONE, localParts} from '../lib/zone';
import {BOARD, CLASSES, ENROLLMENTS, HISTORY, PACKAGES, PERSONAL, PRICES, PROOFS, ROOMS, SCHOOLS, SESSIONS, STAFF_ME, TEACHERS, VACATION_DAYS, setClock, type Enrollment, type Notice, type Package, type Personal, type PlanKind, type Price, type Proof, type Room, type SchoolClass, type Session, type Student, type Teacher, ME, GUARDIAN_KIDS, GUARDIAN_SCHOOLS, SOFIA_SCHOOLS, BOARD_READERS} from '../mock/data';
import type {Attendance} from '../mock/helios';
import {PAY_RULES, setTeacherPayments, type TeacherPayment} from '../mock/pay';
import {setLiveTerms} from '../mock/changes';
import {currentSchool, setCurrentSchool} from '../state/school';
import {LIVE, LIVE_STUDENTS, liveChanged, LIVE_FEES} from './state';
import type {TextKey} from '../lib/texts';

/**
 * Loads what the signed-in person may see (the database's policies decide) into the shapes the
 * screens read. Each call replaces everything, so after a change the screens show the database's state.
 */



const local = localParts;

/** A note's first sentence as its title, cut at a word under 80 characters. */
const shortTitle = (body: string) => {
    const first = body.split(/(?<=[.:!?])\s/)[0];
    return first.length <= 80 ? first : `${first.slice(0, 80).replace(/\s+\S*$/, '')}…`;
};

const replace = <T, >(list: T[], items: T[]) => list.splice(0, list.length, ...items);

export async function loadLive(): Promise<void> {
    const me = LIVE.person;
    const [schools, memberships, persons, rooms, classes, schedules, offers, offerClasses, prices, enrollments, packages, cards, contacts, links,
        fees, terms, acceptances, proofs, announcements, vacations, notifications, rules, tiers, rates, payments, staffContacts, staffCards, family, familyKids] = await Promise.all([
        rows('school'), rows('membership'), rows('person', 'id, full_name, phone'), rows('room'), rows('class'), rows('schedule'),
        rows('package_offer'), rows('package_offer_class'), rows('price'), rows('enrollment'), rows('student_package'), rows('student_card'),
        rows('emergency_contact'), rows('guardian_link'), rows('registration_fee'), rows('terms'), rows('terms_acceptance'),
        rows('payment_proof'), rows('announcement'), rows('school_vacation'), rows('notification', '*', q => q.order('created_at', {ascending: false}).limit(100)),
        rows('teacher_pay_rule'), rows('teacher_pay_tier'), rows('teacher_pay_rate'), rows('teacher_payment'), rows('staff_emergency_contact'), rows('staff_card'),
        rows('family_person'), rows('family_person_child'),
    ]);
    const since = new Date(Date.now() - 70 * 86400000).toISOString();
    const until = new Date(Date.now() + 75 * 86400000).toISOString();
    const [sessions, attendance, bookings] = await Promise.all([
        rows('session', '*', q => q.gte('starts_at', since).lte('starts_at', until)),
        rows('attendance', '*', q => q.gte('created_at', since)),
        rows('booking'),
    ]);

    const zoneOf = new Map(schools.map(s => [str(s.id), str(s.time_zone) || DEFAULT_ZONE]));
    const nameOf = new Map(persons.map(p => [str(p.id), str(p.full_name)]));
    const mine = memberships.filter(m => m.person_id === me);

    // ---- The clock and the school picked at the top ----
    const firstSchool = str(mine.find(m => m.role === 'director' || m.role === 'teacher')?.school_id ?? mine[0]?.school_id ?? schools[0]?.id);
    const zone = zoneOf.get(firstSchool) ?? DEFAULT_ZONE;
    const now = local(new Date().toISOString(), zone);
    setClock(now.date, now.time);
    const today = now.date;
    if (!schools.some(s => s.id === currentSchool())) setCurrentSchool(firstSchool);

    // ---- Schools, rooms, teachers ----
    for (const key of Object.keys(SCHOOLS)) delete SCHOOLS[key];
    for (const s of schools) SCHOOLS[str(s.id)] = {name: str(s.name), short: str(s.name), zone: str(s.time_zone) || DEFAULT_ZONE};

    const futureByRoom = new Map<string, number>();
    const futureByTeacher = new Map<string, number>();
    for (const s of sessions) {
        if (s.status !== 'scheduled' || str(s.starts_at) < new Date().toISOString()) continue;
        futureByRoom.set(str(s.room_id), (futureByRoom.get(str(s.room_id)) ?? 0) + 1);
        const giver = str(s.substitute_id || s.teacher_id);
        futureByTeacher.set(giver, (futureByTeacher.get(giver) ?? 0) + 1);
    }
    replace<Room>(ROOMS, rooms.map(r => ({
        id: str(r.id),
        school: str(r.school_id),
        name: str(r.name),
        classesAtOnce: r.classes_at_once ? num(r.classes_at_once) : undefined,
        students: r.max_students ? num(r.max_students) : undefined,
        archived: Boolean(r.archived_at),
        futureSessions: futureByRoom.get(str(r.id)) ?? 0,
    })));

    const staff = new Map<string, Teacher>();
    for (const m of memberships.filter(x => x.role === 'teacher' || x.role === 'director')) {
        const id = str(m.person_id);
        const teacher = staff.get(id) ?? {
            id,
            schools: [],
            directs: [],
            name: nameOf.get(id) ?? '',
            email: id === me ? LIVE.email : '',
            phone: str(persons.find(p => p.id === id)?.phone),
            status: 'active' as const,
            futureSessions: futureByTeacher.get(id) ?? 0,
            photo: str(staffCards.find(c => c.person_id === id)?.photo_path) || undefined,
            emergency: staffContacts.filter(c => c.person_id === id).map(c => ({
                name: str(c.name),
                relation: str(c.relation),
                phone: str(c.phone)
            })),
        };
        if (m.role === 'teacher') teacher.schools = [...(teacher.schools ?? []), str(m.school_id)];
        if (m.role === 'director') {
            teacher.directs = [...(teacher.directs ?? []), str(m.school_id)];
            teacher.director = true;
        }
        teacher.status = m.status === 'active' || teacher.status === 'active' && m.status !== 'invited' ? (m.status as Teacher['status']) : teacher.status;
        staff.set(id, teacher);
    }
    for (const c of classes) {
        const id = str(c.teacher_id);
        if (!staff.has(id) && nameOf.has(id)) staff.set(id, {id, schools: [str(c.school_id)], name: nameOf.get(id) ?? '', email: '', phone: '', status: 'active', futureSessions: 0, emergency: []});
    }
    replace<Teacher>(TEACHERS, [...staff.values()].sort((a, b) => a.name.localeCompare(b.name)));
    STAFF_ME.t = me;
    STAFF_ME.d = me;

    // ---- Prices: the current amount of each, with the earlier ones and any coming change ----
    const priceKey = (p: Row) => `${p.school_id}|${p.kind}|${p.class_id ?? ''}|${p.offer_id ?? ''}|${p.attendants ?? ''}`;
    const groups = new Map<string, Row[]>();
    for (const p of prices) groups.set(priceKey(p), [...(groups.get(priceKey(p)) ?? []), p]);
    const classNameOf = new Map(classes.map(c => [str(c.id), str(c.name)]));
    const offerNameOf = new Map(offers.map(o => [str(o.id), str(o.name)]));
    const livePrices: Price[] = [];
    const currentPrice = (kind: string, school: string, classId?: string, offerId?: string) =>
        livePrices.find(p => p.kind === kind && p.school === school && (!classId || p.id === `m-${classId}`) && (!offerId || p.id === offerId))?.amount;
    for (const list of groups.values()) {
        const sorted = [...list].sort((a, b) => str(b.starts_on).localeCompare(str(a.starts_on)));
        const now_ = sorted.find(p => str(p.starts_on) <= today) ?? sorted[sorted.length - 1];
        const next = sorted.find(p => str(p.starts_on) > today);
        const kind = str(now_.kind) as Price['kind'];
        livePrices.push({
            // A package's price goes by the package (its screens and screenshots name it by its id); a class's monthly plan by the class.
            id: kind === 'package' ? str(now_.offer_id) : kind === 'monthly' ? `m-${now_.class_id}` : str(now_.id),
            school: str(now_.school_id), kind,
            label: kind === 'monthly' ? classNameOf.get(str(now_.class_id)) ?? '' : kind === 'package' ? offerNameOf.get(str(now_.offer_id)) ?? ''
                : kind === 'free' ? str(now_.attendants) : '',
            amount: num(now_.amount), from: str(now_.starts_on),
            history: sorted.filter(p => p !== now_ && p !== next && str(p.starts_on) < str(now_.starts_on)).map(p => ({
                amount: num(p.amount),
                from: str(p.starts_on)
            })),
            next: next ? {amount: num(next.amount), from: str(next.starts_on)} : undefined,
            extra: kind === 'fee' ? str(schools.find(s => s.id === now_.school_id)?.fee_months) : undefined,
        });
    }
    replace<Price>(PRICES, livePrices);

    // ---- Classes and sessions ----
    const offerOfClass = new Set(offerClasses.map(oc => str(oc.class_id)));
    const activeEnrollments = enrollments.filter(e => !e.ends_on || str(e.ends_on) >= today);
    replace<SchoolClass>(CLASSES, classes.map(c => {
        const slots = schedules.filter(s => s.class_id === c.id);
        return {
            id: str(c.id),
            school: str(c.school_id),
            max: c.max_students ? num(c.max_students) : undefined,
            forKids: Boolean(c.for_kids),
            name: str(c.name),
            teacher: str(c.teacher_id),
            kind: str(c.kind) as SchoolClass['kind'],
            slots: slots.map(s => ({
                weekday: num(s.weekday),
                start: str(s.start_time).slice(0, 5),
                end: str(s.end_time).slice(0, 5),
                room: str(s.room_id)
            })),
            from: slots.map(s => str(s.first_date)).sort()[0] ?? today,
            until: str(c.ends_on) || (slots.map(s => str(s.last_date)).sort().pop() ?? today),
            students: activeEnrollments.filter(e => e.class_id === c.id).length,
            inPackages: offerOfClass.has(str(c.id)),
            monthly: c.monthly_sessions ? {
                sessions: num(c.monthly_sessions),
                price: currentPrice('monthly', str(c.school_id), str(c.id)) ?? 0
            } : undefined,
            perVisit: Boolean(c.per_visit),
            ending: Boolean(c.ends_on),
        };
    }));

    const replacedBy = new Map(sessions.filter(s => s.replaces_id).map(s => [str(s.replaces_id), str(s.id)]));
    const attendedBySession = new Map<string, Row[]>();
    for (const a of attendance) attendedBySession.set(str(a.session_id), [...(attendedBySession.get(str(a.session_id)) ?? []), a]);
    replace<Session>(SESSIONS, sessions.map(s => {
        const zone_ = zoneOf.get(str(s.school_id)) ?? zone;
        const start = local(str(s.starts_at), zone_);
        const came = (attendedBySession.get(str(s.id)) ?? []).filter(a => a.kind === 'student');
        const enrolled = activeEnrollments.filter(e => e.class_id === s.class_id).length + bookings.filter(b => b.session_id === s.id).length;
        return {
            id: str(s.id),
            classId: str(s.class_id),
            date: start.date,
            start: start.time,
            end: local(str(s.ends_at), zone_).time,
            room: str(s.room_id),
            status: str(s.status) as Session['status'],
            substitute: s.substitute_id ? str(s.substitute_id) : undefined,
            // Who gave it, when the class has changed teacher since.
            teacher: s.teacher_id !== classes.find(c => c.id === s.class_id)?.teacher_id ? str(s.teacher_id) : undefined,
            replacementId: replacedBy.get(str(s.id)),
            replaces: s.replaces_id ? str(s.replaces_id) : undefined,
            expected: Math.max(enrolled, came.length),
            checkedIn: str(s.ends_at) <= new Date().toISOString() || came.length ? came.length : undefined,
        };
    }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)));

    // ---- Packages and enrollments ----
    replace<Package>(PACKAGES, offers.map(o => ({
        id: str(o.id),
        school: str(o.school_id),
        perWeek: num(o.per_week),
        classes: offerClasses.filter(oc => oc.offer_id === o.id).map(oc => str(oc.class_id)),
        price: currentPrice('package', str(o.school_id), undefined, str(o.id)) ?? 0,
        retired: Boolean(o.retired_at),
    })));
    replace<Enrollment>(ENROLLMENTS, [
        ...activeEnrollments.map(e => ({
            id: str(e.id),
            student: str(e.student_id),
            classId: str(e.class_id),
            how: str(e.how) as Enrollment['how'],
            from: str(e.starts_on)
        })),
        ...packages.filter(p => !p.ends_on || str(p.ends_on) >= today).map(p => ({
            id: str(p.id),
            student: str(p.student_id),
            packageId: str(p.offer_id),
            how: 'package' as const,
            from: str(p.starts_on)
        })),
    ]);

    // ---- Students ----
    const latestTerms = new Map<string, Row>();
    for (const t of terms) if (!latestTerms.has(str(t.school_id)) || num(t.version) > num(latestTerms.get(str(t.school_id))?.version)) latestTerms.set(str(t.school_id), t);
    const lastPassMethod = new Map<string, string>();
    for (const p of [...proofs].sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)))) {
        if (p.method === 'wellhub' || p.method === 'totalpass') lastPassMethod.set(str(p.student_id), str(p.method));
    }
    const ageOf = (birth: unknown) => {
        if (!birth) return 0;
        const b = new Date(`${str(birth)}T12:00:00`);
        const n = new Date(`${today}T12:00:00`);
        return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
    };
    // A minor's people: their guardian's family list, the ones marked for them.
    const familyOf = (student: string, school: string) => family.filter(p => p.school_id === school
        && familyKids.some(k => k.family_person_id === p.id && k.student_id === student));
    replace<Student>(LIVE_STUDENTS, memberships.filter(m => m.role === 'student').map(m => {
        const id = str(m.person_id);
        const school = str(m.school_id);
        const card = cards.find(k => k.student_id === id && k.school_id === school);
        const pack = packages.find(p => p.student_id === id && p.school_id === school && (!p.ends_on || str(p.ends_on) >= today));
        const monthly = activeEnrollments.find(e => e.student_id === id && e.school_id === school && e.how === 'monthly');
        const visiting = activeEnrollments.some(e => e.student_id === id && e.school_id === school && e.how === 'visit');
        const pass = lastPassMethod.get(id);
        const plan: PlanKind = pack ? 'package' : monthly ? 'monthly' : visiting && pass ? (pass as PlanKind) : 'cash';
        const guardianId = links.find(l => l.student_id === id && l.school_id === school)?.guardian_id;
        const latest = latestTerms.get(school);
        return {
            id,
            school,
            name: str(card?.full_name) || (nameOf.get(id) ?? ''),
            age: ageOf(card?.birth_date),
            minor: Boolean(m.minor) || undefined,
            guardian: guardianId ? nameOf.get(str(guardianId)) : undefined,
            plan,
            packageId: pack ? str(pack.offer_id) : undefined,
            planLabel: monthly ? classNameOf.get(str(monthly.class_id)) ?? '' : '',
            paymentDay: (num(m.payment_day) === 15 ? 15 : 30) as 15 | 30,
            since: str(pack?.starts_on ?? monthly?.starts_on ?? str(m.created_at).slice(0, 10)),
            status: str(m.status) as Student['status'],
            termsPending: latest && acceptances.length ? !acceptances.some(a => a.terms_id === latest.id && a.student_id === id) || undefined : undefined,
            feeOwed: fees.some(f => f.student_id === id && f.school_id === school && !f.done_at) || undefined,
            health: str(card?.health_notes) || undefined,
            photo: str(card?.photo_path) || undefined,
            birth: str(card?.birth_date) || undefined,
            emergency: m.minor
                ? familyOf(id, school).filter(p => p.is_emergency).map(p => ({name: str(p.name), relation: str(p.relation), phone: str(p.phone)}))
                : contacts.filter(c => c.card_id === card?.id).map(c => ({
                    name: str(c.name),
                    relation: str(c.relation),
                    phone: str(c.phone)
                })),
            pickup: m.minor ? familyOf(id, school).filter(p => p.can_pick_up).map(p => str(p.name)) : undefined,
        };
    }).sort((a, b) => a.name.localeCompare(b.name)));

    // ---- Who came (rosters, and what the teacher's pay counts) ----
    HISTORY.expected.clear();
    HISTORY.attended.clear();
    HISTORY.guests.clear();
    const planOf = new Map(LIVE_STUDENTS.map(s => [s.id, s.plan]));
    for (const s of SESSIONS) {
        const day = s.date;
        const takers = new Set<string>([
            ...enrollments.filter(e => e.class_id === s.classId && str(e.starts_on) <= day && (!e.ends_on || str(e.ends_on) >= day)).map(e => str(e.student_id)),
            ...bookings.filter(b => b.session_id === s.id).map(b => str(b.student_id)),
        ]);
        const rows_ = attendedBySession.get(s.id) ?? [];
        const came: Attendance[] = rows_.filter(a => a.kind === 'student').map(a => {
            const student = str(a.person_id);
            const trial = bookings.some(b => b.session_id === s.id && b.student_id === student && b.kind === 'trial');
            const plan = planOf.get(student);
            return {
                student,
                at: local(str(a.created_at), zoneOf.get(str(CLASSES.find(c => c.id === s.classId)?.school)) ?? zone).time.replace(/^0/, ''),
                by: a.created_by !== a.person_id && a.method === 'qr' ? 'guardian' : undefined,
                as: trial ? 'trial' : plan === 'wellhub' || plan === 'totalpass' ? 'pass' : plan === 'cash' ? 'visit' : 'plan',
            };
        });
        HISTORY.expected.set(s.id, [...takers]);
        if (rows_.length || s.checkedIn !== undefined) HISTORY.attended.set(s.id, came);
        const guests = rows_.filter(a => a.kind === 'guest_teacher').map(a => str(a.person_id));
        if (guests.length) HISTORY.guests.set(s.id, guests);
    }

    // ---- Payment screenshots ----
    replace<Proof>(PROOFS, proofs.map(p => {
        const school = str(p.school_id);
        const sent = local(str(p.created_at), zoneOf.get(school) ?? zone);
        const session = SESSIONS.find(s => s.id === p.session_id);
        const enrollment = enrollments.find(e => e.id === p.enrollment_id);
        const pack = packages.find(x => x.id === p.package_id);
        const covers = p.covers === 'fee' ? 'Inscripción'
            : p.covers === 'visit' ? `${classNameOf.get(session?.classId ?? '') ?? ''} · ${session?.date ?? ''}`
                : `${pack ? str(pack.offer_id) : classNameOf.get(str(enrollment?.class_id)) ?? ''} · ${str(p.month).slice(0, 7)}`;
        return {
            id: str(p.id),
            student: str(p.student_id),
            school,
            covers,
            method: str(p.method) as Proof['method'],
            amount: num(p.amount),
            sent: sent.date,
            sentAt: sent.time,
            state: str(p.state) as Proof['state'],
            reason: p.reason ? str(p.reason) : undefined,
        };
    }).sort((a, b) => (b.sent + b.sentAt).localeCompare(a.sent + a.sentAt)));

    // ---- The board and personal notices ----
    const kindMap: Record<string, Notice['kind']> = {
        cancelled: 'cancelled', moved: 'schedule', substitute: 'substitute', substitute_removed: 'substitute',
        teacher: 'teacher', ended: 'ended', price: 'price', note: 'note'
    };
    replace<Notice>(BOARD, announcements.filter(a => !a.visible_until || str(a.visible_until) >= today).map(a => {
        const vars = (a.vars ?? {}) as Record<string, unknown>;
        const school = str(a.school_id);
        const startAt = vars.starts_at ? local(str(vars.starts_at), zoneOf.get(school) ?? zone) : null;
        const body = str(a.body);
        const rawKind = str(a.kind);
        const kind = kindMap[rawKind] ?? (rawKind === 'vacation' ? 'vacation'
            : rawKind === 'vacation_removed' ? 'vacation_removed' : 'note');
        const textOf: Partial<Record<string, TextKey>> = {
            cancelled: 'notice.cancelledOnly',
            substitute: 'notice.substitute',
            substitute_removed: 'notice.noSubstitute',
            teacher: 'notice.newTeacher',
            ended: 'notice.ended',
            price: 'notice.price',
            moved: 'notice.moved',
            vacation: 'notice.vacation',
            vacation_removed: 'notice.vacationRemoved',
        };
        const who = nameOf.get(str(vars.person_id)) ?? '';
        return {
            id: str(a.id),
            school,
            date: local(str(a.created_at), zoneOf.get(school) ?? zone).date,
            kind,
            classId: a.class_id ? str(a.class_id) : undefined,
            priceId: a.kind === 'price' ? (vars.offer_id ? str(vars.offer_id) : undefined) : undefined,
            title: a.class_id ? classNameOf.get(str(a.class_id)) ?? '' : shortTitle(body),
            at: startAt ? `${startAt.date} ${startAt.time}` : undefined,
            keep: !a.visible_until,
            text: textOf[str(a.kind)],
            body: a.kind === 'note' ? body : undefined,
            vars: (a.kind === 'price' ? {
                    from: money(num(vars.from)),
                    to: money(num(vars.to)),
                    when: str(vars.starts_on)
                }
                : str(a.kind) === 'vacation' || str(a.kind) === 'vacation_removed' ? {dates: Array.isArray(vars.dates) ? vars.dates.map(String).join(',') : ''}
                    : {name: who, when: str(vars.last_day ?? (startAt ? `${startAt.date} ${startAt.time}` : '')), room: ''}) as Record<string, string>,
            author: a.created_by ? nameOf.get(str(a.created_by)) : undefined,
            unread: false,
        };
    }).sort((a, b) => b.date.localeCompare(a.date)));
    replace(VACATION_DAYS, vacations.map(vacation => ({school: str(vacation.school_id), date: str(vacation.vacation_date)})));

    const personal: Personal[] = [];
    for (const n of notifications) {
        const vars = (n.vars ?? {}) as Record<string, unknown>;
        const studentName = nameOf.get(str(vars.student_id)) ?? '';
        const keyOf: Record<string, TextKey> = {
            proof_rejected: 'personal.rejected',
            proof_confirmed: 'personal.confirmedProof',
            over_plan: 'personal.overPlan',
            card_changed: 'personal.cardChanged',
            turns_18: 'personal.turns18',
            pay_rule: 'personal.payRule',
            teacher_paid: 'personal.teacherPaid',
            teacher_payday: 'personal.teacherPayday',
        };
        const text = keyOf[str(n.kind)];
        if (!text) continue;
        personal.push({
            id: str(n.id), school: str(n.school_id), date: str(n.created_at).slice(0, 10), unread: !n.read_at, text,
            vars: {
                name: studentName,
                what: str(vars.covers ?? ''),
                count: `${str(vars.used)} / ${str(vars.allowed)}`,
                amount: money(num(vars.amount)),
                when: str(vars.payday ?? ''),
                line: '',
                n: '1',
                month: str(vars.month ?? '')
            },
        });
    }
    for (const role of ['s', 'g', 't', 'd'] as const) replace(PERSONAL[role], personal);

    // ---- Teacher pay ----
    for (const key of Object.keys(PAY_RULES)) delete PAY_RULES[key];
    for (const s of schools) {
        const rule = rules.filter(r => r.school_id === s.id && str(r.starts_on) <= today).sort((a, b) => str(b.starts_on).localeCompare(str(a.starts_on)))[0];
        if (!rule) continue;
        PAY_RULES[str(s.id)] = {
            days: str(rule.days) === 'month' ? 'month' : 'half',
            scheme: rule.scheme === 'per_session' ? 'perSession' : rule.scheme === 'percent' ? 'percent' : 'tiers',
            perSession: Object.fromEntries(rates.filter(r => r.rule_id === rule.id).map(r => [str(r.teacher_id), num(r.amount)])),
            defaultPerSession: num(rule.default_per_session),
            percent: num(rule.percent) || 70,
            totalpassValue: num(rule.pass_value),
            tiers: tiers.filter(t => t.rule_id === rule.id).sort((a, b) => num(a.from_students) - num(b.from_students))
                .map(t => ({
                    from: num(t.from_students),
                    to: t.to_students === null ? undefined : num(t.to_students),
                    amount: num(t.amount)
                })),
            emptyPay: num(rule.empty_pay),
        };
    }
    setTeacherPayments(payments.map((p): TeacherPayment => ({
        id: str(p.id),
        teacher: str(p.teacher_id),
        school: str(p.school_id),
        period: str(p.period_start),
        amount: num(p.amount),
        method: p.method === 'cash' ? 'cash' : 'transfer',
        date: str(p.paid_on),
        note: p.note ? str(p.note) : undefined,
        receipt: Boolean(p.receipt_path),
        state: p.answer === 'received' ? 'confirmed' : p.answer === 'disputed' ? 'flagged' : 'paid',
        flagNote: p.answer_note ? str(p.answer_note) : undefined,
    })));

    // ---- Terms: who hasn't accepted the latest version ----
    for (const s of schools) {
        const versions = terms.filter(t => t.school_id === s.id).sort((a, b) => num(b.version) - num(a.version));
        const latest = versions[0];
        if (!latest) continue;
        const current = LIVE_STUDENTS.filter(st => st.school === s.id && st.status !== 'inactive');
        setLiveTerms(str(s.id), num(latest.version), str(latest.uploaded_at).slice(0, 10),
            current.filter(st => !acceptances.some(a => a.terms_id === latest.id && a.student_id === st.id)).map(st => st.name),
            versions.slice(1).map(v => ({
                version: num(v.version),
                uploaded: str(v.uploaded_at).slice(0, 10)
            })), current.map(st => st.name));
    }


    // ---- Who the student screens are for: the signed-in student, or the guardian's children ----
    const myName = nameOf.get(me) ?? '';
    ME.student = mine.some(m => m.role === 'student') ? me : '';
    ME.name = myName.split(' ')[0] ?? '';
    ME.fullName = myName;
    ME.phone = str(persons.find(p => p.id === me)?.phone);
    ME.email = LIVE.email;
    ME.accepted = [...new Set(acceptances.map(a => str(a.school_id)))].flatMap(school => {
        const mineThere = acceptances.filter(a => a.school_id === school && a.accepted_by === me);
        const best = mineThere.map(a => ({a, version: num(terms.find(x => x.id === a.terms_id)?.version)})).sort((x, y) => y.version - x.version)[0];
        return best ? [{school, version: best.version, when: str(best.a.accepted_at).slice(0, 10)}] : [];
    });
    ME.guardianName = ME.name;
    replace(SOFIA_SCHOOLS, mine.filter(m => m.role === 'student').map(m => str(m.school_id)));
    const kids = links.filter(l => l.guardian_id === me);
    replace(GUARDIAN_KIDS, kids.map(l => ({id: str(l.student_id), name: LIVE_STUDENTS.find(st => st.id === l.student_id)?.name ?? nameOf.get(str(l.student_id)) ?? ''})));
    replace(GUARDIAN_SCHOOLS, [...new Set(kids.map(l => str(l.school_id)))]);
    BOARD_READERS.s = ME.student ? [ME.student] : [];
    BOARD_READERS.g = GUARDIAN_KIDS.map(kid => kid.id);
    replace(LIVE_FEES, fees.filter(fee => !fee.done_at).map(fee => ({id: str(fee.id), student: str(fee.student_id), school: str(fee.school_id), amount: num(fee.amount)})));

    LIVE.on = true;
    liveChanged();
}
