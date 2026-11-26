-- Before going live: teachers read acceptances; the admin invites more directors and reads their emails.
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
grant select, insert on ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select id from ids where name = key $$;

insert into ids values ('u_admin', pg_temp.login('admin@lyra.mx')), ('u_ana', pg_temp.login('ana@helios.mx')),
    ('u_pablo', pg_temp.login('pablo@helios.mx')), ('u_sofia', pg_temp.login('sofia@correo.mx')), ('u_otro', pg_temp.login('otro@correo.mx'));
insert into platform_admin values (pg_temp.id('u_admin'));
with s as (insert into school (name) values ('Helios') returning id) insert into ids select 'A', id from s;
with s as (insert into school (name) values ('Otra') returning id) insert into ids select 'B', id from s;
with p as (insert into person (user_id, full_name) values (pg_temp.id('u_ana'), 'Ana Torres') returning id) insert into ids select 'ana', id from p;
with p as (insert into person (user_id, full_name) values (pg_temp.id('u_pablo'), 'Pablo Olivares') returning id) insert into ids select 'pablo', id from p;
with p as (insert into person (user_id, full_name) values (pg_temp.id('u_sofia'), 'Sofía Ramírez') returning id) insert into ids select 'sofia', id from p;
with p as (insert into person (user_id, full_name) values (pg_temp.id('u_otro'), 'Otro Maestro') returning id) insert into ids select 'otro', id from p;
insert into membership (school_id, person_id, role, status) values (pg_temp.id('A'), pg_temp.id('ana'), 'director', 'active'),
    (pg_temp.id('A'), pg_temp.id('pablo'), 'teacher', 'active'), (pg_temp.id('B'), pg_temp.id('otro'), 'teacher', 'active');
with t as (insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x') returning id) insert into ids select 'terms', id from t;
insert into membership (school_id, person_id, role, status, payment_day) values (pg_temp.id('A'), pg_temp.id('sofia'), 'student', 'active', 15);
insert into terms_acceptance (school_id, terms_id, student_id, accepted_by) values (pg_temp.id('A'), pg_temp.id('terms'), pg_temp.id('sofia'), pg_temp.id('sofia'));

-- ---- Teachers see who accepted ----

select pg_temp.act_as(pg_temp.id('u_pablo'));
select is((select count(*)::int from terms_acceptance), 1, 'a teacher reads the school''s acceptances');
select pg_temp.act_as(pg_temp.id('u_otro'));
select is((select count(*)::int from terms_acceptance), 0, 'a teacher at another school reads none');

-- ---- The admin invites another director ----

select pg_temp.act_as(pg_temp.id('u_ana'));
select throws_ok($$ select public.admin_invite_director(pg_temp.id('A'), 'Luis', 'luis@helios.mx') $$, '42501', null, 'a director can''t invite directors');
select throws_ok($$ select * from public.admin_director_emails() $$, '42501', null, 'nor read their emails');

select pg_temp.act_as(pg_temp.id('u_admin'));
select public.admin_invite_director(pg_temp.id('A'), 'Luis Peña', 'luis@helios.mx');
select pg_temp.act_as(null);
select is((select kind from email_outbox where to_email = 'luis@helios.mx'), 'invite', 'the new director''s invitation is queued');
select is((select count(*)::int from membership m join person p on p.id = m.person_id where p.full_name = 'Luis Peña' and m.school_id = pg_temp.id('A')
           and m.status = 'invited'), 2, 'as director and teacher, invited');
select is((select action from admin_log order by created_at desc limit 1), 'director_invited', 'and logged');

select pg_temp.act_as(pg_temp.id('u_admin'));
select is((select array_agg(email order by email) from public.admin_director_emails()), array['ana@helios.mx'],
    'the admin reads the directors'' emails (invited ones have no login yet)');

select * from finish();
rollback;
