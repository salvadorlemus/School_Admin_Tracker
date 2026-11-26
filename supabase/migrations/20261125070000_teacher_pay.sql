-- Teacher pay (rule 24): each school's rule, the calculation from attendance, and the payments.
--
-- A rule is never edited: a new one applies from the period going on when it's saved, and closed
-- periods keep the rule they had. Pay is counted from attendance: trial classes never count,
-- TotalPass and Wellhub do, guest teachers don't; a session counts for whoever gave it (the
-- substitute), and cancelled ones don't. Money moves outside the app; each payment is recorded in
-- it by a director, and the teacher confirms it or says it doesn't match.

create type pay_days as enum ('half', 'month');
create type pay_scheme as enum ('per_session', 'percent', 'tiers');
create type teacher_payment_answer as enum ('received', 'disputed');
create type teacher_payment_method as enum ('transfer', 'cash');

create table teacher_pay_rule (
    id                   uuid primary key default gen_random_uuid(),
    school_id            uuid not null references school on delete cascade,
    /** The first day of the period it applies from. */
    starts_on            date not null,
    days                 pay_days not null default 'half',
    scheme               pay_scheme not null,
    default_per_session  numeric(10, 2) check (default_per_session >= 0),
    percent              smallint check (percent between 1 and 100),
    /** What TotalPass (or Wellhub) pays the school per visit: a share scheme's base for those students. */
    pass_value           numeric(10, 2) check (pass_value >= 0),
    /** Ranges: what a session nobody came to pays. */
    empty_pay            numeric(10, 2) not null default 0 check (empty_pay >= 0),
    created_by           uuid references person,
    created_at           timestamptz not null default now(),
    check (scheme <> 'per_session' or default_per_session is not null),
    check (scheme <> 'percent' or (percent is not null and pass_value is not null))
);
create index on teacher_pay_rule (school_id, starts_on desc, created_at desc);

/** A fixed amount per session for one teacher (per-session scheme). */
create table teacher_pay_rate (
    rule_id     uuid not null references teacher_pay_rule on delete cascade,
    teacher_id  uuid not null references person,
    amount      numeric(10, 2) not null check (amount >= 0),
    primary key (rule_id, teacher_id)
);

/** A range of students and what a session with that many pays (ranges scheme). */
create table teacher_pay_tier (
    rule_id        uuid not null references teacher_pay_rule on delete cascade,
    from_students  smallint not null check (from_students >= 1),
    to_students    smallint check (to_students >= from_students),
    amount         numeric(10, 2) not null check (amount > 0),
    primary key (rule_id, from_students)
);

create table teacher_payment (
    id            uuid primary key default gen_random_uuid(),
    school_id     uuid not null references school on delete cascade,
    teacher_id    uuid not null references person,
    period_start  date not null,
    period_end    date not null,
    amount        numeric(10, 2) not null check (amount <> 0),
    /** The app's calculation when it was recorded; a different amount needs a note. */
    calculated    numeric(10, 2) not null,
    note          text check (length(note) <= 500),
    paid_on       date not null,
    method        teacher_payment_method not null,
    receipt_path  text,
    recorded_by   uuid references person,
    recorded_at   timestamptz not null default now(),
    answer        teacher_payment_answer,
    answer_note   text check (length(answer_note) <= 500),
    answered_at   timestamptz,
    check (amount = calculated or length(btrim(note)) > 0),
    check (answer is distinct from 'disputed' or length(btrim(answer_note)) > 0),
    check (receipt_path is null or receipt_path = school_id::text || '/teacher-payments/' || id::text || '.jpg')
);
create index on teacher_payment (school_id, period_start);

-- ---- Periods and the rule in force ----

/** The rule a day falls under: the latest one from on or before it. */
create or replace function private.rule_on(school uuid, day date) returns public.teacher_pay_rule
    language sql stable security definer set search_path = '' as $$
    select * from public.teacher_pay_rule r where r.school_id = school and r.starts_on <= day
    order by r.starts_on desc, r.created_at desc limit 1
