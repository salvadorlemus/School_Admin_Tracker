-- Invitations, creating and deleting schools, and the worker that sends email and removes files.
--
-- Every login starts from an invitation: directors by the admin; teachers, students and guardians by a
-- director. The link works once, for 24 hours; a new one cancels the old; only its hash is kept, and
-- whoever invited never sees it (the email does). The answer is the same whether the person was new or
-- already had a login, and a director learns nothing about the person's other schools.

alter table invitation add column email text not null default '' check (length(email) <= 320);
alter table invitation add column invited_by_name text;

/** A person by email: their login's, or one invited earlier who hasn't signed in yet. */
create or replace function private.person_by_email(address text) returns uuid
    language sql stable security definer set search_path = '' as $$
    select coalesce(
        (select p.id from public.person p join auth.users u on u.id = p.user_id where lower(u.email) = lower(address)),
        (select m.person_id from public.invitation i join public.membership m on m.id = i.membership_id
         join public.person p on p.id = m.person_id where lower(i.email) = lower(address) and p.user_id is null
         order by i.sent_at desc limit 1))
$$;

/** Issues an invitation for a membership and queues its email; earlier links for it stop working. */
create or replace function private.issue_invitation(membership uuid, address text, inviter text) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    token text := encode(extensions.gen_random_bytes(24), 'hex');
    m public.membership;
    has_login boolean;
begin
    select * into m from public.membership where id = issue_invitation.membership;
    has_login := exists (select 1 from public.person where id = m.person_id and user_id is not null);
    insert into public.invitation (membership_id, token_hash, email, sent_by, invited_by_name)
    values (membership, extensions.digest(token, 'sha256'), lower(btrim(address)), private.me(), inviter);
    insert into public.email_outbox (to_email, school_id, kind, vars)
    values (lower(btrim(address)), m.school_id, case when has_login and m.role in ('student', 'guardian') then 'added_to_school' else 'invite' end,
            jsonb_build_object('token', token, 'role', m.role, 'inviter', inviter, 'school_name', (select s.name from public.school s where s.id = m.school_id),
                               'terms_path', case when m.role in ('student', 'guardian') then (select t.file_path from public.terms t where t.id = private.latest_terms(m.school_id)) end));
end $$;

/**
 * A director invites a teacher, registers an adult student, or registers a guardian with their minor
 * children (`children`: [{full_name, payment_day}]). The same person gets one login whatever their
 * schools; the answer never says whether they existed.
 */
create or replace function public.invite(school uuid, role public.member_role, email text, full_name text, payment_day smallint default null,
                                         children jsonb default '[]') returns void
    language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
    who uuid;
    member uuid;
    child jsonb;
    kid uuid;
    inviter text := (select p.full_name from public.person p where p.id = private.me());
begin
    if invite.role = 'director' then
        raise exception 'Only the platform admin invites directors' using errcode = '42501';
    end if;
    if not private.is_director(invite.school) then
        raise exception 'Only the school''s directors invite people' using errcode = '42501';
    end if;
    if invite.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(btrim(invite.full_name)) = 0 then
        raise exception 'An email and a name are needed' using errcode = '22023';
    end if;
    if invite.role = 'student' and invite.payment_day is null then
        raise exception 'A student needs their payment day' using errcode = '22023';
    end if;
    if invite.role = 'guardian' and jsonb_array_length(invite.children) = 0 then
        raise exception 'A guardian is registered with at least one child' using errcode = '22023';
    end if;
    who := private.person_by_email(invite.email);
    if who is null then
        insert into public.person (full_name) values (btrim(invite.full_name)) returning id into who;
    end if;
    insert into public.membership (school_id, person_id, role, payment_day)
    values (invite.school, who, invite.role, case when invite.role = 'student' then invite.payment_day end)
    on conflict (school_id, person_id, role) do update set status = case when public.membership.status = 'inactive' then 'invited' else public.membership.status end
    returning id into member;
    -- A guardian's children: minors with no login, registered with them.
    for child in select * from jsonb_array_elements(invite.children) loop
        insert into public.person (full_name) values (btrim(child ->> 'full_name')) returning id into kid;
        insert into public.membership (school_id, person_id, role, minor, payment_day)
        values (invite.school, kid, 'student', true, coalesce((child ->> 'payment_day')::smallint, 30));
        insert into public.guardian_link values (invite.school, who, kid);
    end loop;
    perform private.issue_invitation(member, invite.email, inviter);
