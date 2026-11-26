-- Cards (rules 18–20), terms (rule 13) and registration (rule 14).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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

with s as (insert into school (name) values ('Helios'), ('Otra') returning id, name)
insert into ids select case name when 'Helios' then 'A' else 'B' end, id from s;
insert into ids values ('u_dir', pg_temp.login('dir@h.mx')), ('u_teach', pg_temp.login('t@h.mx')), ('u_other', pg_temp.login('t2@h.mx')),
    ('u_new', pg_temp.login('new@h.mx')), ('u_mom', pg_temp.login('mom@h.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;
with k as (insert into person (full_name) values ('Niño') returning id) insert into ids select 'p_kid', id from k;

insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_other'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_mom'), 'guardian', 'invited');

select throws_ok($$ insert into membership (school_id, person_id, role, payment_day) values (pg_temp.id('A'), pg_temp.id('p_new'), 'student', 15) $$,
    'P0001', null, 'no students before the school uploads its terms');

select pg_temp.act_as(pg_temp.id('u_dir'));
insert into terms (school_id, file_path) values (pg_temp.id('A'), 'a/terms/1.pdf');
select is((select version from terms), 1, 'the first upload is version 1');
select pg_temp.act_as(null);

insert into membership (school_id, person_id, role, payment_day, minor) values
    (pg_temp.id('A'), pg_temp.id('p_new'), 'student', 15, false),
    (pg_temp.id('A'), pg_temp.id('p_kid'), 'student', 30, true);
insert into guardian_link values (pg_temp.id('A'), pg_temp.id('p_mom'), pg_temp.id('p_kid'));
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón');
insert into class (id, school_id, name, teacher_id) values ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Danza aérea', pg_temp.id('p_teach'));

-- ---- An invited student registers: their card, then the terms ----

select pg_temp.act_as(pg_temp.id('u_new'));
select is((select count(*)::int from terms), 1, 'an invited student reads their school''s terms');
insert into student_card (id, school_id, student_id, full_name, health_notes, declared_at)
values ('00000000-0000-0000-0000-0000000000c1', pg_temp.id('A'), pg_temp.id('p_new'), 'Nueva Alumna', 'Asma leve', '2000-01-01');
select isnt((select declared_at from student_card), '2000-01-01'::timestamptz, 'the declaration is stamped by the database, not sent by the app');
select is((select status::text from membership where person_id = pg_temp.id('p_new')), 'invited', 'a card alone doesn''t complete registration');
insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), id, pg_temp.id('p_new') from terms;
select is((select status::text from membership where person_id = pg_temp.id('p_new')), 'active', 'card and terms: the membership turns active');
insert into emergency_contact (card_id, name, relation, phone) values ('00000000-0000-0000-0000-0000000000c1', 'Laura', 'mother', '55 1234 5678');
update student_card set health_notes = 'Asma leve; trae inhalador' where id = '00000000-0000-0000-0000-0000000000c1';
insert into enrollment (school_id, student_id, class_id, how, starts_on) select pg_temp.id('A'), pg_temp.id('p_new'), '00000000-0000-0000-0000-00000000c001', 'visit', current_date
where false;  -- the class has no visit price yet: enrolled below as the database

-- ---- A guardian registers their child: family list, card, terms ----

select pg_temp.act_as(pg_temp.id('u_mom'));
insert into family_person (id, school_id, guardian_id, name, relation, phone, is_emergency) values
    ('00000000-0000-0000-0000-0000000000f1', pg_temp.id('A'), pg_temp.id('p_mom'), 'Abuela', 'grandmother', '55 0000 1111', true);
select throws_ok($$ insert into family_person (school_id, guardian_id, name, relation, can_pick_up) values (pg_temp.id('A'), pg_temp.id('p_mom'), 'Tío', 'uncle', true) $$,
    '23514', null, 'someone who picks the children up needs a photo and the photo consent');
insert into family_person_child values ('00000000-0000-0000-0000-0000000000f1', pg_temp.id('p_kid'));
select throws_ok($$ insert into family_person_child values ('00000000-0000-0000-0000-0000000000f1', pg_temp.id('p_new')) $$, '23514', null,
    'a family person is only for the guardian''s own children');
select throws_ok($$ update family_person_child set student_id = pg_temp.id('p_new') $$, '42501', null,
    'a family person''s child is never swapped in place');
insert into student_card (school_id, student_id, full_name, declared_at) values (pg_temp.id('A'), pg_temp.id('p_kid'), 'Niño', now());
insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), id, pg_temp.id('p_kid') from terms;
select is((select status::text from membership where person_id = pg_temp.id('p_kid')), 'active', 'the child''s registration completes');
select is((select status::text from membership where person_id = pg_temp.id('p_mom')), 'active', 'and the guardian''s with it');
select is((select accepted_by from terms_acceptance where student_id = pg_temp.id('p_kid')), pg_temp.id('p_mom'), 'the acceptance records who accepted for the child');

-- ---- Who reads a card ----

select pg_temp.act_as(null);
insert into price (school_id, kind, amount) values (pg_temp.id('A'), 'visit', 290);
select pg_temp.act_as(pg_temp.id('u_new'));
insert into enrollment (school_id, student_id, class_id, how, starts_on) values (pg_temp.id('A'), pg_temp.id('p_new'), '00000000-0000-0000-0000-00000000c001', 'visit', (now() at time zone 'America/Mexico_City')::date);

select pg_temp.act_as(pg_temp.id('u_teach'));
select is((select count(*)::int from student_card where student_id = pg_temp.id('p_new')), 1, 'the teacher of a class the student takes reads their card');
select is((select count(*)::int from emergency_contact), 1, 'and its emergency contacts');
update student_card set health_notes = 'x' where student_id = pg_temp.id('p_new');
select isnt((select health_notes from student_card where student_id = pg_temp.id('p_new')), 'x', 'a teacher never edits a card');
select is((select count(*)::int from student_card where student_id = pg_temp.id('p_kid')), 0, 'nor reads the card of a student they don''t teach');

select pg_temp.act_as(pg_temp.id('u_other'));
select is((select count(*)::int from student_card), 0, 'another teacher reads no cards');

select pg_temp.act_as(pg_temp.id('u_dir'));
select is((select count(*)::int from student_card_log where student_id = pg_temp.id('p_new') and what = 'card'), 1, 'a card change is logged for the directors');
update student_card set active = false where student_id = pg_temp.id('p_new');
select throws_ok($$ update student_card set health_notes = 'x' where student_id = pg_temp.id('p_new') $$, '42501', null, 'a director deactivates but doesn''t edit a card');

select pg_temp.act_as(pg_temp.id('u_teach'));
select is((select count(*)::int from student_card where student_id = pg_temp.id('p_new')), 0, 'a deactivated card is hidden from teachers');

-- ---- New terms: the student must accept again ----

select pg_temp.act_as(pg_temp.id('u_dir'));
insert into terms (school_id, file_path) values (pg_temp.id('A'), 'a/terms/2.pdf');
select pg_temp.act_as(pg_temp.id('u_new'));
select throws_ok($$ insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), id, pg_temp.id('p_new') from terms where version = 1 $$,
    'P0001', null, 'only the latest terms can be accepted');

select * from finish();
rollback;
