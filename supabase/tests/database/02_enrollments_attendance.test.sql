-- Students choose their classes (rule 4), never two at once (rule 5), and attendance is written only
-- by check-in (rule 6) or by hand within its limits (rule 7).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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
grant select, insert on ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select id from ids where name = key $$;

with s as (insert into school (name) values ('Helios') returning id) insert into ids select 'A', id from s;
insert into ids values ('u_dir', pg_temp.login('dir@h.mx')), ('u_teach', pg_temp.login('teach@h.mx')), ('u_teach2', pg_temp.login('teach2@h.mx')),
    ('u_stud', pg_temp.login('stud@h.mx')), ('u_mom', pg_temp.login('mom@h.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
with k as (insert into person (full_name) values ('Niña') returning id) insert into ids select 'p_kid', id from k;

insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_teach2'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_mom'), 'guardian', 'active');
insert into terms (school_id, file_path) values (pg_temp.id('A'), 'terms.pdf');
insert into membership (school_id, person_id, role, status, payment_day, minor) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), 'student', 'active', 15, false),
    (pg_temp.id('A'), pg_temp.id('p_kid'), 'student', 'active', 30, true);
insert into guardian_link values (pg_temp.id('A'), pg_temp.id('p_mom'), pg_temp.id('p_kid'));
insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), id, pg_temp.id('p_stud') from terms where school_id = pg_temp.id('A');

-- The director's setup: a room, two weekly classes at the same hour (one with 1 place), free hours, prices.
select pg_temp.act_as(pg_temp.id('u_dir'));
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón');
insert into class (id, school_id, name, teacher_id, max_students, monthly_sessions) values
    ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_teach'), 1, 8),
    ('00000000-0000-0000-0000-00000000c002', pg_temp.id('A'), 'Dueto', pg_temp.id('p_teach'), null, 12);
insert into class (id, school_id, name, teacher_id) values ('00000000-0000-0000-0000-00000000c004', pg_temp.id('A'), 'Movilidad', pg_temp.id('p_teach2'));
insert into schedule (school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id)
values (pg_temp.id('A'), '00000000-0000-0000-0000-00000000c004', extract(isodow from current_date + 2)::int, '10:00', '11:00', current_date, current_date + 30, '00000000-0000-0000-0000-00000000a001');
insert into class (id, school_id, name, teacher_id, kind, max_students) values
    ('00000000-0000-0000-0000-00000000c003', pg_temp.id('A'), 'Práctica libre', pg_temp.id('p_teach'), 'free', 4);
insert into schedule (school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id)
select pg_temp.id('A'), c, extract(isodow from current_date + 2)::int, '18:00', '20:00', current_date, current_date + 30, '00000000-0000-0000-0000-00000000a001'
from unnest(array['00000000-0000-0000-0000-00000000c001'::uuid, '00000000-0000-0000-0000-00000000c002'::uuid]) c;
select pg_temp.act_as(null);
insert into price (school_id, kind, class_id, amount, starts_on) values
    (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c001', 600, current_date - 30);
select pg_temp.act_as(pg_temp.id('u_dir'));
select throws_ok($$ insert into price (school_id, kind, amount, starts_on) values (pg_temp.id('A'), 'visit', 1, current_date - 40) $$, '22023', null,
    'a new price is never back-dated');
insert into price (school_id, kind, class_id, amount) values
    (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c001', 650),
    (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c002', 1000);
insert into price (school_id, kind, amount) values (pg_temp.id('A'), 'trial', 290), (pg_temp.id('A'), 'visit', 290);
insert into price (school_id, kind, attendants, amount) values (pg_temp.id('A'), 'free', 1, 300);

select throws_ok($$ update price set amount = 1 $$, '42501', null, 'a price is never edited: a new one is added');

-- ---- Enrolling ----

select pg_temp.act_as(pg_temp.id('u_stud'));
insert into enrollment (id, school_id, student_id, class_id, how, starts_on) values
    ('00000000-0000-0000-0000-00000000e001', pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c001', 'monthly', current_date);
select throws_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c004', 'visit', current_date - 40) $$, '22023', null,
    'an enrollment can''t be back-dated to an older price');
select throws_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c004', 'monthly', current_date) $$, '23514', null,
    'a way of paying the class doesn''t offer is refused');
select is((select price from enrollment where id = '00000000-0000-0000-0000-00000000e001'), 650.00, 'an enrollment takes the latest price, set by the database');
select is((select created_by from enrollment where id = '00000000-0000-0000-0000-00000000e001'), pg_temp.id('p_stud'), 'it''s stamped with who enrolled');
select throws_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c002', 'monthly', current_date) $$, 'P0001', 'It overlaps Danza aérea',
    'a class at the same time as one they take is refused (rule 5)');
select throws_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_kid'), '00000000-0000-0000-0000-00000000c002', 'monthly', current_date) $$, '42501', null,
    'a student can''t enroll someone else');

