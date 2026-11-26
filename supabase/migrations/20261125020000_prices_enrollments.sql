-- Prices, packages, and how students take classes: enrollments, packages and bookings (rule 4).
--
-- Prices are never edited: a new row from a date replaces the old one from then on, and each
-- enrollment, package and booking keeps the price it was created with, stamped by the database.
-- Students (or their guardians) create their own enrollments; a full class refuses them, and within a
-- school a student can't be in two sessions at once (rule 5).

create type price_kind as enum ('fee', 'monthly', 'package', 'visit', 'trial', 'free');
create type pay_how as enum ('monthly', 'visit');
create type booking_kind as enum ('free', 'trial');

/** A package the director offers: so many sessions a week, at whichever of its classes the student chooses. */
create table package_offer (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    name        text not null check (length(btrim(name)) between 1 and 200),
    per_week    smallint not null check (per_week between 1 and 21),
    /** No longer offered: whoever has it keeps it until they leave it. */
    retired_at  timestamptz,
    created_at  timestamptz not null default now()
);

create table package_offer_class (
    offer_id  uuid not null references package_offer on delete cascade,
    class_id  uuid not null references class on delete cascade,
    primary key (offer_id, class_id)
);

create table price (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    kind        price_kind not null,
    class_id    uuid references class on delete cascade,
    offer_id    uuid references package_offer on delete cascade,
    /** Free hours: the price per student from this many attendants on. */
    attendants  smallint check (attendants > 0),
    amount      numeric(10, 2) not null check (amount >= 0),
    /** From this day in the school's time zone (today when not given). */
    starts_on   date not null,
    created_by  uuid references person,
    created_at  timestamptz not null default now(),
    check ((kind = 'monthly') = (class_id is not null)),
    check ((kind = 'package') = (offer_id is not null)),
    check ((kind = 'free') = (attendants is not null))
);
create index on price (school_id, kind, starts_on desc);

create table enrollment (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    student_id  uuid not null references person,
    class_id    uuid not null references class,
    how         pay_how not null,
    starts_on   date not null,
    ends_on     date,
    price       numeric(10, 2) not null default 0,
    created_by  uuid references person,
    created_at  timestamptz not null default now(),
    check (ends_on is null or ends_on >= starts_on)
);
create index on enrollment (student_id);
create index on enrollment (class_id);

/** A student's monthly package: up to so many sessions a week, Monday to Sunday, at any of its classes. */
create table student_package (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    student_id  uuid not null references person,
    offer_id    uuid not null references package_offer,
    per_week    smallint not null default 0,
    starts_on   date not null,
    ends_on     date,
    price       numeric(10, 2) not null default 0,
    created_by  uuid references person,
    created_at  timestamptz not null default now(),
    check (ends_on is null or ends_on >= starts_on)
);
create index on student_package (student_id);

/** A place in one session: free hours, or a trial class (one per class per student). */
create table booking (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    student_id  uuid not null references person,
    session_id  uuid not null references session on delete cascade,
    class_id    uuid not null references class,
    kind        booking_kind not null,
    price       numeric(10, 2) not null default 0,
    created_by  uuid references person,
    created_at  timestamptz not null default now(),
    unique (student_id, session_id)
);
create unique index booking_one_trial on booking (student_id, class_id) where kind = 'trial';

-- ---- Prices: the current one ----

/** The price in force on a day: the latest row from on or before it. */
create or replace function private.price_on(school uuid, what public.price_kind, day date, for_class uuid default null,
                                             for_offer uuid default null, attendants smallint default null) returns numeric
    language sql stable security definer set search_path = '' as $$
    select p.amount from public.price p
    where p.school_id = price_on.school and p.kind = what and p.starts_on <= day
      and p.class_id is not distinct from for_class and p.offer_id is not distinct from for_offer
      and (what <> 'free' or p.attendants <= price_on.attendants)
    order by case when what = 'free' then p.attendants end desc nulls last, p.starts_on desc, p.created_at desc
    limit 1
$$;

-- ---- Who's taking what ----

/** Whether a student is taking a class on a day: enrolled, or with a package that covers it. */
create or replace function private.takes_class(student uuid, class uuid, day date) returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.enrollment e where e.student_id = student and e.class_id = class
                   and e.starts_on <= day and (e.ends_on is null or e.ends_on >= day))
        or exists (select 1 from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
                   where sp.student_id = student and oc.class_id = class and sp.starts_on <= day and (sp.ends_on is null or sp.ends_on >= day))
