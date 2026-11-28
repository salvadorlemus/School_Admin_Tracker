-- Fills Helios with invented students and two months of history, on the classes it already has:
-- 50 students (adults and minors with their guardians) with their cards, packages and enrollments,
-- attendance for every session of the last two months, payment screenshots for this month and the
-- one before, registration fees, the last two closed teacher pay periods, and two board notes. Run
-- by hand in Supabase → SQL Editor (not a migration), when Helios's director needs data to see.
--
-- It's supabase/seed.sql's students and history, dated back from today instead of from fixed dates,
-- for a Helios whose setup is already there (the seed only runs on an empty Helios). It stops if:
--   Helios doesn't exist      run supabase/scripts/test_users.sql first;
--   Helios has no classes     run supabase/seed.sql instead (it makes the setup and all of this);
--   it already has students   without a login, invented ones: run clear_helios_sample.sql first.
-- Payment screenshots have rows but no image files. clear_helios_sample.sql removes all of it.
--
-- Runs as the database owner, so it can write history the app itself could never back-date.

do $sample$
declare
    helios uuid := (select id from school where name = 'Helios');
    zone text;
    today date;
    history_from date;
    -- seed.sql's dates were written for 26 Nov 2026; the students' joining days move with today.
    shift integer;
    this_month date;
    last_month date;
    periods daterange[];
    guest uuid;
    st record;
    k text;
    cnt integer;
    week_slots uuid[];
