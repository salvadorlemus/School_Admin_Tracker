-- Lyra's core: schools, people, their memberships, and the one check every policy goes through.
--
-- Rule 1: RLS keeps each school to its own rows, and every policy asks the same question: does the
-- signed-in person hold an active membership in this school, and is the school enabled? The helpers
-- live in the `private` schema, which the API doesn't expose; policies call them.

create schema if not exists private;

-- Start from nothing: privileges are granted table by table, at the end of each migration.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

-- ---- Types ----

create type member_role as enum ('director', 'teacher', 'student', 'guardian');
create type member_status as enum ('invited', 'active', 'inactive');

-- ---- Tables ----

/** The owner's account(s): the admin panel. Never a school's students or records (rule 8). */
create table platform_admin (
    user_id uuid primary key references auth.users on delete cascade
);

create or replace function private.valid_time_zone(zone text) returns boolean
    language plpgsql immutable as $$
begin
    perform now() at time zone zone;
    return true;
exception when others then
    return false;
end $$;

create table school (
    id          uuid primary key default gen_random_uuid(),
    name        text not null check (length(btrim(name)) between 1 and 200),
    time_zone   text not null default 'America/Mexico_City' check (private.valid_time_zone(time_zone)),
    enabled     boolean not null default true,
    /** Calendar months without a payment after which a student owes the registration fee again (rule 15). */
    fee_months  smallint not null default 3 check (fee_months between 1 and 24),
    logo_path   text,
    created_at  timestamptz not null default now()
);

/**
 * A person, shared by all the schools they belong to. An adult has a login (`user_id`); a minor
 * student has none, and their guardian signs in for them. Their own name and phone are theirs to edit.
 */
create table person (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid unique references auth.users on delete set null,
    full_name   text not null check (length(btrim(full_name)) between 1 and 200),
    phone       text check (phone is null or length(phone) <= 40),
    created_at  timestamptz not null default now()
);

/**
 * A person's role in a school, and where they stand: invited, active, or inactive (kept, never
 * deleted: rule 2). One person can hold several, in several schools.
 */
create table membership (
    id              uuid primary key default gen_random_uuid(),
    school_id       uuid not null references school on delete cascade,
    person_id       uuid not null references person on delete cascade,
    role            member_role not null,
    status          member_status not null default 'invited',
    /** Students only: set by the director. */
    minor           boolean not null default false,
    /** Students only: their monthly plans are due on the 15th or the 30th (rule 12). */
    payment_day     smallint check (payment_day in (15, 30)),
    inactive_since  date,
    created_at      timestamptz not null default now(),
    unique (school_id, person_id, role),
    check (role = 'student' or (minor = false and payment_day is null)),
    check (role <> 'student' or payment_day is not null),
    check ((status = 'inactive') = (inactive_since is not null))
);
create index on membership (person_id);

/** Which minors a guardian answers for, at a school. */
create table guardian_link (
    school_id   uuid not null references school on delete cascade,
    guardian_id uuid not null references person on delete cascade,
    student_id  uuid not null references person on delete cascade,
    primary key (school_id, guardian_id, student_id),
    check (guardian_id <> student_id)
);
create index on guardian_link (student_id);

-- ---- The checks every policy uses ----

/** The signed-in person (null for the admin with no person, or nobody signed in). */
create or replace function private.me() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from public.person where user_id = auth.uid()
$$;

create or replace function private.is_platform_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.platform_admin where user_id = auth.uid())
$$;

/** An active membership of the signed-in person in an enabled school, with one of these roles (any when null). */
create or replace function private.is_member(school uuid, roles public.member_role[] default null) returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.membership m join public.school s on s.id = m.school_id
        where m.school_id = school and m.person_id = private.me() and m.status = 'active' and s.enabled
          and (roles is null or m.role = any (roles)))
$$;

create or replace function private.is_director(school uuid) returns boolean
    language sql stable as $$ select private.is_member(school, '{director}') $$;

create or replace function private.is_staff(school uuid) returns boolean
    language sql stable as $$ select private.is_member(school, '{director,teacher}') $$;

/**
 * Whether the signed-in person acts for this student at this school: the student themselves, or
 * their guardian. With `invited`, an invited membership counts too (registration: rule 1).
 */
create or replace function private.acts_for(school uuid, student uuid, invited boolean default false) returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.school s
        where s.id = school and s.enabled and (
            exists (select 1 from public.membership m
                    where m.school_id = school and m.person_id = student and m.role = 'student'
                      and student = private.me() and (m.status = 'active' or (invited and m.status = 'invited')))
            or exists (select 1 from public.guardian_link g join public.membership m
                           on m.school_id = g.school_id and m.person_id = g.guardian_id and m.role = 'guardian'
                       where g.school_id = school and g.student_id = student and g.guardian_id = private.me()
                         and (m.status = 'active' or (invited and m.status = 'invited')))))
$$;