$$;

/** The pay period a day falls in: the 1st–15th and the 16th–end (in February, its last day), or the whole month. */
create or replace function private.period_of(days public.pay_days, day date) returns daterange
    language sql immutable as $$
    select case
        when days = 'month' then daterange(date_trunc('month', day)::date, (date_trunc('month', day) + interval '1 month')::date)
        when extract(day from day) <= 15 then daterange(date_trunc('month', day)::date, date_trunc('month', day)::date + 15)
        else daterange(date_trunc('month', day)::date + 15, (date_trunc('month', day) + interval '1 month')::date)
    end
$$;

/**
 * Saves a new rule, from the period going on today (closed periods keep theirs). `rates` is
 * [{teacher_id, amount}], `tiers` [{from, to, amount}] with the last `to` empty ("or more"). Ranges
 * must start at 1 and follow each other without gaps. The school's teachers are told.
 */
create or replace function public.save_pay_rule(school uuid, days public.pay_days, scheme public.pay_scheme, default_per_session numeric default null,
                                                percent smallint default null, pass_value numeric default null, empty_pay numeric default 0,
                                                rates jsonb default '[]', tiers jsonb default '[]') returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    rule uuid;
    today date := private.school_today(save_pay_rule.school);
    expected integer := 1;
    t record;
    n integer := 0;
begin
    if not private.is_director(save_pay_rule.school) then
        raise exception 'Only the school''s directors set teacher pay' using errcode = '42501';
    end if;
    if scheme = 'tiers' then
        for t in select (e.x ->> 'from')::int as f, (e.x ->> 'to')::int as u, (e.x ->> 'amount')::numeric as a, e.i, count(*) over () as total
                 from jsonb_array_elements(tiers) with ordinality as e(x, i) order by e.i loop
            if t.f <> expected or (t.i < t.total and (t.u is null or t.u < t.f)) or (t.i = t.total and t.u is not null) or coalesce(t.a, 0) <= 0 then
                raise exception 'Ranges start at 1, follow each other, end in "or more", and each pays something' using errcode = '22023';
            end if;
            expected := coalesce(t.u, 0) + 1;
            n := n + 1;
        end loop;
        if n = 0 then
            raise exception 'Add at least one range' using errcode = '22023';
        end if;
    end if;
    insert into public.teacher_pay_rule (school_id, starts_on, days, scheme, default_per_session, percent, pass_value, empty_pay, created_by)
    values (save_pay_rule.school, lower(private.period_of(days, today)), days, scheme, default_per_session, percent, pass_value, coalesce(empty_pay, 0), private.me())
    returning id into rule;
    insert into public.teacher_pay_rate (rule_id, teacher_id, amount)
    select rule, (x ->> 'teacher_id')::uuid, (x ->> 'amount')::numeric from jsonb_array_elements(rates) x
    where exists (select 1 from public.membership m where m.school_id = save_pay_rule.school and m.person_id = (x ->> 'teacher_id')::uuid and m.role = 'teacher');
    insert into public.teacher_pay_tier (rule_id, from_students, to_students, amount)
    select rule, (x ->> 'from')::smallint, (x ->> 'to')::smallint, (x ->> 'amount')::numeric from jsonb_array_elements(tiers) x where scheme = 'tiers';
    perform private.notify(m.person_id, save_pay_rule.school, 'pay_rule', jsonb_build_object('rule_id', rule, 'scheme', scheme))
    from public.membership m where m.school_id = save_pay_rule.school and m.role = 'teacher' and m.status = 'active';
    return rule;
end $$;

-- ---- The calculation ----

/** Who counts at a session: the students who came, without the ones there on a trial class. */
create or replace function private.counted_students(session uuid) returns setof uuid
    language sql stable security definer set search_path = '' as $$
    select a.person_id from public.attendance a
    where a.session_id = session and a.kind = 'student'
      and not exists (select 1 from public.booking b where b.session_id = session and b.student_id = a.person_id and b.kind = 'trial')
