-- Payment screenshots (rule 10), registration fees (rule 15) and the private bucket.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
    ('u_stud', pg_temp.login('s@h.mx')), ('u_stud2', pg_temp.login('s2@h.mx'));
insert into person (user_id, full_name) select id, name from ids where name like 'u\_%';
insert into ids select 'p_' || substr(i.name, 3), p.id from ids i join person p on p.user_id = i.id;

insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x');
insert into price (school_id, kind, amount) values (pg_temp.id('A'), 'fee', 660), (pg_temp.id('A'), 'visit', 290);
insert into membership (school_id, person_id, role, status) values
    (pg_temp.id('A'), pg_temp.id('p_dir'), 'director', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_teach'), 'teacher', 'active'),
    (pg_temp.id('A'), pg_temp.id('p_other'), 'teacher', 'active');
insert into membership (school_id, person_id, role, status, payment_day) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), 'student', 'active', 15),
    (pg_temp.id('A'), pg_temp.id('p_stud2'), 'student', 'active', 30);
insert into terms_acceptance (school_id, terms_id, student_id) select pg_temp.id('A'), t.id, p from terms t, unnest(array[pg_temp.id('p_stud'), pg_temp.id('p_stud2')]) p where t.school_id = pg_temp.id('A');
insert into room (id, school_id, name) values ('00000000-0000-0000-0000-00000000a001', pg_temp.id('A'), 'Salón');
insert into class (id, school_id, name, teacher_id, monthly_sessions) values ('00000000-0000-0000-0000-00000000c001', pg_temp.id('A'), 'Movilidad', pg_temp.id('p_teach'), 8);
insert into price (school_id, kind, class_id, amount) values (pg_temp.id('A'), 'monthly', '00000000-0000-0000-0000-00000000c001', 600);

insert into ids select 'fee2', id from registration_fee where student_id = pg_temp.id('p_stud2');
select is((select count(*)::int from registration_fee where reason = 'joined' and school_id = pg_temp.id('A')), 2, 'each new student owes the registration fee');
select is((select amount from registration_fee where school_id = pg_temp.id('A') limit 1), 660.00, 'at the school''s fee price');

select pg_temp.act_as(pg_temp.id('u_stud'));
insert into enrollment (id, school_id, student_id, class_id, how, starts_on)
values ('00000000-0000-0000-0000-00000000e001', pg_temp.id('A'), pg_temp.id('p_stud'), '00000000-0000-0000-0000-00000000c001', 'monthly', pg_temp.today());

-- ---- Uploading a screenshot ----

insert into ids values ('proof', gen_random_uuid());
insert into payment_proof (id, school_id, student_id, method, covers, enrollment_id, month, amount, file_path)
select pg_temp.id('proof'), pg_temp.id('A'), pg_temp.id('p_stud'), 'transfer', 'month', '00000000-0000-0000-0000-00000000e001',
       date_trunc('month', pg_temp.today())::date, 550, format('%s/proofs/%s/%s.jpg', pg_temp.id('A'), pg_temp.id('p_stud'), pg_temp.id('proof'));
select is((select expected from payment_proof), 600.00, 'the screenshot shows what the plan costs beside what was sent');
select is((select state::text from payment_proof), 'uploaded', 'it starts as uploaded');
select throws_ok($$ insert into payment_proof (id, school_id, student_id, method, covers, enrollment_id, month, amount, file_path)
    values (gen_random_uuid(), pg_temp.id('A'), pg_temp.id('p_stud'), 'cash', 'month', '00000000-0000-0000-0000-00000000e001',
            date_trunc('month', pg_temp.today())::date, 600, 'somewhere/else.jpg') $$, '23514', null, 'the file path is set by the ids');
select throws_ok($$ insert into payment_proof (id, school_id, student_id, method, covers, fee_id, amount, file_path)
    values (gen_random_uuid(), pg_temp.id('A'), pg_temp.id('p_stud2'), 'cash', 'fee', pg_temp.id('fee2'), 660, 'x') $$,
    '42501', null, 'a student can''t upload for someone else');
select throws_ok($$ update payment_proof set state = 'confirmed' $$, '42501', null, 'a student can''t confirm their own screenshot');
select throws_ok($$ select public.decide_proof(pg_temp.id('proof'), true) $$, '42501', null, 'only directors check screenshots');

-- Their file: uploaded once by them, read by those who read the row.
insert into storage.objects (bucket_id, name) values ('lyra', format('%s/proofs/%s/%s.jpg', pg_temp.id('A'), pg_temp.id('p_stud'), pg_temp.id('proof')));
select is((select count(*)::int from storage.objects where bucket_id = 'lyra'), 1, 'the student uploads the screenshot''s file');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('lyra', format('%s/proofs/%s/%s.jpg', pg_temp.id('A'), pg_temp.id('p_stud2'), gen_random_uuid())) $$,
    '42501', null, 'no file without its row');
select throws_ok($$ insert into student_card (school_id, student_id, full_name, photo_path) values
    (pg_temp.id('A'), pg_temp.id('p_stud'), 'Yo', format('%s/proofs/%s/%s.jpg', pg_temp.id('A'), pg_temp.id('p_stud'), pg_temp.id('proof'))) $$,
    '23514', null, 'a card photo can''t point at another kind of file');

-- ---- Who sees it ----

select pg_temp.act_as(pg_temp.id('u_teach'));
select is((select count(*)::int from payment_proof), 1, 'the class''s teacher sees the screenshot');
select is((select count(*)::int from storage.objects where bucket_id = 'lyra'), 1, 'and opens its file');
select pg_temp.act_as(pg_temp.id('u_other'));
select is((select count(*)::int from payment_proof), 0, 'another teacher doesn''t');
select pg_temp.act_as(pg_temp.id('u_stud2'));
select is((select count(*)::int from storage.objects where bucket_id = 'lyra'), 0, 'another student can''t open the file');

-- ---- The director decides ----

select pg_temp.act_as(pg_temp.id('u_dir'));
select throws_ok($$ select public.decide_proof(pg_temp.id('proof'), false) $$, '22023', null, 'a rejection says why');
select public.decide_proof(pg_temp.id('proof'), false, 'El monto no coincide con tu plan.');
select is((select decided_by from payment_proof), pg_temp.id('p_dir'), 'the decision is stamped with who');
select throws_ok($$ delete from payment_proof $$, '42501', null, 'screenshots are never deleted');
select public.mark_fee_done((select id from registration_fee where student_id = pg_temp.id('p_stud')));
select is((select count(*)::int from registration_fee where done_at is null), 1, 'a director marks a fee as done');
select is((select count(*)::int from registration_fee), 2, 'fees are kept after they''re done');

select * from finish();
rollback;
