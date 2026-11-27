-- Directors read their own platform billing status; no anonymous function access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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
create function pg_temp.id(key text) returns uuid language sql as $$
    select id from ids where name = key
$$;

insert into ids values
    ('u_dir_soon', pg_temp.login('soon@billing.mx')),
    ('u_dir_late', pg_temp.login('late@billing.mx')),
    ('u_teacher', pg_temp.login('teacher@billing.mx'));

insert into person (id, user_id, full_name)
select gen_random_uuid(), id, name from ids;
insert into ids
select 'p_' || case i.name
    when 'u_dir_soon' then 'dir_soon'
    when 'u_dir_late' then 'dir_late'
    else 'teacher'
end, p.id
from ids i join person p on p.user_id = i.id;

with s as (
    insert into school (name) values ('Billing Soon'), ('Billing Late') returning id, name
)
insert into ids select case name when 'Billing Soon' then 'soon' else 'late' end, id from s;

insert into school_billing (school_id, monthly_fee, billing_day)
select pg_temp.id('soon'), 1000, 28
union all select pg_temp.id('late'), 1000, 1;

insert into membership (school_id, person_id, role, status)
select pg_temp.id('soon'), pg_temp.id('p_dir_soon'), 'director'::member_role, 'active'::member_status
union all
select pg_temp.id('late'), pg_temp.id('p_dir_late'), 'director'::member_role, 'active'::member_status;

select pg_temp.act_as(pg_temp.id('u_dir_soon'));
select is((select billing from public.director_billing_status(pg_temp.id('soon'))), 'soon',
    'the director sees due soon before the billing day');

select pg_temp.act_as(pg_temp.id('u_dir_late'));
select is((select billing from public.director_billing_status(pg_temp.id('late'))), 'late',
    'the director sees overdue after the billing day');

select pg_temp.act_as(null);
insert into billing_payment (school_id, school_name, amount, month, paid_on, method)
values (pg_temp.id('late'), 'Billing Late', 1000, date_trunc('month', current_date)::date, current_date, 'transfer');
select pg_temp.act_as(pg_temp.id('u_dir_late'));
select is((select billing from public.director_billing_status(pg_temp.id('late'))), 'ok',
    'a recorded platform payment clears the overdue status');

select throws_ok($$ select public.director_billing_status(pg_temp.id('soon')) $$,
    '42501', null, 'a director cannot read another school billing status');

select pg_temp.act_as(null);
select throws_ok($$ select public.director_billing_status(pg_temp.id('soon')) $$,
    '42501', null, 'anonymous visitors cannot run the billing status function');

select pg_temp.act_as(pg_temp.id('u_teacher'));
select throws_ok($$ select public.director_billing_status(pg_temp.id('soon')) $$,
    '42501', null, 'a teacher cannot read platform billing status');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private')
             and has_function_privilege('anon', p.oid, 'execute')
             and p.proname in ('director_billing_status', 'set_vacation_dates')), 0,
    'new school billing and vacation RPCs are not executable by anon');

select * from finish();
rollback;