select pg_temp.act_as(pg_temp.id('u_mom'));
select throws_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_kid'), '00000000-0000-0000-0000-00000000c001', 'monthly', current_date) $$, 'P0001', 'The class is full',
    'a full class refuses new enrollments');
select lives_ok($$ insert into enrollment (school_id, student_id, class_id, how, starts_on) values
    (pg_temp.id('A'), pg_temp.id('p_kid'), '00000000-0000-0000-0000-00000000c002', 'monthly', current_date) $$, 'a guardian enrolls their child');
select is((select count(*)::int from enrollment), 1, 'a guardian sees only their child''s enrollments');

-- ---- Trial classes and free hours ----

select pg_temp.act_as(pg_temp.id('u_dir'));
insert into ids select 'free_now', public.add_free_session('00000000-0000-0000-0000-00000000c003', now() + interval '5 minutes', now() + interval '2 hours', '00000000-0000-0000-0000-00000000a001');
insert into ids select 'free_later', public.add_free_session('00000000-0000-0000-0000-00000000c003', now() + interval '3 hours', now() + interval '4 hours', '00000000-0000-0000-0000-00000000a001');
insert into ids select 'free_past', public.add_free_session('00000000-0000-0000-0000-00000000c003', now() - interval '45 minutes', now() + interval '1 hour', '00000000-0000-0000-0000-00000000a001');

select pg_temp.act_as(pg_temp.id('u_stud'));
insert into booking (school_id, student_id, session_id, kind) values (pg_temp.id('A'), pg_temp.id('p_stud'), pg_temp.id('free_now'), 'free');
select is((select count(*)::int from booking where student_id = pg_temp.id('p_stud')), 1, 'a student books free hours');
select lives_ok($$ insert into booking (school_id, student_id, session_id, kind) values (pg_temp.id('A'), pg_temp.id('p_stud'),
    (select id from session where class_id = '00000000-0000-0000-0000-00000000c004' order by starts_at limit 1), 'trial') $$,
    'a student books a trial class');
select is((select price from booking where kind = 'trial'), 290.00, 'at the school''s trial price');
select throws_ok($$ insert into booking (school_id, student_id, session_id, kind) values (pg_temp.id('A'), pg_temp.id('p_stud'),
    (select id from session where class_id = '00000000-0000-0000-0000-00000000c004' order by starts_at offset 1 limit 1), 'trial') $$,
    '23505', null, 'one trial class per class');

-- ---- Check-in ----

select pg_temp.act_as(null);
create temp table codes as select name, private.code_at(id, floor(extract(epoch from now()) / 30)::bigint) as code from ids where name like 'free\_%';
grant select on codes to authenticated;

select pg_temp.act_as(pg_temp.id('u_stud'));
select is(public.check_in('NOTACODE')->>'status', 'code', 'a wrong code finds no session');
select is(public.check_in((select code from codes where name = 'free_later'))->>'status', 'too_early', 'too early: more than 10 minutes before');
select is(public.check_in((select code from codes where name = 'free_past'))->>'status', 'too_late', 'too late: more than 30 minutes after the start');
select is(public.check_in((select code from codes where name = 'free_now'))->'results'->0->>'result', 'ok', 'a booked student checks in');
select is(public.check_in((select code from codes where name = 'free_now'))->'results'->0->>'result', 'already', 'scanning twice records once');
select is((select method::text from attendance where person_id = pg_temp.id('p_stud')), 'qr', 'the record says how it was made');

select pg_temp.act_as(pg_temp.id('u_mom'));
select is(public.check_in((select code from codes where name = 'free_now'), array[pg_temp.id('p_kid')])->'results'->0->>'result', 'not_enrolled',
    'a child who doesn''t take the class isn''t recorded');

select pg_temp.act_as(pg_temp.id('u_teach2'));
select is(public.check_in((select code from codes where name = 'free_now'))->'results'->0->>'result', 'guest', 'another teacher scanning is a guest teacher');

-- ---- By hand, and nobody writes it directly ----

select throws_ok($$ insert into attendance (school_id, session_id, person_id, method) values (pg_temp.id('A'), pg_temp.id('free_now'), pg_temp.id('p_kid'), 'teacher') $$,
    '42501', null, 'nobody writes attendance directly');
select throws_ok($$ select public.add_attendance(pg_temp.id('free_now'), array[pg_temp.id('p_kid')]) $$, '42501', null,
    'only the session''s teacher adds attendance');

select pg_temp.act_as(pg_temp.id('u_teach'));
select is(public.add_attendance(pg_temp.id('free_now'), array[pg_temp.id('p_kid')]), 1, 'the session''s teacher adds a student by hand');
select throws_ok($$ select public.remove_attendance((select id from attendance where person_id = pg_temp.id('p_kid'))) $$, '42501', null,
    'a teacher never removes attendance');

select pg_temp.act_as(pg_temp.id('u_dir'));
select public.remove_attendance((select id from attendance where person_id = pg_temp.id('p_kid')));
select is((select count(*)::int from attendance_log where change = 'removed'), 1, 'a director''s removal is kept in the log');

select * from finish();
rollback;
