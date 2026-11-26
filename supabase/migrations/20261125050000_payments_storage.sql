-- Payment screenshots, registration fees, and the private bucket for every file (rules 10, 15).
--
-- A screenshot covers one thing: a session (per-visit payers), one calendar month of an enrollment
-- or a package, or a registration fee. It's kept, never replaced or deleted; a director confirms or
-- rejects it, stamped with who and when. Each school's money is its own: nothing about a student's
-- payments at one school is visible at another.

create type pay_method as enum ('cash', 'transfer', 'card', 'totalpass', 'wellhub');
create type proof_covers as enum ('visit', 'month', 'fee');
create type proof_state as enum ('uploaded', 'confirmed', 'rejected');
create type fee_reason as enum ('joined', 'lapsed');

/** A registration fee a student owes, until a director marks it as done (rule 15). It never blocks attendance. */
create table registration_fee (
    id           uuid primary key default gen_random_uuid(),
    school_id    uuid not null references school on delete cascade,
    student_id   uuid not null references person on delete cascade,
    reason       fee_reason not null,
    amount       numeric(10, 2) not null check (amount >= 0),
    owed_since   date not null,
    done_by      uuid references person,
    done_at      timestamptz,
    created_at   timestamptz not null default now()
);
create unique index registration_fee_one_open on registration_fee (school_id, student_id) where done_at is null;

create table payment_proof (
    id             uuid primary key default gen_random_uuid(),
    school_id      uuid not null references school on delete cascade,
    student_id     uuid not null references person on delete cascade,
    method         pay_method not null,
    covers         proof_covers not null,
    session_id     uuid references session on delete set null,
    enrollment_id  uuid references enrollment on delete set null,
    package_id     uuid references student_package on delete set null,
    /** The first day of the month it covers. */
    month          date check (month = date_trunc('month', month)::date),
    fee_id         uuid references registration_fee on delete set null,
    /** What the student says they paid, and what it should be (the price it covers), shown side by side. */
    amount         numeric(10, 2) not null check (amount >= 0),
    expected       numeric(10, 2),
    file_path      text not null unique,
    state          proof_state not null default 'uploaded',
    reason         text check (length(reason) <= 500),
    decided_by     uuid references person,
    decided_at     timestamptz,
    created_by     uuid references person,
    created_at     timestamptz not null default now(),
    check (covers <> 'visit' or session_id is not null),
    check (covers <> 'month' or (month is not null and (enrollment_id is null) <> (package_id is null))),
    check (covers <> 'fee' or fee_id is not null),
    check (state <> 'rejected' or length(btrim(reason)) > 0)
);
create index on payment_proof (school_id, state, created_at);
create index on payment_proof (student_id);

-- ---- Uploading: what it covers must be the student's, at that school ----

create or replace function private.proof_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    e public.enrollment;
    p public.student_package;
begin
    -- Who it's for comes first, so nothing about another student's records is checked (or told) for them.
    if not private.acts_for(new.school_id, new.student_id) then
        raise exception 'Only the student (or their guardian) uploads their screenshots' using errcode = '42501';
    end if;
    if new.covers = 'visit' then
        if not exists (select 1 from public.session s where s.id = new.session_id and s.school_id = new.school_id)
            or not (exists (select 1 from public.attendance a where a.session_id = new.session_id and a.person_id = new.student_id)
                    or exists (select 1 from public.booking b where b.session_id = new.session_id and b.student_id = new.student_id)
                    or exists (select 1 from public.session s where s.id = new.session_id
                               and private.may_attend(new.student_id, s))) then
            raise exception 'The screenshot is for a session the student comes to' using errcode = '23514';
        end if;
        new.expected := coalesce((select b.price from public.booking b where b.session_id = new.session_id and b.student_id = new.student_id),
                                 private.price_on(new.school_id, 'visit', private.school_today(new.school_id)));
    elsif new.covers = 'month' then
        if new.enrollment_id is not null then
            select * into e from public.enrollment where id = new.enrollment_id;
            if e.student_id <> new.student_id or e.school_id <> new.school_id or e.how <> 'monthly'
                or new.month < date_trunc('month', e.starts_on) or (e.ends_on is not null and new.month > e.ends_on) then
                raise exception 'The screenshot is for one month of the student''s monthly plan' using errcode = '23514';
            end if;
            new.expected := e.price;
        else
            select * into p from public.student_package where id = new.package_id;
            if p.student_id <> new.student_id or p.school_id <> new.school_id
                or new.month < date_trunc('month', p.starts_on) or (p.ends_on is not null and new.month > p.ends_on) then
                raise exception 'The screenshot is for one month of the student''s package' using errcode = '23514';
            end if;
            new.expected := p.price;
        end if;
    else
        if not exists (select 1 from public.registration_fee f where f.id = new.fee_id and f.student_id = new.student_id and f.school_id = new.school_id) then
            raise exception 'The screenshot is for the student''s registration fee' using errcode = '23514';
        end if;
        new.expected := (select f.amount from public.registration_fee f where f.id = new.fee_id);
    end if;
    -- Wellhub and TotalPass pay the school directly: the token shows no amount.
    if new.method in ('totalpass', 'wellhub') then
        new.amount := 0;
        new.expected := 0;
    end if;
    -- The file lives under the school and the student, by id.
    if new.file_path <> format('%s/proofs/%s/%s.jpg', new.school_id, new.student_id, new.id) then
        raise exception 'The file path is set by its ids' using errcode = '23514';
    end if;
    new.state := 'uploaded';
    new.reason := null;
    new.decided_by := null;
    new.decided_at := null;
    new.created_by := private.me();
    new.created_at := now();
    return new;
