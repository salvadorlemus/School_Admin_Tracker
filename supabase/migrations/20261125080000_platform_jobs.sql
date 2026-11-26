-- The platform admin's tables (billing, usage, log), invitations, the email outbox, deleting a
-- student's data (rules 20, 21), and the daily jobs (reminders, turning 18, fees owed again).
--
-- Anything that needs the secret key (sending email through Resend, creating logins, removing files
-- and logins) is done by Edge Functions reading the queues kept here; the database decides what and when.

create extension if not exists pg_cron;

-- ---- Platform: billing, log ----

/** The admin's terms with a school: its monthly fee, billing day, trial and invoice details. */
create table school_billing (
    school_id    uuid primary key references school on delete cascade,
    monthly_fee  numeric(10, 2) not null default 0 check (monthly_fee >= 0),
    billing_day  smallint not null default 1 check (billing_day between 1 and 28),
    trial_ends   date,
    tax_details  text check (length(tax_details) <= 1000),
    notes        text check (length(notes) <= 4000)
);

/** A school's payment to the platform, recorded by hand; never edited, corrected with a negative entry. */
create table billing_payment (
    id           uuid primary key default gen_random_uuid(),
    school_id    uuid references school on delete set null,
    school_name  text not null,
    amount       numeric(10, 2) not null check (amount <> 0),
    month        date not null check (month = date_trunc('month', month)::date),
    paid_on      date not null,
    method       text not null check (length(method) <= 60),
    paid_by      text check (length(paid_by) <= 200),
    recorded_by  uuid references auth.users,
    recorded_at  timestamptz not null default now()
);

/** Every admin action: who and when, kept after a school is deleted (with its name, not a link). */
create table admin_log (
    id           uuid primary key default gen_random_uuid(),
    admin_id     uuid references auth.users on delete set null,
    action       text not null,
    school_id    uuid references school on delete set null,
    school_name  text,
    details      jsonb not null default '{}',
    created_at   timestamptz not null default now()
);

create or replace function private.admin_only() returns void
    language plpgsql stable security definer set search_path = '' as $$
begin
    if not private.is_platform_admin() then
        raise exception 'Only the platform admin' using errcode = '42501';
    end if;
end $$;

create or replace function private.log_admin(action text, school uuid, details jsonb default '{}') returns void
    language sql security definer set search_path = '' as $$
    insert into public.admin_log (admin_id, action, school_id, school_name, details)
    values (auth.uid(), action, log_admin.school, (select s.name from public.school s where s.id = log_admin.school), details)
$$;

create or replace function public.admin_set_enabled(school uuid, enabled boolean) returns void
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.admin_only();
    update public.school s set enabled = admin_set_enabled.enabled where s.id = admin_set_enabled.school;
    perform private.log_admin(case when enabled then 'school_enabled' else 'school_disabled' end, admin_set_enabled.school);
end $$;

create or replace function public.admin_record_payment(school uuid, amount numeric, month date, paid_on date, method text, paid_by text default null) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    made uuid;
begin
    perform private.admin_only();
    insert into public.billing_payment (school_id, school_name, amount, month, paid_on, method, paid_by, recorded_by)
    values (admin_record_payment.school, (select s.name from public.school s where s.id = admin_record_payment.school), amount, date_trunc('month', month)::date, paid_on, method, paid_by, auth.uid())
    returning id into made;
    perform private.log_admin(case when amount < 0 then 'payment_corrected' else 'payment_recorded' end, school, jsonb_build_object('amount', amount, 'month', month));
    return made;
end $$;

/** Counts only, never records (the admin never sees a school's students, attendance or payments). */
create or replace function public.admin_usage()
    returns table (school_id uuid, students bigint, teachers bigint, classes bigint, active_people bigint, check_ins bigint, storage_bytes bigint, last_activity timestamptz)
    language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.admin_only();
    return query
    select s.id,
        (select count(*) from public.membership m where m.school_id = s.id and m.role = 'student' and m.status = 'active'),
        (select count(*) from public.membership m where m.school_id = s.id and m.role = 'teacher' and m.status = 'active'),
        (select count(*) from public.class c where c.school_id = s.id and (c.ends_on is null or c.ends_on >= current_date)),
        (select count(distinct a.created_by) from public.attendance a where a.school_id = s.id and a.created_at > now() - interval '30 days'),
        (select count(*) from public.attendance a where a.school_id = s.id and a.created_at > now() - interval '30 days'),
        (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o where o.bucket_id = 'lyra' and o.name like s.id::text || '/%'),
        (select max(a.created_at) from public.attendance a where a.school_id = s.id)
    from public.school s;
end $$;

-- ---- Email: one outbox, sent by an Edge Function through Resend ----

