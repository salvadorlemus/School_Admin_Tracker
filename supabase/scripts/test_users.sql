-- Lyra's test accounts on the online project: the platform admin, and at Helios a director, a teacher,
-- an adult student and a guardian with one child. Run by hand in Supabase → SQL Editor (not a
-- migration). See docs/test-accounts.md.
--
-- First create the five logins in Supabase → Authentication → Users → Add user → Create new user,
-- with "Auto Confirm User" on and the passwords from .env.test.local:
--   prueba.plataforma@kokoasoft.com   platform admin          (TEST_PLATFORM_PASSWORD)
--   prueba.admin@kokoasoft.com        Helios's director       (TEST_ADMIN_PASSWORD)
--   prueba.maestra@kokoasoft.com      a teacher at Helios     (TEST_TEACHER_PASSWORD)
--   prueba.alumna@kokoasoft.com       an adult student        (TEST_STUDENT_PASSWORD)
--   prueba.tutor@kokoasoft.com        a guardian, with a child (TEST_TUTOR_PASSWORD)
-- These addresses have no mailbox (docs/test-accounts.md), so the logins are made here instead of by invitation.
-- Running it again changes nothing.

insert into platform_admin (user_id)
select id from auth.users where email = 'prueba.plataforma@kokoasoft.com'
on conflict do nothing;

do $$
declare
    helios uuid := (select id from school where name = 'Helios');
    tutor uuid;
    child uuid;
begin
    if helios is null then
        insert into school (name) values ('Helios') returning id into helios;
        insert into school_billing (school_id, monthly_fee) values (helios, 0);
    end if;

    -- A school registers no students before its terms: version 1 stands in until the director
    -- uploads the real PDF from Terms (its file doesn't exist until then).
    if not exists (select 1 from terms where school_id = helios) then
        insert into terms (school_id, file_path) values (helios, 'pending');
    end if;

    insert into person (user_id, full_name)
    select id, case email
        when 'prueba.admin@kokoasoft.com' then 'Prueba Dirección'
        when 'prueba.maestra@kokoasoft.com' then 'Prueba Maestra'
        when 'prueba.alumna@kokoasoft.com' then 'Prueba Alumna'
        else 'Prueba Tutora' end
    from auth.users
    where email in ('prueba.admin@kokoasoft.com', 'prueba.maestra@kokoasoft.com', 'prueba.alumna@kokoasoft.com', 'prueba.tutor@kokoasoft.com')
    on conflict (user_id) do nothing;

    -- Staff are active at once. The director also teaches (a director who teaches holds both roles).
    insert into membership (school_id, person_id, role, status)
    select helios, p.id, r.role, 'active'
    from person p join auth.users u on u.id = p.user_id
    cross join lateral (select unnest(case u.email when 'prueba.admin@kokoasoft.com' then array['director', 'teacher']::member_role[]
                                                   else array['teacher']::member_role[] end) as role) r
    where u.email in ('prueba.admin@kokoasoft.com', 'prueba.maestra@kokoasoft.com')
    on conflict (school_id, person_id, role) do nothing;

    -- The student and the guardian start as invited, like anyone registered by a director: their first
    -- sign-in walks through the card and the terms, and that makes them active (rule 14).
    insert into membership (school_id, person_id, role, status, payment_day)
    select helios, p.id, 'student', 'invited', 15
    from person p join auth.users u on u.id = p.user_id where u.email = 'prueba.alumna@kokoasoft.com'
    on conflict (school_id, person_id, role) do nothing;

    select p.id into tutor from person p join auth.users u on u.id = p.user_id where u.email = 'prueba.tutor@kokoasoft.com';
    if tutor is not null then
        insert into membership (school_id, person_id, role, status) values (helios, tutor, 'guardian', 'invited')
        on conflict (school_id, person_id, role) do nothing;
        -- Their child: a minor with no login, made once.
        select student_id into child from guardian_link where school_id = helios and guardian_id = tutor limit 1;
        if child is null then
            insert into person (full_name) values ('Prueba Niña') returning id into child;
            insert into membership (school_id, person_id, role, status, minor, payment_day) values (helios, child, 'student', 'invited', true, 30);
            insert into guardian_link (school_id, guardian_id, student_id) values (helios, tutor, child);
        end if;
    end if;
end $$;

-- What's set up: each account, its school and roles (and the guardian's child).
select u.email, coalesce(s.name, '(platform)') as school, string_agg(m.role::text || ' ' || m.status::text, ', ') as roles,
       exists (select 1 from platform_admin a where a.user_id = u.id) as platform_admin
from auth.users u
left join person p on p.user_id = u.id
left join membership m on m.person_id = p.id
left join school s on s.id = m.school_id
where u.email like 'prueba.%@kokoasoft.com'
group by u.email, s.name, u.id
union all
select '  └ child of prueba.tutor', s.name, string_agg(m.role::text || ' ' || m.status::text || case when m.minor then ' (minor)' else '' end, ', '), false
from guardian_link g join person t on t.id = g.guardian_id join auth.users u on u.id = t.user_id and u.email = 'prueba.tutor@kokoasoft.com'
join membership m on m.person_id = g.student_id and m.school_id = g.school_id join school s on s.id = g.school_id
group by s.name
order by 1;
