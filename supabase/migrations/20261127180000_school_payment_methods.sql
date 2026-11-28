create table school_payment_method (
    school_id uuid not null references school on delete cascade,
    key text not null,
    label text not null check (length(label) between 2 and 80),
    enabled boolean not null default true,
    sort_order smallint not null default 0,
    primary key (school_id, key)
);

alter table school_payment_method enable row level security;

create policy "members read payment methods" on school_payment_method for select to authenticated
    using (private.is_member(school_id));
create policy "directors write payment methods" on school_payment_method for all to authenticated
    using (private.is_director(school_id))
    with check (private.is_director(school_id));

insert into school_payment_method (school_id, key, label, enabled, sort_order)
select id, 'transfer', 'Transferencia / deposito', true, 1 from school
union all select id, 'terminal', 'Terminal', true, 2 from school
union all select id, 'cash', 'Efectivo', true, 3 from school;

create or replace function private.insert_default_payment_methods() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    insert into public.school_payment_method (school_id, key, label, enabled, sort_order)
    values
        (new.id, 'transfer', 'Transferencia / deposito', true, 1),
        (new.id, 'terminal', 'Terminal', true, 2),
        (new.id, 'cash', 'Efectivo', true, 3);
    return new;
end $$;

create trigger school_payment_methods_default after insert on school
    for each row execute function private.insert_default_payment_methods();

alter table payment_proof alter column method type text using method::text;

create or replace function public.set_school_payment_methods(requested_school uuid, methods jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    item jsonb;
begin
    if not private.is_director(requested_school) then
        raise exception 'Only a school director can configure payment methods' using errcode = '42501';
    end if;
    if methods is null or jsonb_array_length(methods) < 3 then
        raise exception 'Three default payment methods are required' using errcode = '22023';
    end if;

    delete from public.school_payment_method where school_id = requested_school;
    for item in select * from jsonb_array_elements(methods)
    loop
        insert into public.school_payment_method (school_id, key, label, enabled, sort_order)
        values (
            requested_school,
            lower(regexp_replace(coalesce(item ->> 'key', ''), '[^a-z0-9_-]', '-', 'g')),
            coalesce(item ->> 'label', ''),
            coalesce((item ->> 'enabled')::boolean, true),
            greatest(0, coalesce((item ->> 'sort_order')::smallint, 0))
        );
    end loop;

    insert into public.school_payment_method (school_id, key, label, enabled, sort_order)
    values
        (requested_school, 'transfer', 'Transferencia / deposito', true, 1),
        (requested_school, 'terminal', 'Terminal', true, 2),
        (requested_school, 'cash', 'Efectivo', true, 3)
    on conflict (school_id, key) do update
        set label = case excluded.key
                when 'transfer' then 'Transferencia / deposito'
                when 'terminal' then 'Terminal'
                when 'cash' then 'Efectivo'
                else public.school_payment_method.label
            end,
            enabled = true,
            sort_order = excluded.sort_order;
end $$;

grant select, insert, update, delete on school_payment_method to authenticated;
grant execute on function public.set_school_payment_methods(uuid, jsonb) to authenticated;
revoke execute on function public.set_school_payment_methods(uuid, jsonb) from public, anon;

create or replace function private.payment_method_allowed() returns trigger
    language plpgsql security definer set search_path = '' as $$
begin
    if not exists (
        select 1 from public.school_payment_method
        where school_id = new.school_id and key = new.method and enabled
    ) then
        raise exception 'This payment method is not enabled by the school' using errcode = '23514';
    end if;
    return new;
end $$;

create trigger payment_method_allowed before insert on payment_proof
    for each row execute function private.payment_method_allowed();
revoke execute on function private.insert_default_payment_methods(), private.payment_method_allowed() from public, anon, authenticated;