end $$;

/** Sends the invitation again (the old link stops working). The director never sees the link. */
create or replace function public.resend_invitation(membership uuid) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    m public.membership;
    last_email text;
begin
    select * into m from public.membership where id = resend_invitation.membership;
    if m.id is null or not ((m.role = 'director' and private.is_platform_admin()) or (m.role <> 'director' and private.is_director(m.school_id))) then
        raise exception 'Only whoever invites can resend' using errcode = '42501';
    end if;
    if m.status <> 'invited' then
        raise exception 'This person already registered' using errcode = 'P0001';
    end if;
    select i.email into last_email from public.invitation i where i.membership_id = m.id order by i.sent_at desc limit 1;
    perform private.issue_invitation(m.id, last_email, coalesce((select p.full_name from public.person p where p.id = private.me()), 'Lyra'));
end $$;

/** The admin registers a school with its first director, whose invitation is sent. */
create or replace function public.admin_create_school(name text, director_name text, director_email text, time_zone text default 'America/Mexico_City',
                                                      monthly_fee numeric default 0) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    school uuid;
    who uuid;
    member uuid;
begin
    perform private.admin_only();
    insert into public.school (name, time_zone) values (btrim(admin_create_school.name), admin_create_school.time_zone) returning id into school;
    insert into public.school_billing (school_id, monthly_fee) values (school, monthly_fee);
    who := private.person_by_email(director_email);
    if who is null then
        insert into public.person (full_name) values (btrim(director_name)) returning id into who;
    end if;
    insert into public.membership (school_id, person_id, role) values (school, who, 'director') returning id into member;
    -- A director who teaches holds both roles; the teacher one too, so their classes can be theirs.
    insert into public.membership (school_id, person_id, role) values (school, who, 'teacher');
    perform private.issue_invitation(member, director_email, 'Lyra');
    perform private.log_admin('school_created', school, jsonb_build_object('director_email', lower(director_email)));
    return school;
end $$;

/**
 * The admin deletes a disabled school after typing its name: its files go with it, and so do the
 * logins of people who belonged to no other school. The log keeps its name.
 */
create or replace function public.admin_delete_school(school uuid, typed_name text) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    s public.school;
begin
    perform private.admin_only();
    select * into s from public.school where id = admin_delete_school.school for update;
    if s.id is null or s.enabled then
        raise exception 'Only a disabled school can be deleted' using errcode = 'P0001';
    end if;
    if btrim(typed_name) <> s.name then
        raise exception 'Type the school''s name exactly' using errcode = '22023';
    end if;
    perform private.log_admin('school_deleted', s.id, jsonb_build_object('name', s.name));
    insert into public.file_deletion (path) select o.name from storage.objects o where o.bucket_id = 'lyra' and o.name like s.id::text || '/%'
    on conflict do nothing;
    insert into public.login_deletion (user_id)
    select p.user_id from public.person p where p.user_id is not null
      and exists (select 1 from public.membership m where m.person_id = p.id and m.school_id = s.id)
      and not exists (select 1 from public.membership m where m.person_id = p.id and m.school_id <> s.id)
    on conflict do nothing;
    delete from public.school where id = s.id;
    delete from public.person p where not exists (select 1 from public.membership m where m.person_id = p.id)
      and (p.user_id is null or p.user_id in (select user_id from public.login_deletion));
end $$;

-- ---- The invitation page (no login yet): the Edge Function calls these with the secret key ----