end $$;

create trigger proof_saved before insert on payment_proof
    for each row execute function private.proof_saved();

/** A director confirms (payment received) or rejects a screenshot, with a reason the student reads. */
create or replace function public.decide_proof(proof_id uuid, confirmed boolean, reason text default null) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    p public.payment_proof;
begin
    select * into p from public.payment_proof where id = proof_id for update;
    if p.id is null or not private.is_director(p.school_id) then
        raise exception 'Only the school''s directors check screenshots' using errcode = '42501';
    end if;
    if not confirmed and length(btrim(coalesce(reason, ''))) = 0 then
        raise exception 'Say why it''s rejected: the student reads it' using errcode = '22023';
    end if;
    update public.payment_proof x
    set state = case when confirmed then 'confirmed' else 'rejected' end::public.proof_state,
        reason = case when confirmed then null else btrim(decide_proof.reason) end,
        decided_by = private.me(), decided_at = now()
    where x.id = p.id;
end $$;

-- ---- Registration fees ----

/** A new student owes the fee, at the school's current price (when it has one). */
create or replace function private.fee_on_joining() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    amount numeric := private.price_on(new.school_id, 'fee', private.school_today(new.school_id));
begin
    if new.role = 'student' and amount is not null then
        insert into public.registration_fee (school_id, student_id, reason, amount, owed_since)
        values (new.school_id, new.person_id, 'joined', amount, private.school_today(new.school_id))
        on conflict do nothing;
    end if;
    return new;
end $$;

create trigger fee_on_joining after insert on membership
    for each row execute function private.fee_on_joining();