$$;

/** A class's current students: enrollments not ended (free hours count their bookings per session instead). */
create or replace function private.enrolled_count(class uuid, day date) returns integer
    language sql stable security definer set search_path = '' as $$
    select count(*)::int from public.enrollment e where e.class_id = class and (e.ends_on is null or e.ends_on >= day)
$$;

/**
 * The first class (by name) at the same school whose sessions would overlap these, for a student
 * (rule 5): their enrollments' and bookings' sessions. Packages have no fixed sessions, so they never clash.
 */
create or replace function private.clash(student uuid, school uuid, candidates uuid[], skip_enrollment uuid default null) returns text
    language sql stable security definer set search_path = '' as $$
    select c.name
    from public.session mine
    join public.class c on c.id = mine.class_id
    join public.school sc on sc.id = mine.school_id
    join public.session other on other.id = any (candidates)
    where mine.school_id = clash.school and mine.status = 'scheduled' and mine.id <> other.id
      and mine.starts_at < other.ends_at and other.starts_at < mine.ends_at
      and (exists (select 1 from public.enrollment e where e.student_id = student and e.class_id = mine.class_id
                     and e.id is distinct from skip_enrollment
                     and (mine.starts_at at time zone sc.time_zone)::date between e.starts_on and coalesce(e.ends_on, 'infinity'))
           or exists (select 1 from public.booking b where b.student_id = student and b.session_id = mine.id))
    order by mine.starts_at
    limit 1
$$;

/** Checks and stamps an enrollment: the price it's created with, who and when; full classes and clashes refuse it. */
create or replace function private.enrollment_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    c public.class;
    clashing text;
    upcoming uuid[];
    today date := private.school_today(new.school_id);
begin
    select * into c from public.class where id = new.class_id for update;
    if c.school_id <> new.school_id or c.kind <> 'weekly' then
        raise exception 'Students enroll in their school''s weekly classes' using errcode = '23514';
    end if;
    if not exists (select 1 from public.membership where school_id = new.school_id and person_id = new.student_id and role = 'student' and status = 'active') then
        raise exception 'Only an active student of the school can enroll' using errcode = '23514';
    end if;
    if c.ends_on is not null and new.starts_on > c.ends_on then
        raise exception 'This class has ended' using errcode = 'P0001';
    end if;
    if (new.how = 'monthly' and c.monthly_sessions is null) or (new.how = 'visit' and not c.per_visit) then
        raise exception 'The class isn''t paid that way' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
        -- The start and the price are never the app's to back-date: from today, at today's price.
        if new.starts_on < today then
            raise exception 'An enrollment starts today or later' using errcode = '22023';
        end if;
        if exists (select 1 from public.enrollment where student_id = new.student_id and class_id = new.class_id
                   and (ends_on is null or ends_on >= new.starts_on)) then
            raise exception 'Already enrolled in this class' using errcode = '23505';
        end if;
        if c.max_students is not null and private.enrolled_count(c.id, new.starts_on) >= c.max_students then
            raise exception 'The class is full' using errcode = 'P0001', hint = 'full';
        end if;
        select array_agg(x.id) into upcoming from public.session x join public.school sc on sc.id = x.school_id
        where x.class_id = c.id and x.status = 'scheduled'
          and (x.starts_at at time zone sc.time_zone)::date between new.starts_on and coalesce(new.ends_on, 'infinity');
        clashing := private.clash(new.student_id, new.school_id, coalesce(upcoming, '{}'));
        if clashing is not null then
            raise exception 'It overlaps %', clashing using errcode = 'P0001', hint = 'overlap';
        end if;
        new.price := case new.how when 'monthly' then private.price_on(new.school_id, 'monthly', today, c.id)
                                  else private.price_on(new.school_id, 'visit', today) end;
        if new.price is null then
            raise exception 'The school hasn''t set a price for this yet' using errcode = 'P0001', hint = 'no_price';
        end if;
        new.created_by := private.me();
        new.created_at := now();
    end if;
    return new;
end $$;

-- Checked when it's created; afterwards only its end changes, through leave and end_enrollment.
create trigger enrollment_saved before insert on enrollment
    for each row execute function private.enrollment_saved();

