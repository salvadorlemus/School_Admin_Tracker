-- The notices board (rule 23) and personal notices (rule 11).
--
-- The database posts schedule changes and price changes by itself; teachers post notes for their
-- classes and directors for a class or the whole school. Posts are never edited (a correction is a
-- new post) and leave the board on their own, unless a director keeps one. Personal notices go to
-- one person; the ones about a student's payments are also emailed (by an Edge Function, later),
-- to the guardian for a minor. Emails never carry card or health content.

create type announcement_kind as enum ('cancelled', 'moved', 'substitute', 'substitute_removed', 'teacher', 'ended', 'price', 'note');

create table announcement (
    id             uuid primary key default gen_random_uuid(),
    school_id      uuid not null references school on delete cascade,
    /** The class it's about, by id (two classes can share a name); none for the whole school. */
    class_id       uuid references class on delete cascade,
    session_id     uuid references session on delete cascade,
    price_id       uuid references price on delete cascade,
    kind           announcement_kind not null,
    important      boolean not null default false,
    body           text check (length(body) <= 4000),
    /** What changed, as data (dates, names, amounts): the app writes it in the reader's language. */
    vars           jsonb not null default '{}',
    /** The last day it shows; null once a director keeps it. */
    visible_until  date,
    created_by     uuid references person,
    created_at     timestamptz not null default now(),
    check (kind <> 'note' or length(btrim(body)) > 0)
);
create index on announcement (school_id, created_at desc);

create table notification (
    id          uuid primary key default gen_random_uuid(),
    person_id   uuid not null references person on delete cascade,
    school_id   uuid not null references school on delete cascade,
    kind        text not null,
    vars        jsonb not null default '{}',
    /** About a student's payments or account: also emailed, once (`emailed_at`). */
    email       boolean not null default false,
    emailed_at  timestamptz,
    read_at     timestamptz,
    created_at  timestamptz not null default now()
);
create index on notification (person_id, created_at desc);
create index on notification (emailed_at) where email and emailed_at is null;

-- ---- Sending ----

create or replace function private.notify(person uuid, school uuid, kind text, vars jsonb default '{}', email boolean default false) returns void
    language sql security definer set search_path = '' as $$
    insert into public.notification (person_id, school_id, kind, vars, email) values (person, school, kind, vars, email)
$$;

/** A notice for a student: to them, or to their guardians when they're a minor. */
create or replace function private.notify_student(school uuid, student uuid, kind text, vars jsonb default '{}', email boolean default false) returns void
    language sql security definer set search_path = '' as $$
    insert into public.notification (person_id, school_id, kind, vars, email)
    select who, school, kind, vars || jsonb_build_object('student_id', student), email from (
        select m.person_id as who from public.membership m
        where m.school_id = school and m.person_id = student and m.role = 'student' and not m.minor and m.status <> 'inactive'
        union
        select g.guardian_id from public.guardian_link g join public.membership m on m.school_id = g.school_id and m.person_id = g.student_id
        where g.school_id = school and g.student_id = student and m.minor) recipients
$$;

/** A notice for the school's active directors. */
create or replace function private.notify_directors(school uuid, kind text, vars jsonb default '{}') returns void
    language sql security definer set search_path = '' as $$
    insert into public.notification (person_id, school_id, kind, vars)
    select person_id, school, kind, vars from public.membership where school_id = school and role = 'director' and status = 'active'
$$;

-- ---- The database posts schedule changes, and tells the students they touch ----

create or replace function private.post_session_change() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session;
    zone text;
    until date;
    vars jsonb;
begin
    select * into s from public.session where id = new.session_id;
    select time_zone into zone from public.school where id = new.school_id;
    -- It leaves the board the day after its session; a teacher change, a week after it applies.
    until := (s.starts_at at time zone zone)::date + case when new.change = 'teacher' then 7 else 1 end;
    vars := jsonb_build_object('starts_at', s.starts_at) || coalesce(new.new_value, '{}');
    insert into public.announcement (school_id, class_id, session_id, kind, vars, visible_until, created_by)
    values (new.school_id, new.class_id, new.session_id, new.change::text::public.announcement_kind, vars, until, new.created_by);
    -- In-app only: schedule changes are never emailed.
    perform private.notify_student(new.school_id, who, 'schedule_' || new.change::text, vars || jsonb_build_object('class_id', new.class_id))
    from (select e.student_id as who from public.enrollment e where e.class_id = new.class_id and (e.ends_on is null or e.ends_on >= current_date)
          union select sp.student_id from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
                where oc.class_id = new.class_id and (sp.ends_on is null or sp.ends_on >= current_date)
          union select b.student_id from public.booking b where b.session_id = new.session_id) touched;
    return new;
