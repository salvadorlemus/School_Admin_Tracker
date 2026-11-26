-- Teacher pay (rule 24): Helios's ranges, counted from attendance, and payments the teacher answers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Mexico_City')::date $$;
create temp table periods as select lower(private.period_of('half', (now() at time zone 'America/Mexico_City')::date)) as cur_from,
    upper(private.period_of('half', (now() at time zone 'America/Mexico_City')::date)) - 1 as cur_to,
    lower(private.period_of('half', lower(private.period_of('half', (now() at time zone 'America/Mexico_City')::date)) - 1)) as prev_from;
grant select on periods to authenticated;
create function pg_temp.cur_from() returns date language sql as $$ select cur_from from periods $$;
create function pg_temp.cur_to() returns date language sql as $$ select cur_to from periods $$;
create function pg_temp.prev_from() returns date language sql as $$ select prev_from from periods $$;

with s as (insert into school (name) values ('Helios') returning id) insert into ids select 'A', id from s;
insert into ids values ('u_dir', pg_temp.login('dir@h.mx')), ('u_pablo', pg_temp.login('p@h.mx')), ('u_dafne', pg_temp.login('d@h.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x');
insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'), (pg_temp.id('A'), pg_temp.id('p_pablo'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_dafne'), 'teacher', 'active');
-- Four students.
with st as (insert into person (full_name) select 'Alumna ' || g from generate_series(1, 4) g returning id)
insert into ids select 'st' || row_number() over (), id from st;
insert into membership (school_id, person_id, role, status, payment_day) select pg_temp.id('A'), id, 'student', 'active', 15 from ids where name like 'st%';
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón principal');
insert into class (id, school_id, name, teacher_id, kind) values ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_pablo'), 'free');

-- ---- The rule: Helios's ranges ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select throws_ok($$ select public.save_pay_rule(pg_temp.id('A'), 'half', 'tiers', tiers => '[{"from":1,"to":1,"amount":110},{"from":3,"amount":165}]') $$,
    '22023', null, 'ranges with a gap are refused');
select isnt(public.save_pay_rule(pg_temp.id('A'), 'half', 'tiers', tiers =>
    '[{"from":1,"to":1,"amount":110},{"from":2,"to":2,"amount":165},{"from":3,"to":5,"amount":275},{"from":6,"to":7,"amount":385},{"from":8,"to":9,"amount":440},{"from":10,"amount":550}]'),
    null, 'Helios''s ranges are saved');
select is((select starts_on from teacher_pay_rule), pg_temp.cur_from(), 'a rule applies from the period going on');

select pg_temp.act_as(pg_temp.id('u_pablo'));
select is((select count(*)::int from notification where kind = 'pay_rule'), 1, 'the teachers are told the rule changed');
select throws_ok($$ select public.save_pay_rule(pg_temp.id('A'), 'half', 'per_session', 500) $$, '42501', null, 'a teacher can''t set the rule');

-- ---- Sessions given this period, and attendance ----

select pg_temp.act_as(pg_temp.id('u_dir'));
insert into ids select 's3', public.add_free_session('00000000-0000-0000-0000-00000000c001', now() - interval '3 hours', now() - interval '1 hour', '00000000-0000-0000-0000-00000000a001');
insert into ids select 's_sub', public.add_free_session('00000000-0000-0000-0000-00000000c001', now() - interval '6 hours', now() - interval '5 hours', '00000000-0000-0000-0000-00000000a001');
select public.add_attendance(pg_temp.id('s3'), array[pg_temp.id('st1'), pg_temp.id('st2'), pg_temp.id('st3')]);
select public.add_attendance(pg_temp.id('s_sub'), array[pg_temp.id('st4')]);
select pg_temp.act_as(null);
update session set substitute_id = pg_temp.id('p_dafne') where id = pg_temp.id('s_sub');
-- A trial class never counts: st3 was on a trial.
alter table booking disable trigger booking_saved;
insert into booking (school_id, student_id, session_id, class_id, kind, price)
select pg_temp.id('A'), pg_temp.id('st3'), pg_temp.id('s3'), '00000000-0000-0000-0000-00000000c001', 'trial', 290;
alter table booking enable trigger booking_saved;  -- (past the booking checks: the session already happened)

select pg_temp.act_as(pg_temp.id('u_pablo'));
create temp table pay as select * from public.teacher_pay(pg_temp.id('A'), pg_temp.id('p_pablo'), pg_temp.cur_from(), pg_temp.cur_to());
select is((select counted from pay where session_id = pg_temp.id('s3')), 2, 'trial classes don''t count for the teacher');
select is((select amount from pay where session_id = pg_temp.id('s3')), 165.00, '2 students: the 2-student range');
select is((select count(*)::int from pay where session_id = pg_temp.id('s_sub')), 0, 'a session covered by a substitute isn''t the class teacher''s');
select throws_ok($$ select * from public.teacher_pay(pg_temp.id('A'), pg_temp.id('p_dafne'), current_date - 30, current_date) $$, '42501', null,
    'a teacher can''t see another teacher''s pay');

select pg_temp.act_as(pg_temp.id('u_dafne'));
select is((select amount from public.teacher_pay(pg_temp.id('A'), pg_temp.id('p_dafne'), pg_temp.cur_from(),
    pg_temp.cur_to()) where session_id = pg_temp.id('s_sub')), 110.00, 'it counts for the substitute who gave it');

-- ---- Paying ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select throws_ok($$ select public.record_teacher_payment(pg_temp.id('A'), pg_temp.id('p_pablo'), pg_temp.cur_from(), 165, pg_temp.today(), 'transfer') $$,
    'P0001', null, 'a period still going on isn''t paid yet');
insert into ids select 'pay', public.record_teacher_payment(pg_temp.id('A'), pg_temp.id('p_pablo'),
    pg_temp.prev_from(), 100, pg_temp.today(), 'cash', 'Adelanto acordado');
select pg_temp.act_as(pg_temp.id('u_pablo'));
select throws_ok($$ select public.answer_teacher_payment(pg_temp.id('pay'), false) $$, '22023', null, 'saying it doesn''t match needs a note');
select public.answer_teacher_payment(pg_temp.id('pay'), false, 'Faltan dos sesiones.');
select pg_temp.act_as(pg_temp.id('u_dir'));
select is((select count(*)::int from notification where kind = 'teacher_payment_disputed'), 1, 'a disputed payment becomes the directors'' to-do');

select * from finish();
rollback;