/** An email to send once. The address is resolved when it's queued; card and health content never go in. */
create table email_outbox (
    id          uuid primary key default gen_random_uuid(),
    to_email    text not null,
    school_id   uuid references school on delete set null,
    kind        text not null,
    vars        jsonb not null default '{}',
    created_at  timestamptz not null default now(),
    sent_at     timestamptz,
    attempts    smallint not null default 0,
    last_error  text
);
create index on email_outbox (created_at) where sent_at is null;

create or replace function private.queue_email(person uuid, school uuid, kind text, vars jsonb) returns void
    language sql security definer set search_path = '' as $$
    insert into public.email_outbox (to_email, school_id, kind, vars)
    select u.email, queue_email.school, kind, vars || jsonb_build_object('school_name', (select s.name from public.school s where s.id = queue_email.school))
    from public.person p join auth.users u on u.id = p.user_id where p.id = person and u.email is not null
$$;

/** Personal notices about payments and the account are emailed too (rule 11). */
create or replace function private.email_notification() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.queue_email(new.person_id, new.school_id, new.kind, new.vars);
    update public.notification set emailed_at = now() where id = new.id;
    return new;
end $$;

create trigger email_notification after insert on notification
    for each row when (new.email) execute function private.email_notification();

-- ---- Invitations (sent by the Edge Function; the link works once, for 24 hours) ----

create table invitation (
    id            uuid primary key default gen_random_uuid(),
    membership_id uuid not null references membership on delete cascade,
    /** The link carries the token; only its hash is kept. */
    token_hash    bytea not null unique,
    expires_at    timestamptz not null default now() + interval '24 hours',
    used_at       timestamptz,
    cancelled_at  timestamptz,
    sent_by       uuid references person,
    sent_at       timestamptz not null default now()
);
create index on invitation (membership_id);

/** A new invitation cancels the earlier ones for the same membership. */
create or replace function private.invitation_sent() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    update public.invitation set cancelled_at = now()
    where membership_id = new.membership_id and id <> new.id and used_at is null and cancelled_at is null;
    return new;
end $$;

create trigger invitation_sent after insert on invitation
    for each row execute function private.invitation_sent();

-- ---- Deleting a student's data at a school (rule 20) ----

create table file_deletion (path text primary key, queued_at timestamptz not null default now());
create table login_deletion (user_id uuid primary key, queued_at timestamptz not null default now());

/**
 * Removes the school's card, photos, contacts, health conditions, pickup people and payment
 * screenshots. Attendance and payment records stay, pointing at a nameless person, so the school's
 * counts stay right. A person left with no school has their login queued for deletion too.
 */