/** What the page shows before anything is spent: who invited, to which school, as what, and whether they already have a login. */
create or replace function public.invitation_peek(token text) returns jsonb
    language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('ok', i.used_at is null and i.cancelled_at is null and i.expires_at > now(),
                              'expired', i.expires_at <= now(), 'used', i.used_at is not null, 'cancelled', i.cancelled_at is not null,
                              'email', i.email, 'inviter', i.invited_by_name, 'school', s.name, 'role', m.role,
                              'name', p.full_name, 'has_login', p.user_id is not null)
    from public.invitation i join public.membership m on m.id = i.membership_id join public.school s on s.id = m.school_id
    join public.person p on p.id = m.person_id
    where i.token_hash = extensions.digest(token, 'sha256')
$$;

/**
 * Spends the invitation once the login exists: links it to the person, and makes a teacher or
 * director active (a student or guardian becomes active once their card and the terms are done).
 */
create or replace function public.redeem_invitation(token text, login uuid) returns jsonb
    language plpgsql security definer set search_path = '' as $$
declare
    i public.invitation;
    m public.membership;
begin
    select * into i from public.invitation where token_hash = extensions.digest(token, 'sha256') for update;
    if i.id is null or i.used_at is not null or i.cancelled_at is not null or i.expires_at <= now() then
        raise exception 'This link has expired or was already used' using errcode = 'P0001';
    end if;
    select * into m from public.membership where id = i.membership_id;
    update public.person set user_id = login where id = m.person_id and user_id is null;
    if (select user_id from public.person where id = m.person_id) <> login then
        raise exception 'This invitation is for another login' using errcode = '42501';
    end if;
    update public.invitation set used_at = now() where id = i.id;
    update public.membership set status = 'active' where person_id = m.person_id and school_id = m.school_id
        and role in ('teacher', 'director') and status = 'invited';
    return jsonb_build_object('school_id', m.school_id, 'role', m.role);
end $$;

-- ---- The worker: an Edge Function with the secret key, called every few minutes by pg_cron ----

/** The emails to send, oldest first, a few at a time (failures retried up to 5 times). */
create or replace function public.next_emails(how_many integer default 20) returns setof public.email_outbox
    language sql security definer set search_path = '' as $$
    update public.email_outbox set attempts = attempts + 1
    where id in (select id from public.email_outbox where sent_at is null and attempts < 5 order by created_at limit how_many for update skip locked)
    returning *
$$;

create or replace function public.email_sent(email uuid, error text default null) returns void
    language sql security definer set search_path = '' as $$
    update public.email_outbox set sent_at = case when error is null then now() end, last_error = error where id = email
$$;

-- The Edge Functions run as service_role (the secret key): only they run these, through the API.
grant execute on function public.invitation_peek(text), public.redeem_invitation(text, uuid), public.next_emails(integer),
    public.email_sent(uuid, text) to service_role;
grant select, delete on public.file_deletion, public.login_deletion to service_role;

grant execute on function public.invite(uuid, member_role, text, text, smallint, jsonb), public.resend_invitation(uuid),
    public.admin_create_school(text, text, text, text, numeric), public.admin_delete_school(uuid, text) to authenticated;
revoke execute on function private.person_by_email(text), private.issue_invitation(uuid, text, text) from public, anon, authenticated;

-- Every 2 minutes, pg_cron calls the worker with the shared WORKER_SECRET kept in the vault (`lyra_worker_key`,
-- set once by the owner; until then the job does nothing).
create extension if not exists pg_net;

create or replace function private.call_worker() returns void
    language plpgsql security definer set search_path = '' as $$
declare
    key text := (select decrypted_secret from vault.decrypted_secrets where name = 'lyra_worker_key');
    url text := (select decrypted_secret from vault.decrypted_secrets where name = 'lyra_project_url');
begin
    if key is null or url is null then return; end if;
    if not exists (select 1 from public.email_outbox where sent_at is null and attempts < 5)
        and not exists (select 1 from public.file_deletion) and not exists (select 1 from public.login_deletion) then
        return;
    end if;
    perform net.http_post(url := url || '/functions/v1/worker', headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
                          body := '{}'::jsonb);
end $$;

select cron.schedule('lyra-worker', '*/2 * * * *', 'select private.call_worker()');

revoke execute on function public.invitation_peek(text), public.redeem_invitation(text, uuid), public.next_emails(integer),
    public.email_sent(uuid, text) from public, anon, authenticated;
