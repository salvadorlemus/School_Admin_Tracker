-- School payment methods: defaults, director configuration, and proof validation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

insert into ids values ('u_director', pg_temp.login('director@methods.mx')),
    ('u_student', pg_temp.login('student@methods.mx')),
    ('u_other', pg_temp.login('other@methods.mx'));

insert into person (id, user_id, full_name)
select gen_random_uuid(), id, name from ids;
insert into ids select 'p_' || case i.name
    when 'u_director' then 'director'
    when 'u_student' then 'student'
    else 'other'
end, p.id
from ids i join person p on p.user_id = i.id;

with s as (insert into school (name) values ('Methods A'), ('Methods B') returning id, name)
insert into ids select case name when 'Methods A' then 'A' else 'B' end, id from s;

insert into terms (school_id, file_path) select id, 'methods-terms.pdf' from school;
insert into membership (school_id, person_id, role, status)
select pg_temp.id('A'), pg_temp.id('p_director'), 'director'::member_role, 'active'::member_status;
insert into membership (school_id, person_id, role, status, payment_day)
values (pg_temp.id('A'), pg_temp.id('p_student'), 'student'::member_role, 'active'::member_status, 15);
select pg_temp.act_as(pg_temp.id('u_director'));

select is((select count(*)::int from school_payment_method
           where school_id = pg_temp.id('A') and enabled),
    3, 'new schools start with transfer/deposit, terminal and cash');

select lives_ok($$ select public.set_school_payment_methods(pg_temp.id('A'),
    '[{"key":"transfer","label":"Transferencia","enabled":true,"sort_order":1},
      {"key":"terminal","label":"Terminal","enabled":true,"sort_order":2},
      {"key":"cash","label":"Efectivo","enabled":true,"sort_order":3},
      {"key":"mercado-pago","label":"Mercado Pago","enabled":true,"sort_order":4}]'::jsonb) $$,
    'a director can add a custom school payment method');

select is((select label from school_payment_method
           where school_id = pg_temp.id('A') and key = 'mercado-pago'), 'Mercado Pago',
    'the custom method is stored for the school');

select is((select count(*)::int from school_payment_method
           where school_id = pg_temp.id('B')), 0,
    'another school does not inherit the custom method');

select pg_temp.act_as(pg_temp.id('u_student'));
select is((select count(*)::int from school_payment_method
           where school_id = pg_temp.id('A') and enabled), 4,
    'a student can read enabled school payment methods');
select throws_ok($$ select public.set_school_payment_methods(pg_temp.id('A'),
    '[{"key":"transfer","label":"Transferencia","enabled":true},
      {"key":"terminal","label":"Terminal","enabled":true},
      {"key":"cash","label":"Efectivo","enabled":true}]'::jsonb) $$,
    '42501', null, 'a student cannot configure payment methods');

select pg_temp.act_as(null);
select throws_ok($$ select public.set_school_payment_methods(pg_temp.id('A'),
    '[{"key":"transfer","label":"Transferencia","enabled":true},
      {"key":"terminal","label":"Terminal","enabled":true},
      {"key":"cash","label":"Efectivo","enabled":true}]'::jsonb) $$,
    '42501', null, 'anonymous visitors cannot configure payment methods');
update school_payment_method set enabled = false
where school_id = pg_temp.id('A') and key = 'mercado-pago';
select throws_ok($$ insert into payment_proof
    (school_id, student_id, method, covers, amount, file_path)
    values (pg_temp.id('A'), pg_temp.id('p_student'), 'mercado-pago', 'fee', 800, 'disabled-proof.jpg') $$,
    '23514', null, 'a disabled custom method is rejected by the payment trigger');

select * from finish();
rollback;