end $$;

create trigger post_session_change after insert on session_log
    for each row execute function private.post_session_change();

/** Every price change is posted, marked important, and leaves the board 30 days after it applies. */
create or replace function private.post_price() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    before numeric := (select p.amount from public.price p where p.school_id = new.school_id and p.kind = new.kind and p.id <> new.id
                       and p.class_id is not distinct from new.class_id and p.offer_id is not distinct from new.offer_id
                       and p.attendants is not distinct from new.attendants
                       order by p.starts_on desc, p.created_at desc limit 1);
begin
    if new.created_by is null then return new; end if;  -- history loaded by the database itself
    insert into public.announcement (school_id, class_id, price_id, kind, important, vars, visible_until, created_by)
    values (new.school_id, new.class_id, new.id, 'price', true,
            jsonb_build_object('from', before, 'to', new.amount, 'starts_on', new.starts_on, 'price_kind', new.kind, 'offer_id', new.offer_id),
            new.starts_on + 30, new.created_by);
    return new;
end $$;

create trigger post_price after insert on price
    for each row execute function private.post_price();

/** Notes: stamped, and 30 days on the board. */
create or replace function private.note_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    new.kind := 'note';
    new.important := false;
    new.session_id := null;
    new.price_id := null;
    new.vars := '{}';
    new.visible_until := private.school_today(new.school_id) + 30;
    new.created_by := private.me();
    new.created_at := now();
    return new;
end $$;

create trigger note_saved before insert on announcement
    for each row when (private.me() is not null and new.kind = 'note') execute function private.note_saved();

/** A director keeps a post on the board past its usual time. */
create or replace function public.keep_announcement(announcement_id uuid, keep boolean default true) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    a public.announcement;
begin
    select * into a from public.announcement where id = announcement_id;
    if a.id is null or not private.is_director(a.school_id) then
        raise exception 'Only the school''s directors keep posts' using errcode = '42501';
    end if;
    update public.announcement set visible_until = case when keep then null else greatest(private.school_today(a.school_id), coalesce(a.visible_until, private.school_today(a.school_id))) end
    where id = a.id;
end $$;

-- ---- Personal notices from the records ----

/** A screenshot decided: a cash one confirmed ("your payment was saved"), any one rejected. Emailed. */
create or replace function private.notify_proof() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.state = 'rejected' or (new.state = 'confirmed' and new.method = 'cash') then
        perform private.notify_student(new.school_id, new.student_id, 'proof_' || new.state::text,
            jsonb_build_object('proof_id', new.id, 'covers', new.covers, 'month', new.month, 'reason', new.reason), true);
    end if;
    return new;
end $$;

create trigger notify_proof after update of state on payment_proof
    for each row when (old.state is distinct from new.state) execute function private.notify_proof();

/** A fee owed again after months without paying: the student is told (emailed). */
create or replace function private.notify_fee() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.reason = 'lapsed' then
        perform private.notify_student(new.school_id, new.student_id, 'fee_owed', jsonb_build_object('fee_id', new.id, 'amount', new.amount), true);
    end if;
    perform private.notify_directors(new.school_id, 'fee_owed', jsonb_build_object('fee_id', new.id, 'student_id', new.student_id));
    return new;
end $$;

create trigger notify_fee after insert on registration_fee
    for each row execute function private.notify_fee();

/** The directors hear of each new enrollment and package, and of each card change. */
create or replace function private.notify_new_enrollment() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.notify_directors(new.school_id, 'new_enrollment',
        jsonb_build_object('student_id', new.student_id, case when tg_table_name = 'enrollment' then 'class_id' else 'package_id' end,
                           case when tg_table_name = 'enrollment' then to_jsonb(new) ->> 'class_id' else new.id::text end));
    return new;
end $$;

create trigger notify_enrollment after insert on enrollment for each row execute function private.notify_new_enrollment();
create trigger notify_package after insert on student_package for each row execute function private.notify_new_enrollment();

create or replace function private.notify_card_change() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.notify_directors(new.school_id, 'card_changed', jsonb_build_object('student_id', new.student_id, 'what', new.what));
    return new;
end $$;

create trigger notify_card_change after insert on student_card_log for each row execute function private.notify_card_change();

/** New terms: every current student (or guardian) must accept them again. Emailed with the PDF. */
create or replace function private.notify_terms() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.notify_student(new.school_id, m.person_id, 'new_terms', jsonb_build_object('terms_id', new.id, 'version', new.version), true)
    from public.membership m where m.school_id = new.school_id and m.role = 'student' and m.status = 'active';
    return new;