$$;

/**
 * What one student's attendance is worth for a share scheme, and whether its payment is confirmed:
 * a monthly plan or package, its price over the sessions it covers once the month's screenshot is
 * confirmed; per visit, the session's screenshot (TotalPass/Wellhub at what they pay the school).
 */
create or replace function private.attendance_value(s public.session, student uuid, rule public.teacher_pay_rule, out value numeric, out confirmed boolean)
    language plpgsql stable security definer set search_path = '' as $$
declare
    day date := (select (s.starts_at at time zone time_zone)::date from public.school where id = s.school_id);
    month date := date_trunc('month', day)::date;
    e public.enrollment;
    p public.student_package;
    proof public.payment_proof;
begin
    select * into e from public.enrollment x where x.student_id = student and x.class_id = s.class_id and x.how = 'monthly'
        and x.starts_on <= day and (x.ends_on is null or x.ends_on >= day) limit 1;
    if e.id is not null then
        value := e.price / greatest(1, (select monthly_sessions from public.class where id = s.class_id));
        confirmed := exists (select 1 from public.payment_proof x where x.enrollment_id = e.id and x.month = attendance_value.month and x.state = 'confirmed');
        return;
    end if;
    select sp.* into p from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
    where sp.student_id = student and oc.class_id = s.class_id and sp.starts_on <= day and (sp.ends_on is null or sp.ends_on >= day) limit 1;
    if p.id is not null then
        value := p.price / greatest(1, p.per_week * 4);
        confirmed := exists (select 1 from public.payment_proof x where x.package_id = p.id and x.month = attendance_value.month and x.state = 'confirmed');
        return;
    end if;
    select * into proof from public.payment_proof x where x.session_id = s.id and x.student_id = student and x.state <> 'rejected'
    order by (x.state = 'confirmed') desc, x.created_at desc limit 1;
    value := case when proof.method in ('totalpass', 'wellhub') then coalesce(rule.pass_value, 0)
                  else coalesce(proof.expected, private.price_on(s.school_id, 'visit', day), 0) end;
    confirmed := coalesce(proof.state = 'confirmed', false);
end $$;

/** One session's pay for whoever gave it, by the rule of its period, and what's still waiting on confirmations. */
create or replace function private.session_pay(s public.session, out counted integer, out amount numeric, out pending numeric)
    language plpgsql stable security definer set search_path = '' as $$
declare
    day date := (select (s.starts_at at time zone time_zone)::date from public.school where id = s.school_id);
    rule public.teacher_pay_rule := private.rule_on(s.school_id, day);
    giver uuid := coalesce(s.substitute_id, s.teacher_id);
    v record;
begin
    select count(*) into counted from private.counted_students(s.id);
    amount := 0;
    pending := 0;
    if rule.id is null or s.status <> 'scheduled' then return; end if;
    if rule.scheme = 'per_session' then
        amount := coalesce((select r.amount from public.teacher_pay_rate r where r.rule_id = rule.id and r.teacher_id = giver), rule.default_per_session);
    elsif rule.scheme = 'tiers' then
        amount := case when counted = 0 then rule.empty_pay else coalesce((select t.amount from public.teacher_pay_tier t where t.rule_id = rule.id
                   and counted >= t.from_students and (t.to_students is null or counted <= t.to_students)), 0) end;
    else
        for v in select (private.attendance_value(s, who, rule)).* from private.counted_students(s.id) who loop
            if v.confirmed then amount := amount + v.value; else pending := pending + v.value; end if;
        end loop;
        amount := round(amount * rule.percent / 100.0, 2);
        pending := round(pending * rule.percent / 100.0, 2);
    end if;
end $$;

/**
 * A teacher's pay for a period at a school: each session they gave (their own and the ones they
 * covered; not the ones covered for them), already over, cancelled ones left out. For the teacher
 * themselves and the school's directors.
 */