create or replace function private.package_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    o public.package_offer;
begin
    select * into o from public.package_offer where id = new.offer_id;
    if o.school_id <> new.school_id then
        raise exception 'The package must be the school''s' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
        if new.starts_on < private.school_today(new.school_id) then
            raise exception 'A package starts today or later' using errcode = '22023';
        end if;
        if o.retired_at is not null then
            raise exception 'This package is no longer offered' using errcode = 'P0001';
        end if;
        if not exists (select 1 from public.membership where school_id = new.school_id and person_id = new.student_id and role = 'student' and status = 'active') then
            raise exception 'Only an active student of the school can take a package' using errcode = '23514';
        end if;
        new.per_week := o.per_week;
        new.price := private.price_on(new.school_id, 'package', private.school_today(new.school_id), null, o.id);
        if new.price is null then
            raise exception 'The school hasn''t set a price for this package yet' using errcode = 'P0001', hint = 'no_price';
        end if;
        new.created_by := private.me();
        new.created_at := now();
    end if;
    return new;
end $$;

create trigger package_saved before insert on student_package
    for each row execute function private.package_saved();

create or replace function private.booking_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    s public.session;
    c public.class;
    taken integer;
    clashing text;
begin
    select * into s from public.session where id = new.session_id for update;
    select * into c from public.class where id = s.class_id;
    new.class_id := c.id;
    if s.school_id <> new.school_id or s.status <> 'scheduled' or s.starts_at <= now() then
        raise exception 'This session can''t be booked' using errcode = 'P0001';
    end if;
    if new.kind = 'free' and c.kind <> 'free' then
        raise exception 'Only free hours are booked by the session' using errcode = '23514';
    end if;
    if new.kind = 'trial' and private.takes_class(new.student_id, c.id, private.school_today(new.school_id)) then
        raise exception 'A trial is for a class they don''t take yet' using errcode = 'P0001';
    end if;
    select count(*) into taken from public.booking where session_id = s.id;
    if c.max_students is not null and taken + (case when c.kind = 'weekly' then private.enrolled_count(c.id, current_date) else 0 end) >= c.max_students then
        raise exception 'The session is full' using errcode = 'P0001', hint = 'full';
    end if;
    clashing := private.clash(new.student_id, new.school_id, array[s.id]);
    if clashing is not null then
        raise exception 'It overlaps %', clashing using errcode = 'P0001', hint = 'overlap';
    end if;
    new.price := case new.kind when 'trial' then private.price_on(new.school_id, 'trial', private.school_today(new.school_id))
                               else private.price_on(new.school_id, 'free', private.school_today(new.school_id), null, null, (taken + 1)::smallint) end;
    if new.price is null then
        raise exception 'The school hasn''t set a price for this yet' using errcode = 'P0001', hint = 'no_price';
    end if;
    new.created_by := private.me();
    new.created_at := now();
    return new;
end $$;

create trigger booking_saved before insert on booking
    for each row execute function private.booking_saved();

/** A new price: from today in the school's time zone unless a later day is given; never back-dated. */
create or replace function private.price_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    today date := private.school_today(new.school_id);
begin
    new.starts_on := coalesce(new.starts_on, today);
    if new.starts_on < today and private.me() is not null then
        raise exception 'A new price starts today or later' using errcode = '22023';
    end if;
    new.created_by := private.me();
    new.created_at := now();
    return new;
end $$;

create trigger price_saved before insert on price for each row execute function private.price_saved();

/** A package's classes must be the school's. */
create or replace function private.offer_class_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.package_offer o join public.class c on c.school_id = o.school_id
                   where o.id = new.offer_id and c.id = new.class_id) then
        raise exception 'A package covers its school''s classes' using errcode = '23514';
    end if;
    return new;
end $$;

create trigger offer_class_saved before insert on package_offer_class
    for each row execute function private.offer_class_saved();

-- ---- Ending: a student leaves at the end of the paid month; the director ends it on a day ----

/** The student (or guardian) leaves a class or package: they keep it until the end of this month. */
create or replace function public.leave(enrollment_id uuid default null, package_id uuid default null) returns date
    language plpgsql security definer set search_path = '' as $$
declare
    school uuid;
    student uuid;
    last_day date;
