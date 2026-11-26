-- Schools keep to their own rows (rule 1), and sessions change only through the director's functions (rule 17).
-- `npx supabase test db` runs it on the local database, inside a transaction that's rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ---- People: two schools, A and B; a director, a teacher and two students ----

create or replace function pg_temp.login(email text) returns uuid language plpgsql as $$
declare
    uid uuid := gen_random_uuid();
begin
    insert into auth.users (id, email, aud, role) values (uid, email, 'authenticated', 'authenticated');
    return uid;
end $$;

-- Acting as someone: the API's role, with their user id in the JWT claims (null: the test's superuser again).
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

with s as (insert into school (name) values ('Escuela A'), ('Escuela B') returning id, name)
insert into ids select case name when 'Escuela A' then 'A' else 'B' end, id from s;

insert into ids values ('u_dir', pg_temp.login('dir@a.mx')), ('u_teach', pg_temp.login('teach@a.mx')),
    ('u_stud', pg_temp.login('stud@a.mx')), ('u_studb', pg_temp.login('stud@b.mx')), ('u_admin', pg_temp.login('admin@lyra.mx'));
insert into platform_admin values ((select id from ids where name = 'u_admin'));

insert into person (id, user_id, full_name)
select gen_random_uuid(), id, initcap(name) from ids where name like 'u\_%' and name <> 'u_admin';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id where i.name like 'u\_%';

create function pg_temp.id(key text) returns uuid language sql as $$ select id from ids where name = key $$;

insert into terms (school_id, file_path) select id, 'terms.pdf' from school where id in (pg_temp.id('A'), pg_temp.id('B'));
insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active');
insert into membership (school_id, person_id, role, status, payment_day) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), 'student', 'active', 15),
    (pg_temp.id('B'), pg_temp.id('p_studb'), 'student', 'active', 30);

insert into room (id, school_id, name) values (gen_random_uuid(), pg_temp.id('B'), 'Sala B');

-- ---- A director sets up A's week ----

select pg_temp.act_as(pg_temp.id('u_dir'));

insert into room (id, school_id, name, max_students) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón principal', 30);
select lives_ok($$ insert into class (id, school_id, name, teacher_id) values
    ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_teach')) $$,
    'a director adds a class with a teacher of the school');
select throws_ok($$ insert into room (school_id, name) values (pg_temp.id('B'), 'Intrusa') $$, '42501', null,
    'a director can''t add rooms to another school');
select throws_ok($$ insert into class (school_id, name, teacher_id) values (pg_temp.id('A'), 'Sin maestro', pg_temp.id('p_stud')) $$,
    '23514', null, 'a class''s teacher must be a teacher of the school');

-- Mondays and Wednesdays for four weeks, from next Monday.
insert into schedule (school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id)
select pg_temp.id('A'), '00000000-0000-0000-0000-00000000c001', d, '18:00', '20:00',
       current_date + (8 - extract(isodow from current_date)::int), current_date + (8 - extract(isodow from current_date)::int) + 27,
       '00000000-0000-0000-0000-00000000a001'
from unnest(array[1, 3]) d;

select is((select count(*)::int from session where class_id = '00000000-0000-0000-0000-00000000c001'), 8,
    'a schedule generates its sessions: two a week for four weeks');
select is((select distinct to_char(starts_at at time zone 'America/Mexico_City', 'HH24:MI') from session
           where class_id = '00000000-0000-0000-0000-00000000c001'), '18:00', 'sessions start at the schedule''s time, in the school''s time zone');
select throws_ok($$ select * from session_secret $$, '42501', null, 'nobody reads the check-in secrets');
select throws_ok($$ select private.code_at((select id from session limit 1), 1) $$, '42501', null, 'nobody computes a check-in code from SQL');
select throws_ok($$ select private.delete_student_data(pg_temp.id('A'), pg_temp.id('p_stud')) $$, '42501', null, 'internal functions (deleting data) can''t be called by users');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')), 0, 'signed-out visitors run no function at all');

-- ---- Each school sees only its own ----

select pg_temp.act_as(pg_temp.id('u_stud'));
select is((select count(*)::int from room), 1, 'a student sees their school''s rooms only');
select is((select count(*)::int from session), 8, 'a student sees their school''s sessions');
select is((select count(*)::int from person where id = pg_temp.id('p_teach')), 1, 'a student sees their teacher''s name');
select is((select count(*)::int from person where id = pg_temp.id('p_studb')), 0, 'a student never sees another school''s people');
select throws_ok($$ select public.session_code((select id from session limit 1)) $$, '42501', null, 'a student can''t get the check-in code');
select throws_ok($$ select public.cancel_session((select id from session limit 1)) $$, '42501', null, 'a student can''t cancel a session');

select pg_temp.act_as(pg_temp.id('u_studb'));
select is((select count(*)::int from session), 0, 'another school''s student sees none of A''s sessions');

-- ---- The teacher gets the code; only directors change sessions ----

select pg_temp.act_as(pg_temp.id('u_teach'));
select matches(public.session_code((select id from session order by starts_at limit 1)), '^[0-9A-F]{10}$', 'the teacher gets the session''s code');
select throws_ok($$ select public.cancel_session((select id from session order by starts_at limit 1)) $$, '42501', null, 'a teacher can''t cancel a session');
select throws_ok($$ insert into class (school_id, name, teacher_id) values (pg_temp.id('A'), 'Mía', pg_temp.id('p_teach')) $$, '42501', null,
    'a teacher can''t add classes');

select pg_temp.act_as(pg_temp.id('u_dir'));
select public.cancel_session((select id from session order by starts_at limit 1));
select is((select count(*)::int from session_log where change = 'cancelled'), 1, 'a cancellation is logged');
select isnt(public.move_session((select id from session where status = 'scheduled' order by starts_at limit 1),
    now() + interval '20 days', now() + interval '20 days 2 hours', '00000000-0000-0000-0000-00000000a001'), null, 'moving a session returns its replacement');
select is((select count(*)::int from session where replaces_id is not null), 1, 'the replacement points at the session it replaces');
select throws_ok($$ update room set archived_at = now() where id = '00000000-0000-0000-0000-00000000a001' $$, 'P0001', null,
    'a room with sessions ahead can''t be archived');
select public.end_class('00000000-0000-0000-0000-00000000c001',
    (select id from session where status = 'scheduled' and schedule_id is not null order by starts_at offset 2 limit 1));
select is((select count(*)::int from session where class_id = '00000000-0000-0000-0000-00000000c001' and schedule_id is not null
           and starts_at > (select starts_at from session where status = 'scheduled' and schedule_id is not null order by starts_at offset 2 limit 1)), 0,
    'ending a class takes its later sessions off the calendar');

-- ---- The school's details are the admin's; a director can't step down on their own ----

select throws_ok($$ update school set enabled = false where id = pg_temp.id('A') $$, '42501', null, 'a director can''t disable their school');
select throws_ok($$ update membership set status = 'inactive' where person_id = pg_temp.id('p_dir') $$, 'P0001', null,
    'a director can''t deactivate themselves');

select pg_temp.act_as(pg_temp.id('u_admin'));
update school set enabled = false where id = pg_temp.id('A');
select pg_temp.act_as(pg_temp.id('u_stud'));
select is((select count(*)::int from session), 0, 'a disabled school''s people see nothing');

select * from finish();
rollback;
