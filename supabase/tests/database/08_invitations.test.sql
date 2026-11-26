-- Invitations: one login per person, a link that works once, the same answer whether the person existed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
create function pg_temp.token(address text) returns text language sql as $$
    select vars ->> 'token' from email_outbox where to_email = address order by created_at desc, id desc limit 1 $$;

insert into ids values ('u_admin', pg_temp.login('admin@lyra.mx')), ('u_sofia', pg_temp.login('sofia@correo.mx'));
insert into platform_admin values (pg_temp.id('u_admin'));
insert into person (user_id, full_name) values (pg_temp.id('u_sofia'), 'Sofía Ramírez');
with s as (insert into school (name) values ('Otra escuela') returning id) insert into ids select 'B', id from s;
insert into terms (school_id, file_path) values (pg_temp.id('B'), 'x');
insert into membership (school_id, person_id, role, status, payment_day) select pg_temp.id('B'), id, 'student', 'active', 15 from person where user_id = pg_temp.id('u_sofia');

-- ---- The admin registers a school and its first director ----

select pg_temp.act_as(pg_temp.id('u_admin'));
insert into ids select 'A', public.admin_create_school('Helios', 'Ana Torres', 'ana@helios.mx');
select pg_temp.act_as(null);
select is((select kind from email_outbox where to_email = 'ana@helios.mx'), 'invite', 'the director''s invitation is queued');
select isnt(pg_temp.token('ana@helios.mx'), null, 'with its link');
select is((select count(*)::int from invitation where token_hash = extensions.digest(pg_temp.token('ana@helios.mx'), 'sha256')), 1, 'only its hash is kept');
select is((public.invitation_peek(pg_temp.token('ana@helios.mx'))) ->> 'school', 'Helios', 'the page shows the school before anything is spent');

-- She sets her password: the Edge Function creates her login, then spends the link.
insert into ids values ('u_ana', pg_temp.login('ana@helios.mx'));
select public.redeem_invitation(pg_temp.token('ana@helios.mx'), pg_temp.id('u_ana'));
select is((select count(*)::int from membership m join person p on p.id = m.person_id where p.user_id = pg_temp.id('u_ana') and m.status = 'active'), 2,
    'the director (and teacher) is active');
select throws_ok($$ select public.redeem_invitation(pg_temp.token('ana@helios.mx'), pg_temp.id('u_ana')) $$, 'P0001', null, 'the link works once');

-- ---- The director invites ----

select pg_temp.act_as(pg_temp.id('u_ana'));
select throws_ok($$ select public.invite(pg_temp.id('A'), 'student', 'nueva@correo.mx', 'Nueva', 15::smallint) $$, 'P0001', null,
    'no students before the terms are uploaded');
insert into terms (school_id, file_path) values (pg_temp.id('A'), 'x');
select public.invite(pg_temp.id('A'), 'teacher', 'pablo@correo.mx', 'Pablo Olivares');
select public.invite(pg_temp.id('A'), 'guardian', 'mama@correo.mx', 'Andrea Gutiérrez', null, '[{"full_name": "Emma Gutiérrez", "payment_day": 15}]');
select public.invite(pg_temp.id('A'), 'student', 'sofia@correo.mx', 'Sofía', 30::smallint);
select throws_ok($$ select public.invite(pg_temp.id('A'), 'director', 'otro@correo.mx', 'Otro') $$, '42501', null, 'only the admin invites directors');
select is((select count(*)::int from membership where school_id = pg_temp.id('A') and role = 'student' and minor), 1, 'a guardian''s child is registered as a minor');

select pg_temp.act_as(null);
select is((select count(*)::int from person p join auth.users u on u.id = p.user_id where u.email = 'sofia@correo.mx'), 1,
    'a student already at another school keeps one login');
select is((select kind from email_outbox where to_email = 'sofia@correo.mx'), 'added_to_school', 'and gets the "you were added" email');
select isnt((select vars ->> 'terms_path' from email_outbox where to_email = 'sofia@correo.mx'), null, 'which carries the school''s terms');

-- Resending: the old link stops working.
create temp table first_link as select pg_temp.token('pablo@correo.mx') as token;
delete from email_outbox where vars ->> 'token' = (select token from first_link);
select pg_temp.act_as(pg_temp.id('u_ana'));
select public.resend_invitation((select m.id from membership m join person p on p.id = m.person_id where p.full_name = 'Pablo Olivares' and m.school_id = pg_temp.id('A')));
select pg_temp.act_as(null);
select is((public.invitation_peek((select token from first_link))) ->> 'cancelled', 'true', 'a new link cancels the old one');
select is((public.invitation_peek(pg_temp.token('pablo@correo.mx'))) ->> 'ok', 'true', 'the new one works');

-- ---- Nobody signed in reaches the invitation functions; the admin deletes only a disabled school ----

select pg_temp.act_as(pg_temp.id('u_ana'));
select throws_ok($$ select public.invitation_peek('x') $$, '42501', null, 'the page''s functions are the Edge Function''s alone');
select pg_temp.act_as(pg_temp.id('u_admin'));
select throws_ok($$ select public.admin_delete_school(pg_temp.id('A'), 'Helios') $$, 'P0001', null, 'an enabled school can''t be deleted');
select public.admin_set_enabled(pg_temp.id('A'), false);
select throws_ok($$ select public.admin_delete_school(pg_temp.id('A'), 'helios') $$, '22023', null, 'deleting needs the exact name');

select * from finish();
rollback;