begin
    if enrollment_id is not null then
        select e.school_id, e.student_id into school, student from public.enrollment e where e.id = enrollment_id;
    else
        select p.school_id, p.student_id into school, student from public.student_package p where p.id = package_id;
    end if;
    if school is null or not private.acts_for(school, student) then
        raise exception 'Only the student (or their guardian) leaves it' using errcode = '42501';
    end if;
    last_day := (date_trunc('month', private.school_today(school)) + interval '1 month - 1 day')::date;
    update public.enrollment set ends_on = least(coalesce(ends_on, last_day), last_day) where id = enrollment_id;
    update public.student_package set ends_on = least(coalesce(ends_on, last_day), last_day) where id = package_id;
    return last_day;
end $$;

/** A director ends an enrollment or a package on a day. */
create or replace function public.end_enrollment(enrollment_id uuid default null, package_id uuid default null, last_day date default null) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    school uuid;
begin
    select coalesce((select e.school_id from public.enrollment e where e.id = enrollment_id),
                    (select p.school_id from public.student_package p where p.id = package_id)) into school;
    if school is null or not private.is_director(school) then
        raise exception 'Only the school''s directors end enrollments' using errcode = '42501';
    end if;
    update public.enrollment set ends_on = coalesce(last_day, private.school_today(school)) where id = enrollment_id;
    update public.student_package set ends_on = coalesce(last_day, private.school_today(school)) where id = package_id;
end $$;

-- ---- Policies ----

alter table package_offer enable row level security;
alter table package_offer_class enable row level security;
alter table price enable row level security;
alter table enrollment enable row level security;
alter table student_package enable row level security;
alter table booking enable row level security;

create policy "members read packages" on package_offer for select to authenticated using (private.is_member(school_id));
create policy "directors add packages" on package_offer for insert to authenticated with check (private.is_director(school_id));
create policy "directors change packages" on package_offer for update to authenticated
    using (private.is_director(school_id)) with check (private.is_director(school_id));
-- A package nobody ever had can be deleted; one in use is retired instead (the foreign keys refuse the rest).
create policy "directors delete packages" on package_offer for delete to authenticated using (private.is_director(school_id));

create policy "members read package classes" on package_offer_class for select to authenticated
    using (exists (select 1 from package_offer o where o.id = offer_id and private.is_member(o.school_id)));
create policy "directors pick package classes" on package_offer_class for insert to authenticated
    with check (exists (select 1 from package_offer o where o.id = offer_id and private.is_director(o.school_id)));
create policy "directors drop package classes" on package_offer_class for delete to authenticated
    using (exists (select 1 from package_offer o where o.id = offer_id and private.is_director(o.school_id)));

create policy "members read prices" on price for select to authenticated using (private.is_member(school_id));
create policy "directors add prices" on price for insert to authenticated with check (private.is_director(school_id));

create policy "students, guardians and staff read enrollments" on enrollment for select to authenticated
    using (private.acts_for(school_id, student_id) or private.is_staff(school_id));
create policy "students enroll themselves" on enrollment for insert to authenticated
    with check (private.acts_for(school_id, student_id));

create policy "students, guardians and staff read packages" on student_package for select to authenticated
    using (private.acts_for(school_id, student_id) or private.is_staff(school_id));
create policy "students take packages" on student_package for insert to authenticated
    with check (private.acts_for(school_id, student_id));

create policy "students, guardians and staff read bookings" on booking for select to authenticated
    using (private.acts_for(school_id, student_id) or private.is_staff(school_id));
create policy "students book" on booking for insert to authenticated
    with check (private.acts_for(school_id, student_id));

-- ---- Privileges ----

grant select on package_offer, package_offer_class, price, enrollment, student_package, booking to authenticated;
grant insert (id, school_id, name, per_week) on package_offer to authenticated;
grant update (name, per_week, retired_at) on package_offer to authenticated;
grant delete on package_offer to authenticated;
grant insert, delete on package_offer_class to authenticated;
grant insert (id, school_id, kind, class_id, offer_id, attendants, amount, starts_on) on price to authenticated;
grant insert (id, school_id, student_id, class_id, how, starts_on) on enrollment to authenticated;
grant insert (id, school_id, student_id, offer_id, starts_on) on student_package to authenticated;
grant insert (id, school_id, student_id, session_id, kind) on booking to authenticated;
grant execute on function public.leave(uuid, uuid), public.end_enrollment(uuid, uuid, date) to authenticated;