begin
    if helios is null then
        raise notice 'There is no school named Helios: run supabase/scripts/test_users.sql first';
        return;
    end if;
    if not exists (select 1 from class where school_id = helios) then
        raise notice 'Helios has no classes yet: run supabase/seed.sql instead, which sets it up with its students';
        return;
    end if;
    if exists (select 1 from membership m join person p on p.id = m.person_id
               where m.school_id = helios and m.role = 'student' and p.user_id is null
                 and not exists (select 1 from guardian_link g join person gp on gp.id = g.guardian_id
                                 where g.school_id = helios and g.student_id = p.id and gp.user_id is not null)) then
        raise notice 'Helios already has invented students: run supabase/scripts/clear_helios_sample.sql first to start again';
        return;
    end if;
    zone := (select time_zone from school where id = helios);
    today := private.school_today(helios);
    history_from := today - 61;
    shift := today - date '2026-11-26';
    this_month := date_trunc('month', today)::date;
    last_month := (this_month - interval '1 month')::date;
    -- The two latest closed half-month pay periods.
    periods := case when extract(day from today) > 15
        then array[daterange(last_month + 15, this_month), daterange(this_month, this_month + 15)]
        else array[daterange(last_month, last_month + 15), daterange(last_month + 15, this_month)] end;
    perform setseed(0.42);

    -- The script writes history and invented records: the app's own checks and notices stay off while it runs.
    alter table enrollment disable trigger enrollment_saved;
    alter table student_package disable trigger package_saved;
    alter table booking disable trigger booking_saved;
    alter table payment_proof disable trigger proof_saved;
    alter table attendance disable trigger notify_over_plan;
    alter table enrollment disable trigger notify_enrollment;
    alter table student_package disable trigger notify_package;
    alter table registration_fee disable trigger notify_fee;
    alter table student_card_log disable trigger notify_card_change;
    alter table membership disable trigger fee_on_joining;

    if not exists (select 1 from terms where school_id = helios) then
        insert into terms (school_id, file_path) values (helios, 'pending');
    end if;

    insert into school_payment_method (school_id, key, label, enabled, sort_order)
    values
        (helios, 'card', 'Tarjeta', true, 4),
        (helios, 'totalpass', 'TotalPass', true, 5),
        (helios, 'wellhub', 'Wellhub', true, 6)
    on conflict (school_id, key) do update set label = excluded.label, enabled = true;

    -- ---- The classes Helios gives now, by kind (from their names, as seed.sql named them) ----
    create temp table seed_class on commit drop as
    select c.id, c.teacher_id, c.monthly_sessions,
           case when c.for_kids then 'kids' when c.name ilike '%movilidad%' then 'mobility' when c.name ilike '%dueto%' then 'duet'
                when c.name ilike '%avanzad%' then 'advanced' else 'aerial' end as kind
    from class c where c.school_id = helios and c.kind = 'weekly' and (c.ends_on is null or c.ends_on >= today);
    create temp table seed_slot on commit drop as
    select sc.*, cl.kind from schedule sc join seed_class cl on cl.id = sc.class_id where sc.last_date >= today;

    -- The past sessions the history needs (sessions already there are kept).
    perform private.generate_sessions(id, history_from) from seed_slot;

    -- ---- 50 students ----
    create temp table seed_student (n integer primary key, name text, age integer, plan text, payday smallint, since date, guardian text,
                                    health text, person uuid) on commit drop;
    insert into seed_student (n, name, age, plan, payday, since, guardian, health) values
        (1, 'Andrea Gutiérrez Luna', 34, 'pk3', 15, null, null, null),
        (2, 'Valeria Campos Rey', 31, 'pk2', 30, null, null, null),
        (3, 'Fernanda Ibarra', 24, 'pk4', 15, null, null, null),
        (4, 'Ximena Robles', 22, 'pk2', 30, null, null, null),
        (5, 'Daniela Ochoa Pérez', 35, 'pk3', 30, null, null, 'Escoliosis leve; evitar cargar peso de un solo lado y avisarle antes de envolturas de cadera.'),
        (6, 'Carolina Méndez', 29, 'pk5', 15, null, null, null),
        (7, 'Paola Cervantes', 26, 'pk2', 15, null, null, null),
        (8, 'Natalia Herrera Díaz', 33, 'pk3', 30, null, null, null),
        (9, 'Mariana Solís', 27, 'pk2', 30, null, null, null),
        (10, 'Regina Aguilar', 21, 'pk4', 30, null, null, null),
        (11, 'Itzel Navarro', 30, 'pk2', 15, null, null, null),
        (12, 'Alejandra Montes', 38, 'pk3', 15, null, null, null),
        (13, 'Sofía Treviño', 25, 'pk2', 30, null, null, null),
        (14, 'Lucía Zamora', 32, 'pk3', 30, null, null, null),
        (15, 'Karla Villanueva', 23, 'pk5', 30, null, null, null),
        (16, 'Diana Salazar', 36, 'pk3', 15, null, null, null),
        (17, 'Montserrat Vega', 20, 'pk2', 30, '2026-10-12', null, null),
        (18, 'Renata Fuentes', 29, 'pk4', 15, null, null, null),
        (19, 'Gabriela Lara', 27, 'pk3', 15, null, null, null),
        (20, 'Tania Medina', 31, 'pk2', 15, null, null, null),
        (21, 'Miguel Ángel Rosas', 30, 'pk3', 30, null, null, null),
        (22, 'Isabel Cárdenas', 44, 'pk3', 30, null, null, 'Hipertensión controlada con medicamento; nada de invertidos prolongados. Si se marea, bajarla y que descanse sentada.'),
        (23, 'Abril Sandoval', 19, 'pk4', 15, '2026-10-05', null, null),
        (24, 'Camila Esquivel', 24, 'pk2', 15, '2026-11-23', null, null),
        (25, 'Ana Paula Ríos', 22, 'pk2', 30, '2026-11-03', null, null),
        (26, 'Rodrigo Arellano', 33, 'wellhub', 30, null, null, null),
        (27, 'Mónica Gallardo', 37, 'wellhub', 30, null, null, null),
        (28, 'Héctor Lozano', 41, 'wellhub', 30, null, null, null),
        (29, 'Paulina Estrada', 26, 'wellhub', 30, null, null, null),
        (30, 'Adriana Becerra', 30, 'wellhub', 30, null, null, null),
        (31, 'Julieta Carrillo', 27, 'totalpass', 30, null, null, null),
        (32, 'Óscar Mejía', 32, 'totalpass', 30, null, null, null),
        (33, 'Lorena Quintero', 45, 'totalpass', 30, null, null, 'Lesión de muñeca derecha (2025); usa muñequera y evita colgarse solo de esa mano.'),
        (34, 'Cecilia Rangel', 28, 'totalpass', 30, null, null, null),
        (35, 'Pamela Juárez', 23, 'totalpass', 30, '2026-10-20', null, null),
        (36, 'Silvia Arriaga', 52, 'mobility', 15, null, null, 'Prótesis de cadera izquierda; solo los ejercicios de piso que aprobó su médico, sin aperturas forzadas.'),
        (37, 'Teresa Lugo', 47, 'mobility', 30, null, null, null),
        (38, 'Santiago Bravo', 29, 'duet', 30, null, null, null),
        (39, 'Melissa Ortega Cruz', 27, 'duet', 30, null, null, null),
        (40, 'Daniel Velasco', 31, 'visit', 30, null, null, null),
        (41, 'Viviana Rocha', 25, 'visit', 30, null, null, null),
        (42, 'Mauricio Peña', 34, 'visit', 30, null, null, null),
        (43, 'Frida Contreras', 21, 'visit', 30, '2026-11-10', null, null),
        (44, 'Emma Gutiérrez', 8, 'kids', 15, null, 'Andrea Gutiérrez Luna', null),
        (45, 'Luciana Campos', 10, 'kids', 30, null, 'Valeria Campos Rey', null),
        (46, 'Mía Robles', 7, 'kids', 30, null, 'Karen Robles', 'Asma; su inhalador va en la bolsa de enfrente de la mochila.'),
        (47, 'Sara Hernández', 11, 'kids', 15, null, 'Patricia Hernández', null),
        (48, 'Victoria Salgado', 12, 'kids', 15, null, 'Claudia Salgado', null),
        (49, 'Renata Ibáñez', 6, 'kids', 30, null, 'Gloria Ibáñez', null),
        (50, 'Alexa Duarte', 10, 'kids', 15, '2026-11-09', 'Marcela Duarte', null);
    update seed_student set since = since + shift where since is not null;

    for st in select * from seed_student order by n loop
        insert into person (full_name) values (st.name) returning id into k;
        update seed_student set person = k::uuid where n = st.n;
        insert into membership (school_id, person_id, role, status, minor, payment_day)
        values (helios, k::uuid, 'student', 'active', st.guardian is not null, st.payday);
        insert into student_card (school_id, student_id, full_name, birth_date, health_notes, declared_at)
        values (helios, k::uuid, st.name, (today - make_interval(years => st.age, days => (st.n * 37) % 300))::date, st.health, now());
        insert into terms_acceptance (school_id, terms_id, student_id) values (helios, private.latest_terms(helios), k::uuid);
        if st.guardian is null then
            insert into emergency_contact (card_id, name, relation, phone)
            select id, (array['Laura', 'Jorge', 'Rosa', 'Miguel', 'Carmen', 'Luis', 'Patricia', 'Ricardo'])[1 + st.n % 8] || ' ' || split_part(st.name, ' ', 2),
                   (array['mother', 'partner', 'sister', 'father', 'husband', 'brother', 'friend', 'wife'])[1 + st.n % 8],
                   format('55 %s %s', lpad((1000 + st.n * 73 % 9000)::text, 4, '0'), lpad((1000 + st.n * 191 % 9000)::text, 4, '0'))
            from student_card where school_id = helios and student_id = k::uuid;
        end if;
    end loop;

    -- Guardians: an adult student who's also a parent keeps one person; the others have no login.
    for st in select * from seed_student where guardian is not null loop
        select person into k from seed_student where name = st.guardian;
        if k is null then
            insert into person (full_name) values (st.guardian) returning id into k;
        end if;
        insert into membership (school_id, person_id, role, status) values (helios, k::uuid, 'guardian', 'active')
        on conflict (school_id, person_id, role) do nothing;
        insert into guardian_link values (helios, k::uuid, st.person);
        insert into family_person (school_id, guardian_id, name, relation, phone, is_emergency)
        select helios, k::uuid, st.guardian, 'mother', format('55 %s 4%s', 2000 + st.n, lpad(st.n::text, 3, '0')), true
        where not exists (select 1 from family_person f where f.school_id = helios and f.guardian_id = k::uuid);
        insert into family_person_child select f.id, st.person from family_person f where f.school_id = helios and f.guardian_id = k::uuid;
    end loop;

    -- ---- What each student takes: a package at its current price, or a monthly plan ----
    for st in select * from seed_student loop
        k := coalesce(st.since, (date '2026-01-05' + (st.n * 23) % 210))::text;
        if st.plan like 'pk%' or st.plan = 'kids' then
            insert into student_package (school_id, student_id, offer_id, per_week, starts_on, price)
            select helios, st.person, o.id, o.per_week, k::date,
                   (select p.amount from price p where p.offer_id = o.id and p.starts_on <= today order by p.starts_on desc limit 1)
            from package_offer o
            where o.school_id = helios and o.retired_at is null
              and o.per_week = case st.plan when 'kids' then 3 else substr(st.plan, 3)::int + 1 end
            order by o.created_at limit 1;
        elsif st.plan in ('mobility', 'duet') then
            insert into enrollment (school_id, student_id, class_id, how, starts_on, price)
            select helios, st.person, cl.id, 'monthly', k::date,
                   coalesce((select p.amount from price p where p.class_id = cl.id and p.kind = 'monthly' and p.starts_on <= today
                             order by p.starts_on desc limit 1), 1000)
            from seed_class cl where cl.kind = st.plan and cl.monthly_sessions is not null limit 1;
        end if;
    end loop;

    -- Each student's usual week (their slots), chosen steadily from their number: never two on one day.
    create temp table seed_week (student uuid, schedule uuid, odds numeric) on commit drop;
    for st in select * from seed_student loop
        week_slots := '{}';
        cnt := case when st.plan like 'pk%' then substr(st.plan, 3)::int when st.plan in ('wellhub', 'totalpass') then 2 + st.n % 2
                  when st.plan = 'visit' then 1 else 0 end;
        -- Aerial classes (the advanced ones for packages of 4 and 5).
        for k in
            select s.id from seed_slot s
            where s.kind = 'aerial' or (s.kind = 'advanced' and st.plan in ('pk4', 'pk5'))
            order by md5(st.n::text || s.id::text)::uuid
        loop
            exit when cardinality(week_slots) >= cnt;
            if not exists (select 1 from seed_slot o, seed_slot s where s.id = k::uuid and o.id = any (week_slots) and o.weekday = s.weekday) then
                week_slots := week_slots || k::uuid;
            end if;
        end loop;
        -- One complementary for packages; the kids' class three times a week; the complementary-only plans.
        if st.plan like 'pk%' then
            week_slots := week_slots || array(select s.id from seed_slot s
                                              where s.kind in ('mobility', 'duet') and not exists (select 1 from seed_slot o where o.id = any (week_slots)
                                                  and o.weekday = s.weekday and o.start_time < s.end_time and s.start_time < o.end_time)
                                              order by md5(st.n::text || s.id::text) limit 1);
        elsif st.plan = 'kids' then
            week_slots := array(select id from seed_slot where kind = 'kids');
        elsif st.plan = 'mobility' then
            week_slots := array(select id from seed_slot where kind = 'mobility');
        elsif st.plan = 'duet' then
            week_slots := array(select id from seed_slot where kind = 'duet' and weekday >= 5);
        end if;
        insert into seed_week select st.person, unnest(week_slots),
            case when st.plan in ('wellhub', 'totalpass') then 0.72 when st.plan = 'visit' then 0.4 else 0.87 end;
        -- Per-visit and Wellhub/TotalPass students are enrolled per visit in their usual classes.
        if st.plan in ('wellhub', 'totalpass', 'visit') then
            insert into enrollment (school_id, student_id, class_id, how, starts_on, price)
            select distinct helios, st.person, s.class_id, 'visit'::pay_how, coalesce(st.since, history_from - 30),
                   coalesce((select p.amount from price p where p.school_id = helios and p.kind = 'visit' and p.starts_on <= today
                             order by p.starts_on desc limit 1), 290)
            from seed_slot s where s.id = any (week_slots);
        end if;
    end loop;

    -- ---- Two months of attendance: each session already given, by each student's usual week ----
    insert into attendance (school_id, session_id, person_id, kind, method, created_by, created_at)
    select helios, x.id, w.student, 'student', 'qr', w.student,
           x.starts_at - make_interval(mins => (abs(hashtext(w.student::text || x.id::text)) % 12))
    from session x
    join seed_week w on w.schedule = x.schedule_id
    join seed_student ss on ss.person = w.student
    where x.school_id = helios and x.status = 'scheduled' and x.ends_at < now()
      and (x.starts_at at time zone zone)::date >= greatest(history_from, coalesce(ss.since, history_from))
      and (abs(hashtext('came' || w.student::text || x.id::text)) % 1000) / 1000.0 < w.odds
    on conflict do nothing;

    -- A guest teacher now and then (another of the school's teachers, in the advanced class every other week),
    -- who also covers one session five weeks ago.
    select m.person_id into guest from membership m join person p on p.id = m.person_id
    where m.school_id = helios and m.role = 'teacher' and m.status = 'active'
      and m.person_id not in (select teacher_id from seed_class where kind = 'advanced')
    order by p.full_name limit 1;
    if guest is not null then
        insert into attendance (school_id, session_id, person_id, kind, method, created_by)
        select helios, x.id, guest, 'guest_teacher', 'qr', guest
        from session x join seed_class cl on cl.id = x.class_id and cl.kind = 'advanced'
        where x.ends_at < now() and x.starts_at >= history_from and extract(week from x.starts_at)::int % 2 = 0 and x.status = 'scheduled'
        on conflict do nothing;
        update session set substitute_id = guest
        where id = (select x.id from session x join seed_class cl on cl.id = x.class_id and cl.kind = 'aerial' and cl.teacher_id <> guest
                    where x.status = 'scheduled' and (x.starts_at at time zone zone)::date between today - 37 and today - 35
                    order by x.starts_at limit 1);
    end if;

    -- Trial classes for the newest students, the week before they joined.
    insert into booking (school_id, student_id, session_id, class_id, kind, price, created_at)
    select distinct on (ss.person) helios, ss.person, x.id, x.class_id, 'trial', 290, x.starts_at - interval '2 days'
    from seed_student ss join session x on x.school_id = helios and x.status = 'scheduled'
         and (x.starts_at at time zone zone)::date between ss.since - 6 and ss.since - 1
    join seed_class cl on cl.id = x.class_id and cl.kind = case when ss.plan = 'kids' then 'kids' else 'aerial' end
    where ss.since is not null and x.ends_at < now()
    order by ss.person, x.starts_at;
    insert into attendance (school_id, session_id, person_id, kind, method, created_by, created_at)
    select helios, b.session_id, b.student_id, 'student', 'qr', b.student_id, (select starts_at from session where id = b.session_id)
    from booking b join seed_student ss on ss.person = b.student_id where b.school_id = helios and b.kind = 'trial' on conflict do nothing;

    -- ---- Payments: last month and this one around each payment day; per class and Wellhub/TotalPass, per visit ----
    insert into payment_proof (id, school_id, student_id, method, covers, enrollment_id, package_id, month, amount, expected, file_path, state, reason,
                               decided_at, created_by, created_at)
    select pid, helios, plan.student, (array['transfer', 'transfer', 'card', 'cash'])[1 + abs(hashtext(plan.id::text || m::text)) % 4],
           'month', plan.enrollment, plan.package, m, plan.price, plan.price,
           format('%s/proofs/%s/%s.jpg', helios, plan.student, pid),
           case when sent < today - 6 then 'confirmed' else 'uploaded' end::proof_state, null,
           case when sent < today - 6 then sent + interval '1 day 10 hours' end, plan.student, sent + interval '13 hours'
    from (select e.student_id as student, e.id, e.id as enrollment, null::uuid as package, e.price, e.starts_on from enrollment e where e.school_id = helios and e.how = 'monthly'
          union all select p.student_id, p.id, null, p.id, p.price, p.starts_on from student_package p where p.school_id = helios) plan
    join seed_student ss on ss.person = plan.student
    join membership ms on ms.school_id = helios and ms.person_id = plan.student and ms.role = 'student'
    cross join unnest(array[last_month, this_month]) m
    cross join lateral (select gen_random_uuid() as pid,
        greatest(plan.starts_on, private.due_day(m, ms.payment_day) + (abs(hashtext(plan.id::text || m::text)) % 10) - 4) as sent) x
    where date_trunc('month', plan.starts_on) <= m and x.sent <= today;

    insert into payment_proof (id, school_id, student_id, method, covers, session_id, amount, expected, file_path, state, decided_at, created_by, created_at)
    select pid, helios, a.person_id,
           case ss.plan when 'wellhub' then 'wellhub' when 'totalpass' then 'totalpass' else 'cash' end, 'visit', a.session_id,
           case when ss.plan in ('wellhub', 'totalpass') then 0 else 290 end, case when ss.plan in ('wellhub', 'totalpass') then 0 else 290 end,
           format('%s/proofs/%s/%s.jpg', helios, a.person_id, pid),
           case when a.created_at::date < today - 6 then 'confirmed' else 'uploaded' end::proof_state,
           case when a.created_at::date < today - 6 then a.created_at + interval '1 day' end, a.person_id, a.created_at + interval '5 minutes'
    from attendance a join seed_student ss on ss.person = a.person_id
    cross join lateral (select gen_random_uuid() as pid where a.id is not null) x
    where a.school_id = helios and (ss.plan in ('wellhub', 'totalpass', 'visit')
                                    or exists (select 1 from booking b where b.session_id = a.session_id and b.student_id = a.person_id and b.kind = 'trial'));

    -- One screenshot rejected (and sent again), one rejected for the amount.
    update payment_proof set state = 'rejected', reason = 'La imagen está borrosa, sube otra por favor.'
    where id = (select pp.id from payment_proof pp join seed_student ss on ss.person = pp.student_id where ss.n = 12 and pp.month = last_month limit 1);
    update payment_proof set state = 'rejected', reason = 'El monto no coincide con tu paquete.', amount = 1200
    where id = (select pp.id from payment_proof pp join seed_student ss on ss.person = pp.student_id where ss.n = 20 and pp.month = this_month limit 1);

    -- Registration fees: the newest students paid theirs; the one who joined this week still owes it.
    insert into registration_fee (school_id, student_id, reason, amount, owed_since, done_at)
    select helios, person, 'joined',
           coalesce((select p.amount from price p where p.school_id = helios and p.kind = 'fee' and p.starts_on <= today order by p.starts_on desc limit 1), 660),
           since, case when n = 24 then null else since + interval '2 days' end
    from seed_student where since is not null and plan not in ('wellhub', 'totalpass', 'visit');

    -- ---- Teacher payments for the two closed periods: the earlier paid and confirmed; in the later, one to confirm, one to pay ----
    insert into teacher_payment (school_id, teacher_id, period_start, period_end, amount, calculated, paid_on, method, answer, answered_at)
    select helios, tt.person_id, lower(pr.p), upper(pr.p) - 1, pay.total, pay.total, upper(pr.p) - 1, 'transfer',
           case when pr.i = 2 and tt.rank = 1 then null else 'received' end::teacher_payment_answer,
           case when pr.i = 2 and tt.rank = 1 then null else upper(pr.p) end
    from (select m.person_id, row_number() over (order by p.full_name) as rank, count(*) over () as total
          from membership m join person p on p.id = m.person_id
          where m.school_id = helios and m.role = 'teacher' and m.status = 'active') tt
    cross join unnest(periods) with ordinality pr(p, i)
    cross join lateral (select coalesce(sum((private.session_pay(x)).amount), 0) as total from session x
                        where x.school_id = helios and coalesce(x.substitute_id, x.teacher_id) = tt.person_id and x.status = 'scheduled'
                          and (x.starts_at at time zone zone)::date <@ pr.p) pay
    where pay.total > 0 and not (pr.i = 2 and tt.rank = tt.total and tt.total > 1)
      and not exists (select 1 from teacher_payment tp where tp.school_id = helios and tp.teacher_id = tt.person_id and tp.period_start = lower(pr.p));

    -- ---- The board ----
    insert into announcement (school_id, class_id, kind, body, visible_until, created_by, created_at)
    select helios, cl.id, 'note',
           'A fin de mes presentamos los duetos al final de la clase. Las dos semanas antes ensayamos la secuencia completa; vengan con su pareja.',
           today + 30, cl.teacher_id, now() - interval '2 days'
    from seed_class cl where cl.kind = 'duet' limit 1;
    insert into announcement (school_id, class_id, kind, body, visible_until, created_by, created_at) values
        (helios, null, 'note', 'Para registrar su clase, traigan la app de Wellhub o TotalPass abierta con el código del día.', today + 30, null, now() - interval '6 days');

    alter table enrollment enable trigger enrollment_saved;
    alter table student_package enable trigger package_saved;
    alter table booking enable trigger booking_saved;
    alter table payment_proof enable trigger proof_saved;
    alter table attendance enable trigger notify_over_plan;
    alter table enrollment enable trigger notify_enrollment;
    alter table student_package enable trigger notify_package;
    alter table registration_fee enable trigger notify_fee;
    alter table student_card_log enable trigger notify_card_change;
    alter table membership enable trigger fee_on_joining;
    raise notice 'Helios filled from %: % students, % packages, % enrollments, % attendances, % payment screenshots, % teacher payments',
        history_from, (select count(*) from seed_student),
        (select count(*) from student_package where school_id = helios), (select count(*) from enrollment where school_id = helios),
        (select count(*) from attendance where school_id = helios), (select count(*) from payment_proof where school_id = helios),
        (select count(*) from teacher_payment where school_id = helios);
end $sample$;
