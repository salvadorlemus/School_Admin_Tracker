-- Before going live: what the screens need that the first migrations left out.
--
-- 1. Teachers see "terms pending" beside a student (rule 7, the Session screen): the school's staff
--    read its terms acceptances (who accepted which version, and when; nothing else).
-- 2. The admin invites another director to a school (Admin panel › a school › Invite director).
-- 3. The admin reads the directors' sign-in emails, to write to them (Roles: the admin sees the
--    directors' phone and email). Only directors' emails, and only for the admin.

create policy "the school's staff read acceptances" on terms_acceptance for select to authenticated
    using (private.is_staff(school_id));

/** The admin invites another director to a school; they hold the teacher role too, like the first one. */
create or replace function public.admin_invite_director(school uuid, full_name text, email text) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    who uuid;
    member uuid;
begin
    perform private.admin_only();
    if email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(btrim(full_name)) = 0 then
        raise exception 'An email and a name are needed' using errcode = '22023';
    end if;
    if not exists (select 1 from public.school s where s.id = admin_invite_director.school) then
        raise exception 'No such school' using errcode = '22023';
    end if;
    who := private.person_by_email(email);
    if who is null then
        insert into public.person (full_name) values (btrim(admin_invite_director.full_name)) returning id into who;
    end if;
    insert into public.membership (school_id, person_id, role) values (admin_invite_director.school, who, 'director')
    on conflict (school_id, person_id, role) do update set status = case when public.membership.status = 'inactive' then 'invited' else public.membership.status end
    returning id into member;
    insert into public.membership (school_id, person_id, role) values (admin_invite_director.school, who, 'teacher')
    on conflict (school_id, person_id, role) do nothing;
    perform private.issue_invitation(member, email, 'Lyra');
    perform private.log_admin('director_invited', admin_invite_director.school, jsonb_build_object('name', btrim(admin_invite_director.full_name)));
end $$;

/** The directors' sign-in emails, for the admin to write to them. */
create or replace function public.admin_director_emails()
    returns table (school_id uuid, person_id uuid, email text)
    language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.admin_only();
    return query
    select m.school_id, m.person_id, u.email::text
    from public.membership m join public.person p on p.id = m.person_id join auth.users u on u.id = p.user_id
    where m.role = 'director' and m.status <> 'inactive';
end $$;

revoke execute on function public.admin_invite_director(uuid, text, text), public.admin_director_emails() from public, anon;
grant execute on function public.admin_invite_director(uuid, text, text), public.admin_director_emails() to authenticated;
