-- School-wide vacation dates mark sessions as canceled in calendar views without changing or
-- logging the sessions themselves. A single board post records each director's selection.

alter type announcement_kind add value 'vacation';
alter type announcement_kind add value 'vacation_removed';

create table school_vacation (
    school_id      uuid not null references school on delete cascade,
    vacation_date  date not null,
    created_by     uuid not null references person,
    created_at     timestamptz not null default now(),
    primary key (school_id, vacation_date)
);

alter table school_vacation enable row level security;

create policy "school members read vacation dates" on school_vacation for select to authenticated
    using (private.is_member(school_id));
create policy "directors mark vacation dates" on school_vacation for insert to authenticated
    with check (private.is_director(school_id));

grant select on school_vacation to authenticated;

create or replace function public.set_vacation_dates(requested_school uuid, vacation_dates date[], is_vacation boolean default true) returns void
    language plpgsql security definer set search_path = '' as $$
declare
    dates jsonb;
    last_date date;
begin
    if not private.is_director(requested_school) then
        raise exception 'Only a school director can mark vacation dates' using errcode = '42501';
    end if;
    if vacation_dates is null or cardinality(vacation_dates) < 1 or cardinality(vacation_dates) > 90
       or array_position(vacation_dates, null::date) is not null then
        raise exception 'Select between 1 and 90 dates' using errcode = '22023';
    end if;
    if is_vacation and exists (select 1 from unnest(vacation_dates) d where d < private.school_today(requested_school)) then
        raise exception 'Vacation dates cannot be in the past' using errcode = '22023';
    end if;

    if is_vacation then
        with changed as (
            insert into public.school_vacation (school_id, vacation_date, created_by)
            select requested_school, d, private.me() from (select distinct unnest(vacation_dates) d) picked
            on conflict (school_id, vacation_date) do nothing
            returning vacation_date
        )
        select jsonb_agg(to_char(vacation_date, 'YYYY-MM-DD') order by vacation_date), max(vacation_date)
        into dates, last_date from changed;
    else
        with changed as (
            delete from public.school_vacation where school_id = requested_school and vacation_date = any(vacation_dates)
            returning vacation_date
        )
        select jsonb_agg(to_char(vacation_date, 'YYYY-MM-DD') order by vacation_date), max(vacation_date)
        into dates, last_date from changed;
    end if;

    if dates is not null then
        insert into public.announcement (school_id, kind, vars, visible_until, created_by)
        values (requested_school, case when is_vacation then 'vacation'::public.announcement_kind else 'vacation_removed'::public.announcement_kind end,
                jsonb_build_object('dates', dates), greatest(last_date, private.school_today(requested_school)) + 1, private.me());
    end if;
end $$;

grant execute on function public.set_vacation_dates(uuid, date[], boolean) to authenticated;
revoke execute on function public.set_vacation_dates(uuid, date[], boolean) from public, anon;