create or replace function private.delete_student_data(school uuid, student uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    nobody uuid;
    login uuid;
begin
    insert into public.person (full_name) values ('—') returning id into nobody;
    -- Files go (by the Edge Function); their rows lose the path.
    insert into public.file_deletion (path)
    select photo_path from public.student_card where school_id = school and student_id = student and photo_path is not null
    union select file_path from public.payment_proof where school_id = school and student_id = student
    on conflict do nothing;
    delete from public.student_card where school_id = school and student_id = student;
    update public.payment_proof set file_path = 'deleted/' || id, student_id = nobody where school_id = school and student_id = student;
    update public.attendance set person_id = nobody where school_id = school and person_id = student;
    update public.enrollment set student_id = nobody where school_id = school and student_id = student;
    update public.student_package set student_id = nobody where school_id = school and student_id = student;
    update public.booking set student_id = nobody where school_id = school and student_id = student;
    update public.registration_fee set student_id = nobody where school_id = school and student_id = student;
    update public.attendance_log set person_id = nobody where school_id = school and person_id = student;
    delete from public.student_card_log where school_id = school and student_id = student;
    delete from public.terms_acceptance where school_id = school and student_id = student;
    delete from public.family_person_child c using public.family_person f where f.id = c.family_person_id and f.school_id = school and c.student_id = student;
    -- A guardian's people who are no longer for any child there go with their photos.
    insert into public.file_deletion (path)
    select f.photo_path from public.family_person f where f.school_id = school and f.photo_path is not null
      and not exists (select 1 from public.family_person_child c where c.family_person_id = f.id) on conflict do nothing;
    delete from public.family_person f where f.school_id = school and not exists (select 1 from public.family_person_child c where c.family_person_id = f.id);
    delete from public.guardian_link where school_id = school and student_id = student;
    delete from public.notification where school_id = school and person_id = student;
    delete from public.membership where school_id = school and person_id = student and role = 'student';
    if not exists (select 1 from public.membership where person_id = student) then
        select user_id into login from public.person where id = student;
        if login is not null then insert into public.login_deletion values (login) on conflict do nothing; end if;
        delete from public.person where id = student;
    end if;
end $$;

/** A director deletes a student from the school (asked twice by the app). */
create or replace function public.delete_student(school uuid, student uuid) returns void
    language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_director(delete_student.school) then
        raise exception 'Only the school''s directors delete a student' using errcode = '42501';
    end if;
    perform private.delete_student_data(delete_student.school, student);
end $$;

/** A student (or guardian) asks for their data to be deleted: the app emails them a confirmation link. */
create table deletion_request (
    id            uuid primary key default gen_random_uuid(),
    school_id     uuid not null references school on delete cascade,
    student_id    uuid not null references person on delete cascade,
    token_hash    bytea not null unique,
    requested_by  uuid references person,
    requested_at  timestamptz not null default now(),
    expires_at    timestamptz not null default now() + interval '24 hours',
    confirmed_at  timestamptz
);

create or replace function public.request_data_deletion(school uuid, student uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
    if not private.acts_for(request_data_deletion.school, student, true) then
        raise exception 'Only the student (or their guardian) asks for it' using errcode = '42501';
    end if;
    insert into public.deletion_request (school_id, student_id, token_hash, requested_by)
    values (request_data_deletion.school, student, extensions.digest(token, 'sha256'), private.me());
    perform private.queue_email(private.me(), request_data_deletion.school, 'deletion_link', jsonb_build_object('token', token, 'student_id', student));
end $$;

/** Opening the emailed link and confirming deletes the data, like a director's delete. */
create or replace function public.confirm_data_deletion(token text) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    r public.deletion_request;
begin
    select * into r from public.deletion_request where token_hash = extensions.digest(token, 'sha256') for update;
    if r.id is null or r.confirmed_at is not null or r.expires_at < now() then
        raise exception 'This link has expired or was already used' using errcode = 'P0001';
    end if;
    update public.deletion_request set confirmed_at = now() where id = r.id;
    perform private.delete_student_data(r.school_id, r.student_id);
end $$;

-- ---- The daily jobs ----

create table reminder_sent (
    school_id   uuid not null references school on delete cascade,
    student_id  uuid not null references person on delete cascade,
    plan_id     uuid not null,
    month       date not null,
    days_left   smallint not null,
    primary key (school_id, student_id, plan_id, month, days_left)
);

/** The day a month's plans are due: the 15th, or the 30th (February: its last day). */
create or replace function private.due_day(month date, payment_day smallint) returns date
    language sql immutable as $$
    select case when payment_day = 15 then month + 14
                else least(month + 29, (month + interval '1 month - 1 day')::date) end
$$;

/**
 * Rule 12: each monthly plan and package is reminded 5 days before, 1 day before and on its payment
 * day, unless that month's screenshot was uploaded (and not rejected). Per-visit payers get none.
 * Each school's own date; disabled schools and inactive memberships are skipped; each reminder once.
 */
create or replace function private.send_payment_reminders() returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    made integer := 0;
    r record;
begin
    for r in
        select m.school_id, m.person_id as student, plan.id as plan_id, plan.is_package, month, private.due_day(month, m.payment_day) - today as days_left
        from public.membership m join public.school sc on sc.id = m.school_id
        cross join lateral (select private.school_today(m.school_id) as today) t
        cross join lateral (select date_trunc('month', t.today)::date as month) mo
        cross join lateral (
            select e.id, false as is_package from public.enrollment e where e.school_id = m.school_id and e.student_id = m.person_id and e.how = 'monthly'
              and e.starts_on <= private.due_day(mo.month, m.payment_day) and (e.ends_on is null or e.ends_on >= mo.month)
            union all
            select p.id, true from public.student_package p where p.school_id = m.school_id and p.student_id = m.person_id
              and p.starts_on <= private.due_day(mo.month, m.payment_day) and (p.ends_on is null or p.ends_on >= mo.month)) plan
        where m.role = 'student' and m.status = 'active' and sc.enabled
          and private.due_day(mo.month, m.payment_day) - t.today in (5, 1, 0)
          and not exists (select 1 from public.payment_proof pp where pp.month = mo.month and pp.state <> 'rejected'
                          and (pp.enrollment_id = plan.id or pp.package_id = plan.id))
    loop
        insert into public.reminder_sent values (r.school_id, r.student, r.plan_id, r.month, r.days_left) on conflict do nothing;
        if found then
            perform private.notify_student(r.school_id, r.student, 'payment_due',
                jsonb_build_object('days_left', r.days_left, 'month', r.month, case when r.is_package then 'package_id' else 'enrollment_id' end, r.plan_id), true);
            made := made + 1;
        end if;
    end loop;
    return made;
end $$;

/** Rule 22: on a minor's 18th birthday, the directors are invited to register them again as an adult. */
create or replace function private.notify_turning_18() returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    made integer;
begin
    with grown as (
        select k.school_id, k.student_id from public.student_card k
        join public.membership m on m.school_id = k.school_id and m.person_id = k.student_id and m.role = 'student' and m.minor and m.status = 'active'
        where k.birth_date is not null and (k.birth_date + interval '18 years')::date = private.school_today(k.school_id))
    select count(*) into made from grown, lateral private.notify_directors(grown.school_id, 'turns_18', jsonb_build_object('student_id', grown.student_id));
    return made;
end $$;

/**
 * Rule 21: an inactive student's data is kept 3 months; each month they (or their guardian) are told,
 * with the link to delete it now; the day after, it's deleted and they're told.
 */
create or replace function private.run_data_countdown() returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    m record;
    done integer := 0;
begin
    for m in select ms.school_id, ms.person_id, ms.inactive_since, private.school_today(ms.school_id) as today
             from public.membership ms where ms.role = 'student' and ms.status = 'inactive' loop
        if m.today > (m.inactive_since + interval '3 months')::date then
            perform private.notify_student(m.school_id, m.person_id, 'data_deleted', '{}', true);
            perform private.delete_student_data(m.school_id, m.person_id);
            done := done + 1;
        elsif m.today in ((m.inactive_since + interval '1 month')::date, (m.inactive_since + interval '2 months')::date) then
            perform private.notify_student(m.school_id, m.person_id, 'data_countdown',
                jsonb_build_object('deletes_on', (m.inactive_since + interval '3 months' + interval '1 day')::date), true);
        end if;
    end loop;
    return done;
end $$;

/** Becoming inactive starts the countdown with its first notice; registering again before the end stops it. */
create or replace function private.notify_inactive() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.role = 'student' and new.status = 'inactive' and old.status <> 'inactive' then
        perform private.notify_student(new.school_id, new.person_id, 'data_countdown',
            jsonb_build_object('deletes_on', (current_date + interval '3 months' + interval '1 day')::date), true);
    end if;
    return new;
end $$;

create trigger notify_inactive after update of status on membership
    for each row execute function private.notify_inactive();

/** The directors' payday reminders for teachers still to pay: 5 days before, the day before, the day itself. */
create or replace function private.send_payday_reminders() returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    made integer := 0;
    s record;
    period daterange;
begin
    for s in select sc.id, private.school_today(sc.id) as today, private.rule_on(sc.id, private.school_today(sc.id)) as rule
             from public.school sc where sc.enabled loop
        if (s.rule).id is null then continue; end if;
        period := private.period_of((s.rule).days, s.today);
        if (upper(period) - 1) - s.today in (5, 1, 0) then
            perform private.notify_directors(s.id, 'teacher_payday', jsonb_build_object('payday', upper(period) - 1));
            made := made + 1;
        end if;
    end loop;
    return made;
end $$;

/** Everything daily, in one call (each school's date is its own). */
create or replace function private.daily() returns void
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.send_payment_reminders();
    perform private.notify_turning_18();
    perform private.charge_lapsed_fees();
    perform private.run_data_countdown();
    perform private.send_payday_reminders();
end $$;

-- 14:00 UTC is 8:00 in Mexico City: the morning in each school's own time zone for the Americas.
select cron.schedule('lyra-daily', '0 14 * * *', 'select private.daily()');

-- ---- Policies: the admin's tables are the admin's; queues are the Edge Functions' (service key) ----

alter table school_billing enable row level security;
alter table billing_payment enable row level security;
alter table admin_log enable row level security;
alter table email_outbox enable row level security;
alter table invitation enable row level security;
alter table file_deletion enable row level security;
alter table login_deletion enable row level security;
alter table deletion_request enable row level security;
alter table reminder_sent enable row level security;

create policy "the admin reads billing" on school_billing for select to authenticated using (private.is_platform_admin());
create policy "the admin edits billing" on school_billing for all to authenticated
    using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy "the admin reads payments" on billing_payment for select to authenticated using (private.is_platform_admin());
create policy "the admin reads the log" on admin_log for select to authenticated using (private.is_platform_admin());

grant select on school_billing, billing_payment, admin_log to authenticated;
grant insert, update on school_billing to authenticated;
grant execute on function public.admin_set_enabled(uuid, boolean), public.admin_record_payment(uuid, numeric, date, date, text, text),
    public.admin_usage(), public.delete_student(uuid, uuid), public.request_data_deletion(uuid, uuid), public.confirm_data_deletion(text) to authenticated;
