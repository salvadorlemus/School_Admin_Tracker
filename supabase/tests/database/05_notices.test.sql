-- The notices board (rule 23) and personal notices (rules 4, 10, 11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

with s as (insert into school (name) values ('Helios') returning id) insert into ids select 'A', id from s;
insert into ids values ('u_dir', pg_temp.login('dir@h.mx')), ('u_teach', pg_temp.login('t@h.mx')), ('u_other', pg_temp.login('o@h.mx')),
    ('u_stud', pg_temp.login('s@h.mx')), ('u_lone', pg_temp.login('l@h.mx')), ('u_mom', pg_temp.login('m@h.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
with k as (insert into person (full_name) values ('Niña') returning id) insert into ids select 'p_kid', id from k;

insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x');
insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'), (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_other'), 'teacher', 'active'), (pg_temp.id('A'), pg_temp.id('p_mom'), 'guardian', 'active');
insert into membership (school_id, person_id, role, status, payment_day, minor) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), 'student', 'active', 15, false), (pg_temp.id('A'), pg_temp.id('p_lone'), 'student', 'active', 15, false),
    (pg_temp.id('A'), pg_temp.id('p_kid'), 'student', 'active', 30, true);
insert into guardian_link values (pg_temp.id('A'), pg_temp.id('p_mom'), pg_temp.id('p_kid'));
insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), t.id, p from terms t,
    unnest(array[pg_temp.id('p_stud'), pg_temp.id('p_lone'), pg_temp.id('p_kid')]) p where t.school_id = pg_temp.id('A');
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón');
insert into class (id, school_id, name, teacher_id, monthly_sessions) values
    ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_teach'), 1),
    ('00000000-0000-0000-0000-00000000c002', pg_temp.id('A'), 'Dueto', pg_temp.id('p_other'), 4);
insert into schedule (school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id)
select pg_temp.id('A'), c, w, t::time, (t::time + interval '1 hour')::time, pg_temp.today(), pg_temp.today() + 20, '00000000-0000-0000-0000-00000000a001'
from (values ('00000000-0000-0000-0000-00000000c001'::uuid, extract(isodow from pg_temp.today() + 2)::int, '18:00'),
             ('00000000-0000-0000-0000-00000000c002'::uuid, extract(isodow from pg_temp.today() + 3)::int, '10:00')) v(c, w, t);
insert into price (school_id, kind, class_id, amount, starts_on) values (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c001', 600, pg_temp.today());

select pg_temp.act_as(pg_temp.id('u_stud'));
insert into enrollment (school_id, student_id, class_id, how, starts_on) values (pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c001', 'monthly', pg_temp.today());

-- ---- Automatic posts ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select is((select count(*)::int from notification where kind = 'new_enrollment'), 1, 'the director hears of a new enrollment');
select public.cancel_session((select id from session where class_id = '00000000-0000-0000-0000-00000000c001' order by starts_at limit 1));
select is((select count(*)::int from announcement where kind = 'cancelled'), 1, 'a cancellation is posted on the board by itself');
insert into price (school_id, kind, class_id, amount) values (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c001', 650);
select is((select important from announcement where kind = 'price'), true, 'a price change is posted as important');
select is((select (vars ->> 'from')::numeric from announcement where kind = 'price'), 600::numeric, 'saying what it was');
select throws_ok($$ update announcement set body = 'x' $$, '42501', null, 'posts are never edited');

select pg_temp.act_as(pg_temp.id('u_stud'));
select is((select count(*)::int from notification where kind = 'schedule_cancelled'), 1, 'an enrolled student gets a personal notice of the cancellation');
select is((select bool_or(email) from notification where kind = 'schedule_cancelled'), false, 'schedule changes are never emailed');

-- ---- Notes ----

select pg_temp.act_as(pg_temp.id('u_teach'));
select lives_ok($$ insert into announcement (school_id, class_id, kind, body) values (pg_temp.id('A'), '00000000-0000-0000-0000-00000000c001', 'note', 'Traigan ropa ajustada.') $$,
    'a teacher posts a note for their class');
select throws_ok($$ insert into announcement (school_id, class_id, kind, body) values (pg_temp.id('A'), '00000000-0000-0000-0000-00000000c002', 'note', 'Hola') $$,
    '42501', null, 'but not for another teacher''s class');
select throws_ok($$ insert into announcement (school_id, kind, body) values (pg_temp.id('A'), 'note', 'Para todos') $$,
    '42501', null, 'nor for the whole school');

select pg_temp.act_as(pg_temp.id('u_dir'));
insert into announcement (school_id, kind, body) values (pg_temp.id('A'), 'note', 'El lunes 16 no hay clases.');

select pg_temp.act_as(pg_temp.id('u_stud'));
select is((select count(*)::int from announcement), 4, 'a student reads the school''s posts and their class''s');
select pg_temp.act_as(pg_temp.id('u_lone'));
select is((select count(*)::int from announcement), 1, 'a student in no class reads only the school-wide note');

-- ---- Payment notices: to the guardian for a minor, also emailed ----

select pg_temp.act_as(null);
insert into price (school_id, kind, amount, starts_on) values (pg_temp.id('A'), 'visit', 290, pg_temp.today());
select pg_temp.act_as(pg_temp.id('u_mom'));
insert into enrollment (id, school_id, student_id, class_id, how, starts_on)
values ('00000000-0000-0000-0000-00000000e003', pg_temp.id('A'), pg_temp.id('p_kid'), '00000000-0000-0000-0000-00000000c002', 'visit', pg_temp.today());
insert into ids values ('proof', gen_random_uuid());
insert into payment_proof (id, school_id, student_id, method, covers, session_id, amount, file_path)
select pg_temp.id('proof'), pg_temp.id('A'), pg_temp.id('p_kid'), 'cash', 'visit',
       (select id from session where class_id = '00000000-0000-0000-0000-00000000c002' order by starts_at limit 1), 290,
       format('%s/proofs/%s/%s.jpg', pg_temp.id('A'), pg_temp.id('p_kid'), pg_temp.id('proof'));

select pg_temp.act_as(pg_temp.id('u_dir'));
select public.decide_proof(pg_temp.id('proof'), false, 'La foto está borrosa.');
select pg_temp.act_as(pg_temp.id('u_mom'));
select is((select count(*)::int from notification where kind = 'proof_rejected' and email), 1, 'the guardian is told of the rejection, by email too');
update notification set read_at = now() where kind = 'proof_rejected';
select isnt((select read_at from notification where kind = 'proof_rejected'), null, 'they mark it as read');

-- ---- Over the plan: never stopped, everyone told ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select public.add_attendance(id, array[pg_temp.id('p_stud')]) from session
where class_id = '00000000-0000-0000-0000-00000000c001' and status = 'scheduled' order by starts_at limit 2;
select pg_temp.act_as(pg_temp.id('u_teach'));
select is((select count(*)::int from notification where kind = 'over_plan'), 1, 'the class''s teacher hears a student went over their plan');

select * from finish();
rollback;
