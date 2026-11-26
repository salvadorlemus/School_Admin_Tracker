-- The admin panel (counts only), deleting a student's data (rules 20, 21), and the daily jobs (rules 15, 22).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

with s as (insert into school (name, fee_months) values ('Helios', 2) returning id) insert into ids select 'A', id from s;
insert into ids values ('u_admin', pg_temp.login('admin@lyra.mx')), ('u_dir', pg_temp.login('dir@h.mx')), ('u_teach', pg_temp.login('t@h.mx')),
    ('u_gone', pg_temp.login('gone@h.mx')), ('u_late', pg_temp.login('late@h.mx')), ('u_mom', pg_temp.login('mom@h.mx'));
insert into platform_admin values (pg_temp.id('u_admin'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%' and name <> 'u_admin';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
with k as (insert into person (full_name) values ('Niña') returning id) insert into ids select 'p_kid', id from k;

insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x');
insert into price (school_id, kind, amount) values (pg_temp.id('A'), 'fee', 660), (pg_temp.id('A'), 'visit', 290);
insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'), (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_mom'), 'guardian', 'active');
insert into membership (school_id, person_id, role, status, payment_day, minor) values
    (pg_temp.id('A'), pg_temp.id('p_gone'), 'student', 'active', 15, false),
    (pg_temp.id('A'), pg_temp.id('p_late'), 'student', 'active', 15, false),
    (pg_temp.id('A'), pg_temp.id('p_kid'), 'student', 'active', 30, true);
insert into guardian_link values (pg_temp.id('A'), pg_temp.id('p_mom'), pg_temp.id('p_kid'));
update registration_fee set done_at = now();  -- everyone paid on joining
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón');
insert into class (id, school_id, name, teacher_id, kind, monthly_sessions) values ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_teach'), 'free', 8);

-- ---- The admin: counts only, every action logged ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select throws_ok($$ select * from public.admin_usage() $$, '42501', null, 'only the admin sees usage');
select pg_temp.act_as(pg_temp.id('u_admin'));
select is((select students from public.admin_usage() where school_id = pg_temp.id('A')), 3::bigint, 'the admin sees how many students, not who');
select is((select count(*)::int from student_card), 0, 'and never a card');
select public.admin_record_payment(pg_temp.id('A'), 1000, pg_temp.today(), pg_temp.today(), 'transferencia');
select public.admin_set_enabled(pg_temp.id('A'), false);
select public.admin_set_enabled(pg_temp.id('A'), true);
select is((select count(*)::int from admin_log), 3, 'each admin action is logged');

-- ---- Deleting a student: their card and files go, the school's counts stay ----

select pg_temp.act_as(pg_temp.id('u_gone'));
insert into student_card (school_id, student_id, full_name, health_notes, photo_path)
values (pg_temp.id('A'), pg_temp.id('p_gone'), 'Se Va', 'Asma', format('%s/cards/%s/foto.jpg', pg_temp.id('A'), pg_temp.id('p_gone')));
select pg_temp.act_as(pg_temp.id('u_dir'));
insert into ids select 's1', public.add_free_session('00000000-0000-0000-0000-00000000c001', now() - interval '2 hours', now() - interval '1 hour', '00000000-0000-0000-0000-00000000a001');
select public.add_attendance(pg_temp.id('s1'), array[pg_temp.id('p_gone')]);
select public.delete_student(pg_temp.id('A'), pg_temp.id('p_gone'));
select pg_temp.act_as(null);
select is((select count(*)::int from student_card where student_id = pg_temp.id('p_gone')), 0, 'the card is deleted');
select is((select count(*)::int from attendance where session_id = pg_temp.id('s1')), 1, 'the attendance stays, so the counts stay right');
select is((select full_name from person p join attendance a on a.person_id = p.id where a.session_id = pg_temp.id('s1')), '—', 'with no name');
select is((select count(*)::int from file_deletion where path like '%/cards/%'), 1, 'the card photo is queued for removal');
select is((select count(*)::int from login_deletion where user_id = pg_temp.id('u_gone')), 1, 'a person left with no school loses their login');

-- ---- The daily jobs ----

-- Turning 18 today.
insert into student_card (school_id, student_id, full_name, birth_date) values (pg_temp.id('A'), pg_temp.id('p_kid'), 'Niña', pg_temp.today() - interval '18 years');
select is(private.notify_turning_18(), 1, 'a minor turning 18 today is found');
select is((select count(*)::int from notification where kind = 'turns_18' and person_id = pg_temp.id('p_dir')), 1, 'and the directors are told');

-- Two months with a plan and no screenshot: the fee is owed again (fee_months = 2).
alter table enrollment disable trigger enrollment_saved;
insert into enrollment (school_id, student_id, class_id, how, starts_on, price)
values (pg_temp.id('A'), pg_temp.id('p_late'), '00000000-0000-0000-0000-00000000c001', 'monthly', (date_trunc('month', pg_temp.today()) - interval '3 months')::date, 600);
alter table enrollment enable trigger enrollment_saved;
select is(private.charge_lapsed_fees(), 1, 'a student with months unpaid owes the fee again');
select is((select reason::text from registration_fee where student_id = pg_temp.id('p_late') and done_at is null), 'lapsed', 'as a lapsed fee');
select is((select count(*)::int from email_outbox where kind = 'fee_owed' and to_email = 'late@h.mx'), 1, 'and is emailed');
select is(private.charge_lapsed_fees(), 0, 'once');

-- The data countdown: three months inactive, then deleted.
update membership set status = 'inactive' where person_id = pg_temp.id('p_late');
update membership set inactive_since = pg_temp.today() - interval '3 months' - interval '2 days' where person_id = pg_temp.id('p_late');
select is(private.run_data_countdown(), 1, 'three months after becoming inactive, the data is deleted');

select * from finish();
rollback;
