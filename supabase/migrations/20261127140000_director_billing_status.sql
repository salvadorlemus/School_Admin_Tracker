create or replace function public.director_billing_status(requested_school uuid)
returns table (billing text, due_month date, due_on date)
language plpgsql security definer set search_path = '' as $$
declare
    bill public.school_billing%rowtype;
    month_start date := date_trunc('month', current_date)::date;
    today date := current_date;
    due date;
begin
    if not private.is_director(requested_school) then
        raise exception 'Only a school director can read platform billing status'
            using errcode = '42501';
    end if;

    select * into bill from public.school_billing where school_id = requested_school;
    if not found or coalesce(bill.monthly_fee, 0) <= 0
       or (bill.trial_ends is not null and bill.trial_ends >= today)
       or exists (
            select 1
            from public.billing_payment payment
            where payment.school_id = requested_school
              and payment.month = month_start
       )
    then
        return query select 'ok'::text, null::date, null::date;
        return;
    end if;

    due := make_date(extract(year from today)::int, extract(month from today)::int, bill.billing_day);
    return query select
        case when today > due then 'late' else 'soon' end::text,
        month_start,
        due;
end $$;

grant execute on function public.director_billing_status(uuid) to authenticated;
revoke execute on function public.director_billing_status(uuid) from public, anon;
