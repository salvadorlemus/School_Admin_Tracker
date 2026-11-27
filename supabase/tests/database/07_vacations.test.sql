-- School-wide vacation dates appear to every active member without changing sessions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create or replace function pg_temp.login(email text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
    insert into auth.users (id, email, aud, role) values (uid, email, 'authenticated', 'authenticated');
    return uid;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
    if uid is null then
        reset role;
        perform set_config('request.jwt.claims', '', true);
    else
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
    end if;
end $$;

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select id from ids where name = key $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Mexico_City')::date $$;

with s as (insert into school (name) values ('Vacations A'), ('Vacations B') returning id, name)
insert into ids select case name when 'Vacations A' then 'A' else 'B' end, id from s;
insert into ids values ('u_dir', pg_temp.login('dir@vac.mx')), ('u_teacher', pg_temp.login('teacher@vac.mx')),
    ('u_student', pg_temp.login('student@vac.mx')), ('u_other', pg_temp.login('other@vac.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
insert into terms (school_id, file_path) select id, 'vacation-terms.pdf' from school;
insert into membership (school_id, person_id, role, status, payment_day) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active', null),
    (pg_temp.id('A'), pg_temp.id('p_teacher'), 'teacher', 'active', null),
    (pg_temp.id('A'), pg_temp.id('p_student'), 'student', 'active', 15),
    (pg_temp.id('B'), pg_temp.id('p_other'), 'student', 'active', 30);

select pg_temp.act_as(pg_temp.id('u_dir'));
select lives_ok($$ select public.set_vacation_dates(pg_temp.id('A'), array[pg_temp.today() + 5, pg_temp.today() + 6]) $$,
    'a director marks vacation dates');
select is((select count(*)::int from school_vacation where school_id = pg_temp.id('A')), 2,
    'each selected date is stored');
select is((select count(*)::int from announcement where school_id = pg_temp.id('A') and kind = 'vacation'), 1,
    'the selection creates one board post');
select is((select vars -> 'dates' from announcement where kind = 'vacation'),
    jsonb_build_array(to_char(pg_temp.today() + 5, 'YYYY-MM-DD'), to_char(pg_temp.today() + 6, 'YYYY-MM-DD')),
    'the board post lists the selected dates');
select is((select count(*)::int from session_log), 0, 'marking vacations does not create cancellation records');
select throws_ok($$ select public.set_vacation_dates(pg_temp.id('A'), array[pg_temp.today() - 1]) $$,
    '22023', null, 'past dates are refused');
select throws_ok($$ select public.set_vacation_dates(pg_temp.id('A'),
    (select array_agg(pg_temp.today() + n) from generate_series(1, 91) n)) $$,
    '22023', null, 'selections are limited to 90 dates');
select throws_ok($$ select public.set_vacation_dates(pg_temp.id('B'), array[pg_temp.today() + 8]) $$,
    '42501', null, 'a director cannot mark dates for another school');
select lives_ok($$ select public.set_vacation_dates(pg_temp.id('A'), array[pg_temp.today() + 5]) $$,
    'marking an existing date is safe');
select is((select count(*)::int from announcement where school_id = pg_temp.id('A') and kind = 'vacation'), 1,
    'repeating dates does not create another board post');
select pg_temp.act_as(pg_temp.id('u_teacher'));
select is((select count(*)::int from school_vacation where school_id = pg_temp.id('A')), 2,
    'a school teacher can read its vacation dates');
select throws_ok($$ select public.set_vacation_dates(pg_temp.id('A'), array[pg_temp.today() + 8]) $$,
    '42501', null, 'a teacher cannot mark vacation dates');
select throws_ok($$ insert into school_vacation (school_id, vacation_date, created_by)
    values (pg_temp.id('A'), pg_temp.today() + 8, pg_temp.id('p_teacher')) $$,
    '42501', null, 'a teacher cannot insert vacation dates directly');

select pg_temp.act_as(pg_temp.id('u_student'));
select is((select count(*)::int from announcement where school_id = pg_temp.id('A') and kind = 'vacation'), 1,
    'a student can read the school-wide vacation post');
select is((select count(*)::int from school_vacation where school_id = pg_temp.id('B')), 0,
    'vacation dates from another school are not visible');

select pg_temp.act_as(pg_temp.id('u_dir'));
select lives_ok($$ select public.set_vacation_dates(pg_temp.id('A'), array[pg_temp.today() + 5, pg_temp.today() + 6], false) $$,
    'a director can remove vacation dates');
select is((select count(*)::int from school_vacation where school_id = pg_temp.id('A')), 0,
    'removed vacation dates no longer mark sessions');
select is((select count(*)::int from announcement where school_id = pg_temp.id('A') and kind = 'vacation_removed'), 1,
    'removing dates creates a board correction');

select * from finish();
rollback;