end $$;

create trigger notify_terms after insert on terms for each row execute function private.notify_terms();

/**
 * Over the plan: a monthly plan's sessions this calendar month, or a package's this week (Monday to
 * Sunday). It never stops anyone (rule 4): the student, the class's teacher and the directors are told.
 */
create or replace function private.notify_over_plan() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session;
    zone text;
    day date;
    used integer;
    allowed integer;
begin
    if new.kind <> 'student' then return new; end if;
    select * into s from public.session where id = new.session_id;
    select time_zone into zone from public.school where id = new.school_id;
    day := (s.starts_at at time zone zone)::date;
    -- A monthly plan for this class.
    select c.monthly_sessions into allowed from public.enrollment e join public.class c on c.id = e.class_id
    where e.student_id = new.person_id and e.class_id = s.class_id and e.how = 'monthly' and e.starts_on <= day and (e.ends_on is null or e.ends_on >= day);
    if allowed is not null then
        select count(*) into used from public.attendance a join public.session x on x.id = a.session_id
        where a.person_id = new.person_id and x.class_id = s.class_id and date_trunc('month', x.starts_at at time zone zone) = date_trunc('month', day);
    else
        -- A package covering it: this week's sessions at any of its classes.
        select sp.per_week into allowed from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
        where sp.student_id = new.person_id and oc.class_id = s.class_id and sp.starts_on <= day and (sp.ends_on is null or sp.ends_on >= day) limit 1;
        if allowed is null then return new; end if;
        select count(*) into used from public.attendance a join public.session x on x.id = a.session_id
        join public.student_package sp on sp.student_id = a.person_id join public.package_offer_class oc on oc.offer_id = sp.offer_id and oc.class_id = x.class_id
        where a.person_id = new.person_id and date_trunc('week', x.starts_at at time zone zone) = date_trunc('week', day)
          and sp.starts_on <= day and (sp.ends_on is null or sp.ends_on >= day);
    end if;
    if used > allowed then
        perform private.notify_student(new.school_id, new.person_id, 'over_plan', jsonb_build_object('used', used, 'allowed', allowed, 'class_id', s.class_id), true);
        perform private.notify(coalesce(s.substitute_id, s.teacher_id), new.school_id, 'over_plan',
            jsonb_build_object('student_id', new.person_id, 'used', used, 'allowed', allowed, 'class_id', s.class_id));
        perform private.notify_directors(new.school_id, 'over_plan', jsonb_build_object('student_id', new.person_id, 'used', used, 'allowed', allowed, 'class_id', s.class_id));
    end if;
    return new;
end $$;

create trigger notify_over_plan after insert on attendance for each row execute function private.notify_over_plan();

-- ---- Who reads a post (rule 23) ----

create or replace function private.can_read_announcement(a public.announcement) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.is_member(a.school_id) and (
        a.class_id is null
        or private.is_director(a.school_id)
        or exists (select 1 from public.class c where c.id = a.class_id and c.teacher_id = private.me())
        or exists (select 1 from public.session s where s.class_id = a.class_id and s.substitute_id = private.me())
        or exists (select 1 from public.enrollment e where e.class_id = a.class_id and private.acts_for(a.school_id, e.student_id))
        or exists (select 1 from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
                   where oc.class_id = a.class_id and private.acts_for(a.school_id, sp.student_id))
        or exists (select 1 from public.booking b where b.class_id = a.class_id and private.acts_for(a.school_id, b.student_id)))
$$;

alter table announcement enable row level security;
alter table notification enable row level security;

create policy "who reads a post" on announcement for select to authenticated using (private.can_read_announcement(announcement));
create policy "teachers post for their classes, directors for any" on announcement for insert to authenticated
    with check (kind = 'note' and (private.is_director(school_id)
        or (class_id is not null and private.is_member(school_id, '{teacher}')
            and exists (select 1 from class c where c.id = class_id and c.teacher_id = private.me()))));
-- Never edited: a correction is a new post. Directors keep one longer with keep_announcement.

create policy "your notices" on notification for select to authenticated using (person_id = private.me());
create policy "you mark yours as read" on notification for update to authenticated
    using (person_id = private.me()) with check (person_id = private.me());

grant select on announcement, notification to authenticated;
grant insert (id, school_id, class_id, kind, body) on announcement to authenticated;
grant update (read_at) on notification to authenticated;
grant execute on function public.keep_announcement(uuid, boolean), private.can_read_announcement(public.announcement) to authenticated;