create or replace function public.teacher_pay(school uuid, teacher uuid, period_start date, period_end date)
    returns table (session_id uuid, class_id uuid, starts_at timestamptz, covered boolean, counted integer, amount numeric, pending numeric)
    language plpgsql stable security definer set search_path = '' as $$
begin
    if not (private.is_director(teacher_pay.school) or (teacher = private.me() and private.is_member(teacher_pay.school, '{teacher}'))) then
        raise exception 'Only the teacher and the school''s directors see their pay' using errcode = '42501';
    end if;
    return query
    select s.id, s.class_id, s.starts_at, s.substitute_id is not null, p.counted, p.amount, p.pending
    from public.session s join public.school sc on sc.id = s.school_id
    cross join lateral private.session_pay(s) p
    where s.school_id = teacher_pay.school and s.status = 'scheduled' and coalesce(s.substitute_id, s.teacher_id) = teacher
      and s.ends_at <= now() and (s.starts_at at time zone sc.time_zone)::date between period_start and period_end
    order by s.starts_at;
end $$;

-- ---- Paying ----

/** A director records a payment for a closed period; a different amount than the calculation needs a note. */
create or replace function public.record_teacher_payment(school uuid, teacher uuid, period_start date, amount numeric, paid_on date,
                                                         method public.teacher_payment_method, note text default null, payment_id uuid default gen_random_uuid(),
                                                         with_receipt boolean default false) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    rule public.teacher_pay_rule := private.rule_on(record_teacher_payment.school, period_start);
    period daterange := private.period_of(coalesce(rule.days, 'half'), period_start);
    total numeric;
begin
    if not private.is_director(record_teacher_payment.school) then
        raise exception 'Only the school''s directors record teacher payments' using errcode = '42501';
    end if;
    if not exists (select 1 from public.membership m where m.school_id = record_teacher_payment.school and m.person_id = teacher and m.role = 'teacher') then
        raise exception 'Not a teacher of this school' using errcode = '22023';
    end if;
    if lower(period) <> period_start or upper(period) > private.school_today(record_teacher_payment.school) then
        raise exception 'A payment is for a closed pay period' using errcode = 'P0001';
    end if;
    select coalesce(sum(p.amount), 0) into total
    from public.teacher_pay(record_teacher_payment.school, teacher, lower(period), upper(period) - 1) p;
    insert into public.teacher_payment (id, school_id, teacher_id, period_start, period_end, amount, calculated, note, paid_on, method, receipt_path, recorded_by)
    values (payment_id, record_teacher_payment.school, teacher, lower(period), upper(period) - 1, amount, total, nullif(btrim(note), ''), paid_on, method,
            case when with_receipt then format('%s/teacher-payments/%s.jpg', record_teacher_payment.school, payment_id) end, private.me());
    perform private.notify(teacher, record_teacher_payment.school, 'teacher_paid', jsonb_build_object('payment_id', payment_id, 'amount', amount, 'period_start', lower(period)));
    return payment_id;
end $$;

/** The teacher answers: received, or it doesn't match (with a note, which becomes the directors' to-do). */
create or replace function public.answer_teacher_payment(payment_id uuid, received boolean, note text default null) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    p public.teacher_payment;
begin
    select * into p from public.teacher_payment where id = payment_id for update;
    if p.id is null or p.teacher_id <> private.me() then
        raise exception 'Only the teacher answers for their payment' using errcode = '42501';
    end if;
    if not received and length(btrim(coalesce(note, ''))) = 0 then
        raise exception 'Say what doesn''t match' using errcode = '22023';
    end if;
    update public.teacher_payment set answer = case when received then 'received' else 'disputed' end::public.teacher_payment_answer,
        answer_note = case when received then null else btrim(answer_teacher_payment.note) end, answered_at = now()
    where id = p.id;
    if not received then
        perform private.notify_directors(p.school_id, 'teacher_payment_disputed', jsonb_build_object('payment_id', p.id, 'teacher_id', p.teacher_id));
    end if;
