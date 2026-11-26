-- Rooms, classes, their weekly schedules, and the sessions generated from them.
--
-- A session is a real row for each time a class is given (start and end as timestamptz, in the
-- school's time zone), so attendance, substitutes and cancellations always point at one. Weekly
-- classes generate theirs from the schedule; free hours are set one by one by the director.
-- Changes to sessions (cancel, move, substitute, change teacher, end a class) go through the
-- functions below, which keep `session_log` (rule 17).

create type class_kind as enum ('weekly', 'free');
create type session_status as enum ('scheduled', 'cancelled');

/** A room the director names (rule 9): never deleted, archived; capacity is optional and only warns. */
create table room (
    id               uuid primary key default gen_random_uuid(),
    school_id        uuid not null references school on delete cascade,
    name             text not null check (length(btrim(name)) between 1 and 200),
    classes_at_once  smallint check (classes_at_once > 0),
    max_students     smallint check (max_students > 0),
    archived_at      timestamptz,
    created_at       timestamptz not null default now()
);
create index on room (school_id);

create table class (
    id               uuid primary key default gen_random_uuid(),
    school_id        uuid not null references school on delete cascade,
    name             text not null check (length(btrim(name)) between 1 and 200),
    teacher_id       uuid not null references person,
    kind             class_kind not null default 'weekly',
    /** Once full, no one else can enroll or book (rule 4); for free hours, the attendants. */
    max_students     smallint check (max_students > 0),
    for_kids         boolean not null default false,
    /** How students can pay for it: a monthly plan (up to so many sessions a month) and/or per visit. */
    monthly_sessions smallint check (monthly_sessions > 0),
    per_visit        boolean not null default true,
    /** Ended by the director on this day (its last session): no enrollments after it. */
    ends_on          date,
    created_by       uuid references person,
    created_at       timestamptz not null default now()
);
create index on class (school_id);

/** A weekly class's slot: a weekday, its hours, its dates and its room. */
create table schedule (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    class_id    uuid not null references class on delete cascade,
    weekday     smallint not null check (weekday between 1 and 7),  -- 1 Monday ... 7 Sunday
    start_time  time not null,
    end_time    time not null,
    first_date  date not null,
    last_date   date not null,
    room_id     uuid not null references room,
    check (end_time > start_time),
    check (last_date >= first_date)
);
create index on schedule (class_id);

create table session (
    id             uuid primary key default gen_random_uuid(),
    school_id      uuid not null references school on delete cascade,
    class_id       uuid not null references class on delete cascade,
    schedule_id    uuid references schedule on delete set null,
    room_id        uuid not null references room,
    starts_at      timestamptz not null,
    ends_at        timestamptz not null,
    status         session_status not null default 'scheduled',
    /** Who gives it: the class's teacher when it was generated, or the one it changed to from a date. */
    teacher_id     uuid not null references person,
    substitute_id  uuid references person,
    /** A replacement session points at the cancelled one it replaces (this is also how a session moves). */
    replaces_id    uuid unique references session,
    check (ends_at > starts_at),
    check (substitute_id is distinct from teacher_id),
    unique (schedule_id, starts_at)
);
create index on session (school_id, starts_at);
create index on session (class_id, starts_at);

/** Each session's check-in secret, in its own table so no student can ever read it (rule 6). */
create table session_secret (
    session_id  uuid primary key references session on delete cascade,
    secret      bytea not null default extensions.gen_random_bytes(20)
);

create type session_change as enum ('cancelled', 'moved', 'substitute', 'substitute_removed', 'teacher', 'ended');

/** Every cancellation, move, substitute and teacher change: what, who, when (rule 17). */
create table session_log (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    class_id    uuid not null references class on delete cascade,
    session_id  uuid references session on delete cascade,
    change      session_change not null,
    old_value   jsonb,
    new_value   jsonb,
    created_by  uuid references person,
    created_at  timestamptz not null default now()
);
create index on session_log (school_id, created_at desc);

-- ---- Consistency: everything points into its own school ----

create or replace function private.same_school() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    teacher uuid;
begin
    if tg_table_name = 'class' then
        teacher := new.teacher_id;
    elsif tg_table_name = 'schedule' then
        if not exists (select 1 from public.class where id = new.class_id and school_id = new.school_id and kind = 'weekly')
            or not exists (select 1 from public.room where id = new.room_id and school_id = new.school_id) then
            raise exception 'The class and the room must be this school''s, and the class weekly' using errcode = '23514';
        end if;
        return new;
    elsif tg_table_name = 'session' then
        if not exists (select 1 from public.class where id = new.class_id and school_id = new.school_id)
            or not exists (select 1 from public.room where id = new.room_id and school_id = new.school_id) then
            raise exception 'The class and the room must be this school''s' using errcode = '23514';
        end if;
        teacher := coalesce(new.substitute_id, new.teacher_id);
        if new.substitute_id is not null and not exists (select 1 from public.membership where school_id = new.school_id
                and person_id = new.substitute_id and role = 'teacher' and status = 'active') then
            raise exception 'A substitute must be an active teacher of the school' using errcode = '23514';
        end if;
        teacher := new.teacher_id;
    end if;
    if not exists (select 1 from public.membership where school_id = new.school_id and person_id = teacher
                   and role = 'teacher' and status = 'active') then
        raise exception 'The teacher must be an active teacher of the school' using errcode = '23514';
    end if;
    return new;
end $$;

create trigger class_same_school before insert or update of school_id, teacher_id on class
    for each row execute function private.same_school();
create trigger schedule_same_school before insert or update on schedule
    for each row execute function private.same_school();
create trigger session_same_school before insert or update of school_id, class_id, room_id, teacher_id, substitute_id on session
    for each row execute function private.same_school();

/** A room with sessions ahead can't be archived until they move (rule 9). */
create or replace function private.room_archive() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.archived_at is not null and old.archived_at is null and exists (
        select 1 from public.session where room_id = new.id and status = 'scheduled' and starts_at > now()) then
        raise exception 'This room has sessions ahead: move them first' using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger room_archive before update of archived_at on room
    for each row execute function private.room_archive();

-- ---- Generating sessions from a schedule ----

/** Whether a session has anything recorded that must never change (attendance; redefined when it exists). */
create or replace function private.session_has_records(session uuid) returns boolean
    language sql stable as $$ select false $$;

/** Creates the schedule's sessions from a date on (in the school's time zone), skipping ones that exist. */
create or replace function private.generate_sessions(slot uuid, since date) returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    s record;
    zone text;
    teacher uuid;
    ends date;
    day date;
    made integer := 0;
begin
    select * into s from public.schedule where id = slot;
    select time_zone into zone from public.school where id = s.school_id;
    select teacher_id, ends_on into teacher, ends from public.class where id = s.class_id;
    day := greatest(s.first_date, since);
    while day <= least(s.last_date, coalesce(ends, s.last_date)) loop
        if extract(isodow from day) = s.weekday then
            insert into public.session (school_id, class_id, schedule_id, room_id, starts_at, ends_at, teacher_id)
            values (s.school_id, s.class_id, s.id, s.room_id, (day + s.start_time) at time zone zone,
                    (day + s.end_time) at time zone zone, teacher)
            on conflict (schedule_id, starts_at) do nothing;
            if found then made := made + 1; end if;
        end if;
        day := day + 1;
    end loop;
    return made;
end $$;

/** Today in a school's time zone. */
create or replace function private.school_today(school uuid) returns date
    language sql stable security definer set search_path = '' as $$
    select (now() at time zone time_zone)::date from public.school where id = school_today.school
$$;

/**
 * A schedule saved: its sessions from today on are regenerated (the ones not given yet, without
 * attendance and not moved or cancelled by hand); past sessions never change.
 */
create or replace function private.schedule_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    since date := private.school_today(new.school_id);
begin
    if tg_op = 'UPDATE' and (new.weekday, new.start_time, new.end_time, new.room_id, new.first_date)
        is not distinct from (old.weekday, old.start_time, old.end_time, old.room_id, old.first_date) then
        -- Only its last day moved: the sessions after it go (those with nothing recorded), the missing ones before it are made.
        delete from public.session x
        where x.schedule_id = new.id and (x.starts_at at time zone (select time_zone from public.school where id = new.school_id))::date > new.last_date
          and not private.session_has_records(x.id);
        perform private.generate_sessions(new.id, greatest(new.first_date, since));
        return new;
    end if;
    if tg_op = 'UPDATE' then
        delete from public.session x
        where x.schedule_id = new.id and x.starts_at > now() and x.status = 'scheduled'
          and x.substitute_id is null and not private.session_has_records(x.id)
          and not exists (select 1 from public.session r where r.replaces_id = x.id);
    end if;
    perform private.generate_sessions(new.id, greatest(new.first_date, since));
    return new;
end $$;

create trigger schedule_saved after insert or update on schedule
    for each row execute function private.schedule_saved();

/** Every session gets its secret. */
create or replace function private.session_created() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    insert into public.session_secret (session_id) values (new.id);
    return new;
end $$;

create trigger session_created after insert on session
    for each row execute function private.session_created();

-- ---- Changing sessions: each change logged (rule 17) ----

create or replace function private.log_change(s public.session, what public.session_change, old_value jsonb, new_value jsonb) returns void
    language sql security definer set search_path = '' as $$
    insert into public.session_log (school_id, class_id, session_id, change, old_value, new_value, created_by)
    values (s.school_id, s.class_id, s.id, what, old_value, new_value, private.me())
$$;

create or replace function private.director_session(session_id uuid) returns public.session
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session;
begin
    select * into s from public.session where id = session_id for update;
    if s.id is null or not private.is_director(s.school_id) then
        raise exception 'Only the school''s directors change sessions' using errcode = '42501';
    end if;
    if s.ends_at <= now() then
        raise exception 'A session that''s over only offers its attendance' using errcode = 'P0001';
    end if;
    return s;
end $$;

/** Cancels a session (no make-up). */
create or replace function public.cancel_session(session_id uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session := private.director_session(session_id);
begin
    if s.status = 'cancelled' then return; end if;
    update public.session set status = 'cancelled' where id = s.id;
    perform private.log_change(s, 'cancelled', null, null);
end $$;

/** Moves a session: a cancellation with its linked replacement at the new time or room. Returns the replacement. */
create or replace function public.move_session(session_id uuid, new_start timestamptz, new_end timestamptz, new_room uuid) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session := private.director_session(session_id);
    replacement uuid;
begin
    if s.status = 'cancelled' then
        raise exception 'This session is already cancelled' using errcode = 'P0001';
    end if;
    update public.session set status = 'cancelled' where id = s.id;
    insert into public.session (school_id, class_id, room_id, starts_at, ends_at, teacher_id, substitute_id, replaces_id)
    values (s.school_id, s.class_id, new_room, new_start, new_end, s.teacher_id, s.substitute_id, s.id)
    returning id into replacement;
    perform private.log_change(s, 'moved', jsonb_build_object('starts_at', s.starts_at, 'room_id', s.room_id),
                               jsonb_build_object('starts_at', new_start, 'room_id', new_room, 'session_id', replacement));
    return replacement;
end $$;

/** Gives a session to a substitute without moving it, or (null) back to its teacher. */
create or replace function public.set_substitute(session_id uuid, substitute uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session := private.director_session(session_id);
begin
    if s.substitute_id is not distinct from substitute then return; end if;
    update public.session set substitute_id = substitute where id = s.id;
    perform private.log_change(s, case when substitute is null then 'substitute_removed' else 'substitute' end::public.session_change,
                               jsonb_build_object('person_id', s.substitute_id), jsonb_build_object('person_id', substitute));
end $$;

/** Changes a class's teacher from one of its sessions on: that session and the later ones. */
create or replace function public.change_teacher(class_id uuid, from_session uuid, teacher uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session := private.director_session(from_session);
    old_teacher uuid;
begin
    if s.class_id <> change_teacher.class_id then
        raise exception 'The session isn''t this class''s' using errcode = '22023';
    end if;
    select c.teacher_id into old_teacher from public.class c where c.id = change_teacher.class_id;
    update public.class c set teacher_id = teacher where c.id = change_teacher.class_id;
    update public.session x set teacher_id = teacher,
        substitute_id = case when x.substitute_id = teacher then null else x.substitute_id end
    where x.class_id = change_teacher.class_id and x.starts_at >= s.starts_at;
    perform private.log_change(s, 'teacher', jsonb_build_object('person_id', old_teacher), jsonb_build_object('person_id', teacher));
end $$;

/**
 * Ends a class on one of its sessions: the later ones come off the calendar (past sessions and
 * attendance stay), and it takes no enrollments after that day.
 */
create or replace function public.end_class(class_id uuid, last_session uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session := private.director_session(last_session);
    last_day date;
begin
    if s.class_id <> end_class.class_id then
        raise exception 'The session isn''t this class''s' using errcode = '22023';
    end if;
    select (s.starts_at at time zone time_zone)::date into last_day from public.school where id = s.school_id;
    delete from public.session x where x.class_id = end_class.class_id and x.starts_at > s.starts_at
        and not private.session_has_records(x.id);
    update public.class c set ends_on = last_day where c.id = end_class.class_id;
    update public.schedule sc set last_date = least(sc.last_date, last_day) where sc.class_id = end_class.class_id;
    perform private.log_change(s, 'ended', null, jsonb_build_object('last_day', last_day));
end $$;

/** Free hours: the director sets each session by hand. */
create or replace function public.add_free_session(class_id uuid, starts timestamptz, ends timestamptz, room uuid) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    c public.class;
    made uuid;
begin
    select * into c from public.class where id = add_free_session.class_id;
    if c.id is null or not private.is_director(c.school_id) then
        raise exception 'Only the school''s directors add free hours' using errcode = '42501';
    end if;
    if c.kind <> 'free' then
        raise exception 'Only a free-hours class takes sessions by hand' using errcode = '22023';
    end if;
    insert into public.session (school_id, class_id, room_id, starts_at, ends_at, teacher_id)
    values (c.school_id, c.id, room, starts, ends, c.teacher_id) returning id into made;
    return made;
end $$;

-- ---- The check-in code: from the session's secret and the time, every 30 seconds (rule 6) ----

create or replace function private.code_at(session_id uuid, step bigint) returns text
    language sql stable security definer set search_path = '' as $$
    select upper(substr(encode(extensions.hmac(convert_to(step::text, 'UTF8'), secret, 'sha256'::text), 'hex'), 1, 10))
    from public.session_secret where session_id = code_at.session_id
$$;

/** The session's current code, for its teacher, its substitute and the school's directors only. */
create or replace function public.session_code(session_id uuid) returns text
    language plpgsql stable security definer set search_path = '' as $$
declare
    s public.session;
begin
    select * into s from public.session where id = session_id;
    if s.id is null or not (private.is_director(s.school_id)
        or (private.is_member(s.school_id, '{teacher}') and private.me() in (s.teacher_id, s.substitute_id))) then
        raise exception 'Only the session''s teacher and the school''s directors see its code' using errcode = '42501';
    end if;
    return private.code_at(s.id, floor(extract(epoch from now()) / 30)::bigint);
end $$;

-- ---- Policies ----

alter table room enable row level security;
alter table class enable row level security;
alter table schedule enable row level security;
alter table session enable row level security;
alter table session_secret enable row level security;
alter table session_log enable row level security;

create policy "members read rooms" on room for select to authenticated using (private.is_member(school_id));
create policy "directors add rooms" on room for insert to authenticated with check (private.is_director(school_id));
create policy "directors change rooms" on room for update to authenticated
    using (private.is_director(school_id)) with check (private.is_director(school_id));

create policy "members read classes" on class for select to authenticated using (private.is_member(school_id));
create policy "directors add classes" on class for insert to authenticated with check (private.is_director(school_id));
create policy "directors change classes" on class for update to authenticated
    using (private.is_director(school_id)) with check (private.is_director(school_id));

create policy "members read schedules" on schedule for select to authenticated using (private.is_member(school_id));
create policy "directors add schedules" on schedule for insert to authenticated with check (private.is_director(school_id));
create policy "directors change schedules" on schedule for update to authenticated
    using (private.is_director(school_id)) with check (private.is_director(school_id));
create policy "directors remove schedules" on schedule for delete to authenticated using (private.is_director(school_id));

create policy "members read sessions" on session for select to authenticated using (private.is_member(school_id));
-- No direct writes: sessions change through the functions above, which log each change.

create policy "directors read the change log" on session_log for select to authenticated using (private.is_director(school_id));

-- ---- Privileges ----

grant select on room, class, schedule, session, session_log to authenticated;
grant insert (id, school_id, name, classes_at_once, max_students) on room to authenticated;
grant update (name, classes_at_once, max_students, archived_at) on room to authenticated;
grant insert (id, school_id, name, teacher_id, kind, max_students, for_kids, monthly_sessions, per_visit) on class to authenticated;
grant update (name, max_students, for_kids, monthly_sessions, per_visit) on class to authenticated;
grant insert (id, school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id) on schedule to authenticated;
grant update (weekday, start_time, end_time, last_date, room_id) on schedule to authenticated;
grant delete on schedule to authenticated;

grant execute on function public.cancel_session(uuid), public.move_session(uuid, timestamptz, timestamptz, uuid),
    public.set_substitute(uuid, uuid), public.change_teacher(uuid, uuid, uuid), public.end_class(uuid, uuid),
    public.add_free_session(uuid, timestamptz, timestamptz, uuid), public.session_code(uuid) to authenticated;

create trigger class_stamp before insert on class for each row execute function private.stamp_by();
