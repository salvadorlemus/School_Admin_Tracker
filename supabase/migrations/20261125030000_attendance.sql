-- Attendance: by QR check-in (rule 6) or by hand (rule 7), and nobody can write it any other way.
--
-- One QR per session: its code changes every 30 seconds and is made from the session's secret. A
-- student scans it with their own phone (a guardian picks which of their minors are there); the
-- database checks the code against its own clock, the time window, that each student takes the
-- class and has accepted the terms, and records it. Every record says who recorded it and when.

create type attendance_kind as enum ('student', 'guest_teacher');
create type attendance_method as enum ('qr', 'teacher', 'director');

create table attendance (
    id             uuid primary key default gen_random_uuid(),
    school_id      uuid not null references school on delete cascade,
    session_id     uuid not null references session on delete cascade,
    person_id      uuid not null references person,
    kind           attendance_kind not null default 'student',
    method         attendance_method not null,
    terms_pending  boolean not null default false,
    created_by     uuid references person,
    created_at     timestamptz not null default now(),
    unique (session_id, person_id)
);
create index on attendance (school_id, created_at);
create index on attendance (person_id);

create type attendance_change as enum ('removed', 'corrected');

/** Every removal or correction by a director: the old and new values, who and when (rule 7). */
create table attendance_log (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    session_id  uuid not null references session on delete cascade,
    person_id   uuid not null references person,
    change      attendance_change not null,
    old_value   jsonb,
    new_value   jsonb,
    created_by  uuid references person,
    created_at  timestamptz not null default now()
);

-- A session with attendance never changes when its schedule is edited.
create or replace function private.session_has_records(session uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.attendance where session_id = session)
$$;

/** Whether the student has accepted the school's latest terms (redefined once terms exist). */
create or replace function private.terms_ok(school uuid, student uuid) returns boolean
    language sql stable as $$ select true $$;

/** Whether a student may come to a session: they take its class (enrolled or by package), or booked it. */
create or replace function private.may_attend(student uuid, s public.session) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.takes_class(student, s.class_id, (s.starts_at at time zone sc.time_zone)::date)
        or exists (select 1 from public.booking b where b.student_id = student and b.session_id = s.id)
    from public.school sc where sc.id = s.school_id
$$;

/**
 * Checks in with the code on the teacher's phone. `students` is who's there: empty for the person
 * themselves, or the guardian's minors. Returns the session and a result per person:
 * ok, already, not_enrolled, terms_pending, not_yours. The whole scan can fail first with
 * code (no session has that code), too_early or too_late.
 */
create or replace function public.check_in(code text, students uuid[] default '{}') returns jsonb
    language plpgsql security definer set search_path = '' as $$
declare
    me uuid := private.me();
    step bigint := floor(extract(epoch from now()) / 30)::bigint;
    s public.session;
    who uuid;
    results jsonb := '[]';
    outcome text;
    guest boolean;
begin
    -- The session whose code this is, now or 30 seconds ago, among the scanner's schools.
    select x.* into s from public.session x
    where x.school_id in (select private.my_schools()) and x.status = 'scheduled'
      and x.starts_at between now() - interval '1 day' and now() + interval '1 day'
      and upper(code) in (private.code_at(x.id, step), private.code_at(x.id, step - 1))
    limit 1;
    if s.id is null then
        return jsonb_build_object('status', 'code');
    end if;
    if now() < s.starts_at - interval '10 minutes' then
        return jsonb_build_object('status', 'too_early', 'session_id', s.id, 'opens_at', s.starts_at - interval '10 minutes');
    end if;
    if now() > s.starts_at + interval '30 minutes' then
        return jsonb_build_object('status', 'too_late', 'session_id', s.id);
    end if;

    -- An active teacher of the school scanning for themselves: a guest teacher (rule 16).
    guest := cardinality(students) = 0 and private.is_member(s.school_id, '{teacher}')
        and me <> s.teacher_id and me is distinct from s.substitute_id;
    if guest then
        insert into public.attendance (school_id, session_id, person_id, kind, method, created_by)
        values (s.school_id, s.id, me, 'guest_teacher', 'qr', me) on conflict (session_id, person_id) do nothing;
        return jsonb_build_object('status', 'ok', 'session_id', s.id, 'results', jsonb_build_array(jsonb_build_object('person_id', me, 'result', 'guest')));
    end if;

    foreach who in array case when cardinality(students) = 0 then array[me] else students end loop
        if not private.acts_for(s.school_id, who) then
            outcome := 'not_yours';
        elsif exists (select 1 from public.attendance where session_id = s.id and person_id = who) then
            outcome := 'already';
        elsif not private.may_attend(who, s) then
            outcome := 'not_enrolled';
        elsif not private.terms_ok(s.school_id, who) then
            outcome := 'terms_pending';
        else
            insert into public.attendance (school_id, session_id, person_id, method, created_by)
            values (s.school_id, s.id, who, 'qr', me);
            outcome := 'ok';
        end if;
        results := results || jsonb_build_object('person_id', who, 'result', outcome);
    end loop;
    return jsonb_build_object('status', 'ok', 'session_id', s.id, 'results', results);