create or replace function public.mark_fee_done(fee_id uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    f public.registration_fee;
begin
    select * into f from public.registration_fee where id = fee_id for update;
    if f.id is null or not private.is_director(f.school_id) then
        raise exception 'Only the school''s directors mark a fee as done' using errcode = '42501';
    end if;
    update public.registration_fee set done_by = private.me(), done_at = now() where id = f.id and done_at is null;
end $$;

/**
 * Rule 15, for the daily job: a student who went the school's set number of calendar months with an
 * enrollment or package but no screenshot covering them (uploaded and not rejected) owes the fee
 * again. Months with nothing to pay don't count. Returns how many fees it created.
 */
create or replace function private.charge_lapsed_fees() returns integer
    language plpgsql security definer set search_path = '' as $$
declare
    made integer := 0;
    m record;
    months date[];
begin
    for m in select ms.school_id, ms.person_id, sc.fee_months, private.school_today(ms.school_id) as today
             from public.membership ms join public.school sc on sc.id = ms.school_id
             where ms.role = 'student' and ms.status = 'active' and sc.enabled
               and not exists (select 1 from public.registration_fee f where f.school_id = ms.school_id and f.student_id = ms.person_id and f.done_at is null)
    loop
        -- The last closed months in which they had something to pay, newest first.
        select array_agg(month order by month desc) into months from (
            select gs::date as month
            from generate_series(date_trunc('month', m.today) - interval '1 month' * (m.fee_months * 4), date_trunc('month', m.today) - interval '1 month', interval '1 month') gs
            where exists (select 1 from public.enrollment e where e.school_id = m.school_id and e.student_id = m.person_id
                          and e.starts_on <= (gs + interval '1 month - 1 day')::date and (e.ends_on is null or e.ends_on >= gs::date))
               or exists (select 1 from public.student_package p where p.school_id = m.school_id and p.student_id = m.person_id
                          and p.starts_on <= (gs + interval '1 month - 1 day')::date and (p.ends_on is null or p.ends_on >= gs::date))
            order by gs desc limit m.fee_months) last_months;
        if coalesce(cardinality(months), 0) = m.fee_months and not exists (
            select 1 from public.payment_proof pp
            where pp.school_id = m.school_id and pp.student_id = m.person_id and pp.state <> 'rejected'
              and coalesce(pp.month, date_trunc('month', pp.created_at at time zone 'UTC')::date) >= months[m.fee_months]) then
            insert into public.registration_fee (school_id, student_id, reason, amount, owed_since)
            values (m.school_id, m.person_id, 'lapsed', coalesce(private.price_on(m.school_id, 'fee', m.today), 0), m.today);
            made := made + 1;
        end if;
    end loop;
    return made;
end $$;

-- ---- Who sees a screenshot: the student, their guardian, their class's teacher, the directors ----

create or replace function private.can_read_proof(p public.payment_proof) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.is_director(p.school_id)
        or private.acts_for(p.school_id, p.student_id)
        or (private.is_member(p.school_id, '{teacher}') and (
            exists (select 1 from public.session s where s.id = p.session_id and private.me() in (s.teacher_id, s.substitute_id))
            or exists (select 1 from public.enrollment e join public.class c on c.id = e.class_id
                       where e.id = p.enrollment_id and c.teacher_id = private.me())
            or exists (select 1 from public.student_package sp join public.package_offer_class oc on oc.offer_id = sp.offer_id
                       join public.class c on c.id = oc.class_id where sp.id = p.package_id and c.teacher_id = private.me())))
$$;

alter table payment_proof enable row level security;
alter table registration_fee enable row level security;

create policy "who sees a screenshot" on payment_proof for select to authenticated using (private.can_read_proof(payment_proof));
create policy "the student uploads" on payment_proof for insert to authenticated with check (private.acts_for(school_id, student_id));
-- Kept, never replaced or deleted: no update or delete for anyone; decisions go through decide_proof.

create policy "the student and the directors see fees" on registration_fee for select to authenticated
    using (private.is_director(school_id) or private.acts_for(school_id, student_id));

grant select on payment_proof, registration_fee to authenticated;
grant insert (id, school_id, student_id, method, covers, session_id, enrollment_id, package_id, month, fee_id, amount, file_path)
    on payment_proof to authenticated;
grant execute on function public.decide_proof(uuid, boolean, text), public.mark_fee_done(uuid) to authenticated;

-- ---- Files: one private bucket; a file is readable when its row is, uploaded once by its owner ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lyra', 'lyra', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

/**
 * What a path is: `{school}/proofs/{student}/{proof}.jpg`, `{school}/cards/{student}/{file}.jpg`,
 * `{school}/family/{guardian}/{file}.jpg`, `{school}/terms/{terms}.pdf`, `{school}/logo/{file}.png`
 * or `staff/{person}/{file}.jpg`. Each is checked against the row that names it (never the folder alone).
 */
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
        else split_part(path, '/', 1) = 'staff' and split_part(path, '/', 2) = private.me()::text
             and exists (select 1 from public.staff_card c where c.photo_path = path and c.person_id = private.me())
    end
$$;

create policy "lyra files: readable with their row" on storage.objects for select to authenticated
    using (bucket_id = 'lyra' and private.file_readable(name));
create policy "lyra files: uploaded once by their owner" on storage.objects for insert to authenticated
    with check (bucket_id = 'lyra' and private.file_uploadable(name));
-- No update or delete policies: nobody replaces a file; deletions go through an Edge Function (rule 20).

grant execute on function private.can_read_proof(public.payment_proof), private.file_readable(text), private.file_uploadable(text),
    private.can_read_card(uuid, uuid), private.family_reader(uuid), private.can_read_staff(uuid) to authenticated;

-- A file's path names its owner, so nobody points their row at someone else's file to read it.
alter table student_card add constraint student_card_photo_path
    check (photo_path is null or photo_path like school_id::text || '/cards/' || student_id::text || '/%');
alter table family_person add constraint family_person_photo_path
    check (photo_path is null or photo_path like school_id::text || '/family/' || guardian_id::text || '/%');
alter table staff_card add constraint staff_card_photo_path
    check (photo_path is null or photo_path like 'staff/' || person_id::text || '/%');
alter table terms add constraint terms_file_path
    check (file_path = school_id::text || '/terms/' || id::text || '.pdf');
alter table school add constraint school_logo_path
    check (logo_path is null or logo_path like id::text || '/logo/%');