end $$;

-- ---- Policies ----

alter table teacher_pay_rule enable row level security;
alter table teacher_pay_rate enable row level security;
alter table teacher_pay_tier enable row level security;
alter table teacher_payment enable row level security;

-- The rule is the school's staff's to read (a teacher sees how they're paid; per-teacher amounts are their own).
create policy "staff read the pay rule" on teacher_pay_rule for select to authenticated using (private.is_staff(school_id));
create policy "staff read the ranges" on teacher_pay_tier for select to authenticated
    using (exists (select 1 from teacher_pay_rule r where r.id = rule_id and private.is_staff(r.school_id)));
create policy "directors and the teacher read a rate" on teacher_pay_rate for select to authenticated
    using (teacher_id = private.me() or exists (select 1 from teacher_pay_rule r where r.id = rule_id and private.is_director(r.school_id)));
create policy "directors and the teacher read a payment" on teacher_payment for select to authenticated
    using (private.is_director(school_id) or teacher_id = private.me());
-- No direct writes: rules, payments and answers go through the functions above.

grant select on teacher_pay_rule, teacher_pay_rate, teacher_pay_tier, teacher_payment to authenticated;
grant execute on function public.save_pay_rule(uuid, pay_days, pay_scheme, numeric, smallint, numeric, numeric, jsonb, jsonb),
    public.teacher_pay(uuid, uuid, date, date),
    public.record_teacher_payment(uuid, uuid, date, numeric, date, teacher_payment_method, text, uuid, boolean),
    public.answer_teacher_payment(uuid, boolean, text) to authenticated;

-- ---- The receipt photo: the director who recorded it uploads it; the teacher and the directors open it ----

create or replace function private.file_readable(path text) returns boolean
    language sql stable security definer set search_path = '' as $$
    select case split_part(path, '/', 2)
        when 'proofs' then exists (select 1 from public.payment_proof p where p.file_path = path and private.can_read_proof(p))
        when 'cards' then exists (select 1 from public.student_card k where k.photo_path = path and private.can_read_card(k.school_id, k.student_id))
        when 'family' then exists (select 1 from public.family_person f where f.photo_path = path and private.family_reader(f.id))
        when 'terms' then exists (select 1 from public.terms t where t.file_path = path
                                  and (private.is_member(t.school_id) or exists (select 1 from public.membership m
                                       where m.school_id = t.school_id and m.person_id = private.me() and m.status = 'invited')))
        when 'logo' then exists (select 1 from public.school s where s.logo_path = path)
        when 'teacher-payments' then exists (select 1 from public.teacher_payment p where p.receipt_path = path
                                             and (private.is_director(p.school_id) or p.teacher_id = private.me()))
        else split_part(path, '/', 1) = 'staff' and exists (select 1 from public.staff_card c where c.photo_path = path and private.can_read_staff(c.person_id))
    end
$$;

create or replace function private.file_uploadable(path text) returns boolean
    language sql stable security definer set search_path = '' as $$
    select case split_part(path, '/', 2)
        when 'proofs' then exists (select 1 from public.payment_proof p where p.file_path = path and p.created_by = private.me())
        when 'cards' then exists (select 1 from public.student_card k where k.photo_path = path and private.acts_for(k.school_id, k.student_id, true))
        when 'family' then exists (select 1 from public.family_person f where f.photo_path = path and f.guardian_id = private.me())
        when 'terms' then exists (select 1 from public.terms t where t.file_path = path and private.is_director(t.school_id))
        when 'logo' then exists (select 1 from public.school s where s.logo_path = path) and private.is_platform_admin()
        when 'teacher-payments' then exists (select 1 from public.teacher_payment p where p.receipt_path = path and p.recorded_by = private.me())
        else split_part(path, '/', 1) = 'staff' and split_part(path, '/', 2) = private.me()::text
             and exists (select 1 from public.staff_card c where c.photo_path = path and c.person_id = private.me())
    end
$$;