end $$;

/**
 * Adds attendance by hand: the session's teacher (or substitute) up to 1 hour after it ends, a
 * director at any time. A student whose terms are pending is recorded, flagged (rule 7).
 */
create or replace function public.add_attendance(session_id uuid, students uuid[]) returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session;
    by_director boolean;
    who uuid;
    added integer := 0;
begin
    select * into s from public.session where id = session_id;
    if s.id is null then
        raise exception 'No such session' using errcode = '22023';
    end if;
    by_director := private.is_director(s.school_id);
    if not by_director and not (private.is_member(s.school_id, '{teacher}') and private.me() = coalesce(s.substitute_id, s.teacher_id)) then
        raise exception 'Only the session''s teacher and the school''s directors add attendance' using errcode = '42501';
    end if;
    if not by_director and (now() > s.ends_at + interval '1 hour' or now() < s.starts_at - interval '10 minutes') then
        raise exception 'A teacher adds attendance up to 1 hour after the session ends' using errcode = 'P0001';
    end if;
    foreach who in array students loop
        if not exists (select 1 from public.membership where school_id = s.school_id and person_id = who and role = 'student' and status <> 'invited') then
            raise exception 'Only the school''s students are added' using errcode = '23514';
        end if;
        insert into public.attendance (school_id, session_id, person_id, method, terms_pending, created_by)
        values (s.school_id, s.id, who, case when by_director then 'director' else 'teacher' end::public.attendance_method,
                not private.terms_ok(s.school_id, who), private.me())
        on conflict on constraint attendance_session_id_person_id_key do nothing;
        if found then added := added + 1; end if;
    end loop;
    return added;
end $$;

/** A director removes a record, kept in the log. */
create or replace function public.remove_attendance(attendance_id uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    a public.attendance;
begin
    select * into a from public.attendance where id = attendance_id;
    if a.id is null or not private.is_director(a.school_id) then
        raise exception 'Only the school''s directors remove attendance' using errcode = '42501';
    end if;
    delete from public.attendance where id = a.id;
    insert into public.attendance_log (school_id, session_id, person_id, change, old_value, created_by)
    values (a.school_id, a.session_id, a.person_id, 'removed', to_jsonb(a) - 'school_id', private.me());
end $$;

/** A director corrects whose record it is (or whether it was a guest teacher), kept in the log. */
create or replace function public.correct_attendance(attendance_id uuid, person uuid, kind public.attendance_kind) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    a public.attendance;
begin
    select * into a from public.attendance where id = attendance_id;
    if a.id is null or not private.is_director(a.school_id) then
        raise exception 'Only the school''s directors correct attendance' using errcode = '42501';
    end if;
    update public.attendance x set person_id = correct_attendance.person, kind = correct_attendance.kind where x.id = a.id;
    insert into public.attendance_log (school_id, session_id, person_id, change, old_value, new_value, created_by)
    values (a.school_id, a.session_id, correct_attendance.person, 'corrected',
            jsonb_build_object('person_id', a.person_id, 'kind', a.kind),
            jsonb_build_object('person_id', correct_attendance.person, 'kind', correct_attendance.kind), private.me());
end $$;

-- ---- Policies: directors see all; a teacher their sessions'; a student (or guardian) their own ----

alter table attendance enable row level security;
alter table attendance_log enable row level security;

create policy "who sees attendance" on attendance for select to authenticated
    using (private.is_director(school_id)
        or private.acts_for(school_id, person_id)
        or person_id = private.me()
        or exists (select 1 from session s where s.id = session_id and private.is_member(s.school_id, '{teacher}')
                   and private.me() in (s.teacher_id, s.substitute_id)));
-- No insert, update or delete grants: attendance is written only by the functions above.

create policy "directors read attendance changes" on attendance_log for select to authenticated
    using (private.is_director(school_id));

grant select on attendance, attendance_log to authenticated;
grant execute on function public.check_in(text, uuid[]), public.add_attendance(uuid, uuid[]),
    public.remove_attendance(uuid), public.correct_attendance(uuid, uuid, attendance_kind) to authenticated;