/** The schools the signed-in person is an active member of (enabled ones). */
create or replace function private.my_schools() returns setof uuid
    language sql stable security definer set search_path = '' as $$
    select m.school_id from public.membership m join public.school s on s.id = m.school_id
    where m.person_id = private.me() and m.status = 'active' and s.enabled
$$;

/** Stamps who did it, from the session: never sent by the app. */
create or replace function private.stamp_by() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    new.created_by := private.me();
    new.created_at := now();
    return new;
end $$;

-- ---- Policies ----

alter table platform_admin enable row level security;
alter table school enable row level security;
alter table person enable row level security;
alter table membership enable row level security;
alter table guardian_link enable row level security;

create policy "admins read the admin list" on platform_admin for select to authenticated
    using (private.is_platform_admin());

-- Any membership shows the school (an invited person sees whom the invite is from; a disabled
-- school's people learn it's disabled, and nothing else, since every other table needs it enabled).
create policy "members and the admin read the school" on school for select to authenticated
    using (private.is_platform_admin()
        or exists (select 1 from membership m where m.school_id = school.id and m.person_id = private.me()));

create policy "directors edit their school" on school for update to authenticated
    using (private.is_director(id)) with check (private.is_director(id));

create policy "the admin edits schools" on school for update to authenticated
    using (private.is_platform_admin()) with check (private.is_platform_admin());

-- People: yourself; whoever shares an active school with you as staff, or as their staff; your
-- minors; and, for the admin, the schools' directors (to call or write to them).
/**
 * Whom the signed-in person may see: themselves; anyone in a school where they're staff; the staff of
 * their own schools; their minors; and, for the admin, the schools' directors (to call or write to them).
 * Security definer: it reads memberships the person couldn't read themselves.
 */
create or replace function private.can_see_person(p uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select p = private.me()
        or exists (select 1 from public.membership theirs
                   where theirs.person_id = p
                     and (private.is_staff(theirs.school_id)
                          or (theirs.role in ('director', 'teacher') and theirs.status = 'active' and private.is_member(theirs.school_id))))
        or exists (select 1 from public.guardian_link g where g.student_id = p and g.guardian_id = private.me())
        or (private.is_platform_admin() and exists (select 1 from public.membership d where d.person_id = p and d.role = 'director'))
$$;

create policy "people you share a school with" on person for select to authenticated
    using (private.can_see_person(id));

create policy "your own name and phone" on person for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "your memberships, and your school's for its staff" on membership for select to authenticated
    using (person_id = private.me() or private.is_staff(school_id)
        -- A guardian sees their minors' (registration, payment day).
        or (role = 'student' and private.acts_for(school_id, person_id, true))
        or (private.is_platform_admin() and role = 'director'));

create policy "directors change memberships" on membership for update to authenticated
    using (private.is_director(school_id)) with check (private.is_director(school_id));

create policy "guardians, their minors, and staff" on guardian_link for select to authenticated
    using (guardian_id = private.me() or private.is_staff(school_id));

create policy "directors link guardians" on guardian_link for insert to authenticated
    with check (private.is_director(school_id));

create policy "directors unlink guardians" on guardian_link for delete to authenticated
    using (private.is_director(school_id));

-- ---- Rules on schools ----

/** The admin runs a school's details and enables it; its directors only set the registration fee's months (Prices). */
create or replace function private.school_change() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_platform_admin() and (new.name, new.time_zone, new.enabled, new.logo_path)
        is distinct from (old.name, old.time_zone, old.enabled, old.logo_path) then
        raise exception 'Only the platform admin changes a school''s details' using errcode = '42501';
    end if;
    return new;
end $$;

create trigger school_change before update on school
    for each row execute function private.school_change();

-- ---- Rules on memberships ----

/**
 * Unregistering keeps the person (rule 2); a director can't take away their own directorship, so a
 * school always keeps one. Becoming inactive stamps the day; coming back clears it.
 */
create or replace function private.membership_change() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.status = 'inactive' and old.status <> 'inactive' then
        new.inactive_since := current_date;
        if old.role = 'director' and old.person_id = private.me() then
            raise exception 'A director can''t deactivate themselves' using errcode = 'P0001';
        end if;
    elsif new.status <> 'inactive' then
        new.inactive_since := null;
    end if;
    if new.minor <> old.minor and old.role <> 'student' then
        raise exception 'Only a student can be a minor' using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger membership_change before update on membership
    for each row execute function private.membership_change();

-- ---- Privileges ----

grant select on platform_admin, school, person, membership, guardian_link to authenticated;
grant update (name, time_zone, fee_months, logo_path) on school to authenticated;
grant update (enabled) on school to authenticated;
grant update (full_name, phone) on person to authenticated;
grant update (status, minor, payment_day) on membership to authenticated;
grant insert, delete on guardian_link to authenticated;

grant execute on function private.me(), private.is_platform_admin(), private.is_member(uuid, member_role[]),
    private.is_director(uuid), private.is_staff(uuid), private.acts_for(uuid, uuid, boolean), private.my_schools(),
    private.valid_time_zone(text), private.can_see_person(uuid) to authenticated;
