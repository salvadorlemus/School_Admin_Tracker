-- Student cards, a guardian's family list, staff cards, and each school's terms (rules 13, 14, 18, 19).
--
-- A card holds health data (sensitive under Mexico's LFPDPPP): only the student (or guardian), the
-- school's directors and the teachers of the classes the student takes now read it, and never across
-- schools. Every change is logged for the directors. Registration completes, and the membership turns
-- active, once the card is declared true and the school's latest terms are accepted.

/** A student's file at one school: never copied to another (rule 18). */
create table student_card (
    id            uuid primary key default gen_random_uuid(),
    school_id     uuid not null references school on delete cascade,
    student_id    uuid not null references person on delete cascade,
    full_name     text not null check (length(btrim(full_name)) between 1 and 200),
    birth_date    date check (birth_date > '1900-01-01'),
    photo_path    text,
    health_notes  text check (length(health_notes) <= 4000),
    /** Deactivated by a director: hidden from teachers (rule 20). */
    active        boolean not null default true,
    /** "I declare that everything I wrote here is true": who and when. */
    declared_by   uuid references person,
    declared_at   timestamptz,
    updated_at    timestamptz not null default now(),
    unique (school_id, student_id)
);

/** An adult student's emergency contacts (a minor's come from the guardian's family list). */
create table emergency_contact (
    id         uuid primary key default gen_random_uuid(),
    card_id    uuid not null references student_card on delete cascade,
    name       text not null check (length(btrim(name)) between 1 and 200),
    relation   text not null check (length(relation) between 1 and 60),
    phone      text not null check (length(phone) between 1 and 40)
);
create index on emergency_contact (card_id);

/** A guardian's people at a school, entered once for all their children there. */
create table family_person (
    id            uuid primary key default gen_random_uuid(),
    school_id     uuid not null references school on delete cascade,
    guardian_id   uuid not null references person on delete cascade,
    name          text not null check (length(btrim(name)) between 1 and 200),
    relation      text not null check (length(relation) between 1 and 60),
    phone         text check (length(phone) <= 40),
    photo_path    text,
    is_emergency  boolean not null default false,
    can_pick_up   boolean not null default false,
    /** The guardian declared they have this person's consent to share their photo (once per person). */
    consent_by    uuid references person,
    consent_at    timestamptz,
    check (not is_emergency or phone is not null),
    check (not can_pick_up or (photo_path is not null and consent_at is not null))
);
create index on family_person (school_id, guardian_id);

create table family_person_child (
    family_person_id  uuid not null references family_person on delete cascade,
    student_id        uuid not null references person on delete cascade,
    primary key (family_person_id, student_id)
);

/** Every change to a card (and to the family people it shows): what, who, when. Directors only. */
create table student_card_log (
    id          uuid primary key default gen_random_uuid(),
    school_id   uuid not null references school on delete cascade,
    student_id  uuid not null references person on delete cascade,
    what        text not null,
    old_value   jsonb,
    new_value   jsonb,
    created_by  uuid references person,
    created_at  timestamptz not null default now()
);
create index on student_card_log (school_id, student_id, created_at desc);

/** A teacher's or director's card, one for all their schools. */
create table staff_card (
    person_id     uuid primary key references person on delete cascade,
    photo_path    text,
    health_notes  text check (length(health_notes) <= 4000),
    updated_at    timestamptz not null default now()
);

create table staff_emergency_contact (
    id         uuid primary key default gen_random_uuid(),
    person_id  uuid not null references staff_card on delete cascade,
    name       text not null check (length(btrim(name)) between 1 and 200),
    relation   text not null check (length(relation) between 1 and 60),
    phone      text not null check (length(phone) between 1 and 40)
);

/** Each school's terms: a new upload is a new version, never a replacement. */
create table terms (
    id           uuid primary key default gen_random_uuid(),
    school_id    uuid not null references school on delete cascade,
    version      integer not null,
    file_path    text not null,
    uploaded_by  uuid references person,
    uploaded_at  timestamptz not null default now(),
    unique (school_id, version)
);

create table terms_acceptance (
    id           uuid primary key default gen_random_uuid(),
    school_id    uuid not null references school on delete cascade,
    terms_id     uuid not null references terms on delete cascade,
    student_id   uuid not null references person on delete cascade,
    accepted_by  uuid references person,
    accepted_at  timestamptz not null default now(),
    unique (terms_id, student_id)
);

-- ---- Who reads a card (rule 19) ----

/** Whether a teacher gives one of the student's classes now, or substitutes in one of them today. */
create or replace function private.teaches_student(school uuid, student uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.is_member(school, '{teacher}') and exists (
        select 1 from public.class c
        where c.school_id = school
          and private.takes_class(student, c.id, private.school_today(school))
          and (c.teacher_id = private.me()
               or exists (select 1 from public.session s join public.school sc on sc.id = s.school_id
                          where s.class_id = c.id and s.substitute_id = private.me()
                            and (s.starts_at at time zone sc.time_zone)::date = private.school_today(school))))
$$;

create or replace function private.can_read_card(school uuid, student uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.acts_for(school, student, true)
        or private.is_director(school)
        or (private.teaches_student(school, student)
            and exists (select 1 from public.student_card k where k.school_id = school and k.student_id = student and k.active)
            and exists (select 1 from public.membership m where m.school_id = school and m.person_id = student and m.role = 'student' and m.status = 'active'))
$$;

/** Whether the signed-in guardian answers for any of a family person's children. */
create or replace function private.family_reader(fp uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.family_person f where f.id = fp and f.guardian_id = private.me())
        or exists (select 1 from public.family_person f join public.family_person_child c on c.family_person_id = f.id
                   where f.id = fp and private.can_read_card(f.school_id, c.student_id))
$$;

-- ---- Writing a card: the student (or guardian) fills it in; a director only deactivates it ----

create or replace function private.card_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    own boolean := private.acts_for(new.school_id, new.student_id, true);
    changed jsonb;
begin
    if tg_op = 'UPDATE' and not own then
        if (to_jsonb(new) - 'active' - 'updated_at') is distinct from (to_jsonb(old) - 'active' - 'updated_at') then
            raise exception 'Only the student (or their guardian) edits the card' using errcode = '42501';
        end if;
    end if;
    -- The declaration is the database's: who and when, stamped the first time it's ticked, never undone.
    if new.declared_at is not null and (tg_op = 'INSERT' or old.declared_at is null) then
        new.declared_by := private.me();
        new.declared_at := now();
    elsif tg_op = 'UPDATE' then
        new.declared_by := old.declared_by;
        new.declared_at := old.declared_at;
    end if;
    new.updated_at := now();
    if tg_op = 'UPDATE' then
        select jsonb_object_agg(key, value) into changed from jsonb_each(to_jsonb(new))
        where key not in ('updated_at', 'declared_by', 'declared_at') and value is distinct from to_jsonb(old) -> key;
        if changed is not null then
            insert into public.student_card_log (school_id, student_id, what, old_value, new_value, created_by)
            values (new.school_id, new.student_id, 'card',
                    (select jsonb_object_agg(key, to_jsonb(old) -> key) from jsonb_object_keys(changed) key), changed, private.me());
        end if;
    end if;
    return new;
end $$;

create trigger card_saved before insert or update on student_card
    for each row execute function private.card_saved();

/** Contacts and family people: each change logged on the cards it touches. */
create or replace function private.card_part_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
declare
    row_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    row_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    k public.student_card;
begin
    if tg_table_name = 'emergency_contact' then
        select * into k from public.student_card where id = coalesce(new.card_id, old.card_id);
        insert into public.student_card_log (school_id, student_id, what, old_value, new_value, created_by)
        values (k.school_id, k.student_id, 'emergency_contact', row_old, row_new, private.me());
    else
        insert into public.student_card_log (school_id, student_id, what, old_value, new_value, created_by)
        select f.school_id, c.student_id, 'family_person', row_old, row_new, private.me()
        from public.family_person f join public.family_person_child c on c.family_person_id = f.id
        where f.id = coalesce(new.id, old.id);
    end if;
    return coalesce(new, old);
end $$;

create trigger emergency_contact_saved after insert or update or delete on emergency_contact
    for each row execute function private.card_part_saved();
create trigger family_person_saved after update or delete on family_person
    for each row execute function private.card_part_saved();

/** Consent to share a photo: stamped once per person (editing later keeps it). */
create or replace function private.family_person_stamp() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.consent_at is not null and (tg_op = 'INSERT' or old.consent_at is null) then
        new.consent_by := private.me();
        new.consent_at := now();
    elsif tg_op = 'UPDATE' then
        new.consent_by := old.consent_by;
        new.consent_at := old.consent_at;
    end if;
    return new;
end $$;

create trigger family_person_stamp before insert or update on family_person
    for each row execute function private.family_person_stamp();

/** A family person is for the guardian's own children at that school. */
create or replace function private.family_child_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.family_person f join public.guardian_link g
                       on g.school_id = f.school_id and g.guardian_id = f.guardian_id and g.student_id = new.student_id
                   where f.id = new.family_person_id) then
        raise exception 'A family person is for the guardian''s own children' using errcode = '23514';
    end if;
    return new;
end $$;

create trigger family_child_saved before insert or update on family_person_child
    for each row execute function private.family_child_saved();

-- ---- Terms ----

/** A new upload is the next version, stamped with who and when. */
create or replace function private.terms_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform pg_advisory_xact_lock(hashtext(new.school_id::text));
    select coalesce(max(version), 0) + 1 into new.version from public.terms where school_id = new.school_id;
    -- Its file goes where its id says: the app uploads it there after saving the row.
    new.file_path := format('%s/terms/%s.pdf', new.school_id, new.id);
    new.uploaded_by := private.me();
    new.uploaded_at := now();
    return new;
end $$;

create trigger terms_saved before insert on terms
    for each row execute function private.terms_saved();

create or replace function private.latest_terms(school uuid) returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from public.terms where school_id = school order by version desc limit 1
$$;

create or replace function private.terms_ok(school uuid, student uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select private.latest_terms(school) is null
        or exists (select 1 from public.terms_acceptance a where a.terms_id = private.latest_terms(school) and a.student_id = student)
$$;

/** An acceptance is for the school's latest version, by whoever acts for the student, stamped. */
create or replace function private.acceptance_saved() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.terms_id <> private.latest_terms(new.school_id) then
        raise exception 'Only the latest terms can be accepted' using errcode = 'P0001';
    end if;
    new.accepted_by := private.me();
    new.accepted_at := now();
    return new;
end $$;

create trigger acceptance_saved before insert on terms_acceptance
    for each row execute function private.acceptance_saved();

/** A school registers no students until it has uploaded its terms. */
create or replace function private.student_needs_terms() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if new.role = 'student' and private.latest_terms(new.school_id) is null then
        raise exception 'Upload the school''s terms before registering students' using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger student_needs_terms before insert on membership
    for each row execute function private.student_needs_terms();

-- ---- Registration completes once the card is declared and the terms accepted (rule 14) ----

create or replace function private.complete_registration(school uuid, student uuid) returns void
    language plpgsql security definer set search_path = '' as $$
begin
    if exists (select 1 from public.student_card where school_id = school and student_id = student and declared_at is not null)
        and private.terms_ok(school, student) then
        update public.membership set status = 'active'
        where school_id = school and person_id = student and role = 'student' and status = 'invited';
        -- The guardian who did it is registered too.
        update public.membership m set status = 'active'
        where m.school_id = school and m.person_id = private.me() and m.role = 'guardian' and m.status = 'invited'
          and exists (select 1 from public.guardian_link g where g.school_id = school and g.guardian_id = m.person_id and g.student_id = student);
    end if;
end $$;

create or replace function private.registration_step() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    perform private.complete_registration(new.school_id, new.student_id);
    return new;
end $$;

create trigger card_registration after insert or update of declared_at on student_card
    for each row execute function private.registration_step();
create trigger terms_registration after insert on terms_acceptance
    for each row execute function private.registration_step();

-- ---- Policies ----

alter table student_card enable row level security;
alter table emergency_contact enable row level security;
alter table family_person enable row level security;
alter table family_person_child enable row level security;
alter table student_card_log enable row level security;
alter table staff_card enable row level security;
alter table staff_emergency_contact enable row level security;
alter table terms enable row level security;
alter table terms_acceptance enable row level security;

create policy "who reads a card" on student_card for select to authenticated using (private.can_read_card(school_id, student_id));
create policy "the student fills in their card" on student_card for insert to authenticated
    with check (private.acts_for(school_id, student_id, true));
create policy "the student edits, a director deactivates" on student_card for update to authenticated
    using (private.acts_for(school_id, student_id, true) or private.is_director(school_id))
    with check (private.acts_for(school_id, student_id, true) or private.is_director(school_id));

create policy "who reads a card reads its contacts" on emergency_contact for select to authenticated
    using (exists (select 1 from student_card k where k.id = card_id and private.can_read_card(k.school_id, k.student_id)));
create policy "the student keeps their contacts" on emergency_contact for all to authenticated
    using (exists (select 1 from student_card k where k.id = card_id and private.acts_for(k.school_id, k.student_id, true)))
    with check (exists (select 1 from student_card k where k.id = card_id and private.acts_for(k.school_id, k.student_id, true)));

create policy "the guardian and their children's readers" on family_person for select to authenticated using (private.family_reader(id));
create policy "the guardian keeps their family list" on family_person for all to authenticated
    using (guardian_id = private.me() and private.is_member(school_id, '{guardian}')
           or guardian_id = private.me() and exists (select 1 from membership m where m.school_id = family_person.school_id
                                                     and m.person_id = private.me() and m.role = 'guardian' and m.status = 'invited'))
    with check (guardian_id = private.me());

create policy "family children, for the same readers" on family_person_child for select to authenticated
    using (private.family_reader(family_person_id));
create policy "the guardian picks the children" on family_person_child for all to authenticated
    using (exists (select 1 from family_person f where f.id = family_person_id and f.guardian_id = private.me()))
    -- Only the guardian's own children at that school (the trigger says why when it refuses).
    with check (exists (select 1 from family_person f join guardian_link g
                            on g.school_id = f.school_id and g.guardian_id = f.guardian_id and g.student_id = family_person_child.student_id
                        where f.id = family_person_id and f.guardian_id = private.me()));

create policy "directors read card changes" on student_card_log for select to authenticated using (private.is_director(school_id));

-- A staff card: the person, and the directors of the schools where they teach or direct now.
create or replace function private.can_read_staff(p uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select p = private.me() or exists (
        select 1 from public.membership m
        where m.person_id = p and m.role in ('teacher', 'director') and m.status = 'active' and private.is_director(m.school_id))
$$;

create policy "the person and their directors" on staff_card for select to authenticated using (private.can_read_staff(person_id));
create policy "your own staff card" on staff_card for all to authenticated
    using (person_id = private.me()) with check (person_id = private.me());
create policy "staff contacts, same readers" on staff_emergency_contact for select to authenticated using (private.can_read_staff(person_id));
create policy "your own staff contacts" on staff_emergency_contact for all to authenticated
    using (person_id = private.me()) with check (person_id = private.me());

-- Terms: the school's members, and whoever is invited to it (rule 1).
create policy "members and invited people read the terms" on terms for select to authenticated
    using (private.is_member(school_id)
        or exists (select 1 from membership m where m.school_id = terms.school_id and m.person_id = private.me() and m.status = 'invited'));
create policy "directors upload terms" on terms for insert to authenticated with check (private.is_director(school_id));

create policy "who reads acceptances" on terms_acceptance for select to authenticated
    using (private.is_director(school_id) or private.acts_for(school_id, student_id, true));
create policy "the student (or guardian) accepts" on terms_acceptance for insert to authenticated
    with check (private.acts_for(school_id, student_id, true));

-- ---- Privileges ----

grant select on student_card, emergency_contact, family_person, family_person_child, student_card_log,
    staff_card, staff_emergency_contact, terms, terms_acceptance to authenticated;
grant insert (id, school_id, student_id, full_name, birth_date, photo_path, health_notes, declared_at) on student_card to authenticated;
grant update (full_name, birth_date, photo_path, health_notes, declared_at, active) on student_card to authenticated;
grant insert, update, delete on emergency_contact, staff_emergency_contact to authenticated;
-- A child is added to or taken off a family person, never swapped in place.
grant insert, delete on family_person_child to authenticated;
grant insert (id, school_id, guardian_id, name, relation, phone, photo_path, is_emergency, can_pick_up, consent_at) on family_person to authenticated;
grant update (name, relation, phone, photo_path, is_emergency, can_pick_up, consent_at) on family_person to authenticated;
grant delete on family_person to authenticated;
grant insert (person_id, photo_path, health_notes) on staff_card to authenticated;
grant update (photo_path, health_notes) on staff_card to authenticated;
grant insert (id, school_id, file_path) on terms to authenticated;
grant insert (id, school_id, terms_id, student_id) on terms_acceptance to authenticated;
