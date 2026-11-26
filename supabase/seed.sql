-- Helios, the first school with data: its real setup (one room, five teachers, the weekly schedule,
-- prices, packages and per-class teacher pay) and 50 invented students across every class, with two
-- months of history (attendance, payment screenshots, fees, teacher payments) from 26 Sep 2026.
--
-- Runs as the database owner (`supabase db reset` locally; `supabase db push --include-seed` online),
-- so it writes history the app itself could never back-date. Running it again changes nothing: it
-- stops if Helios already has classes. The test accounts (supabase/scripts/test_users.sql) are linked
-- when they exist. Payment screenshots have rows but no image files (they're invented).

do $seed$
declare
    helios uuid;
    salon uuid;
    history_from constant date := '2026-09-26';
    today date;
    t record;
    c record;
    s record;
    st record;
    k text;
    cnt integer;
    week_slots uuid[];
    pass_method text;
begin
    select id into helios from school where name = 'Helios';
    if helios is null then
        insert into school (name, time_zone) values ('Helios', 'America/Mexico_City') returning id into helios;
        insert into school_billing (school_id, monthly_fee) values (helios, 0);
    end if;
    if exists (select 1 from class where school_id = helios) then
        raise notice 'Helios already has classes: seed skipped';
        return;
    end if;
    today := private.school_today(helios);
    perform setseed(0.42);

    -- The seed writes history and invented records: the app's own checks and notices stay off while it runs.
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

    -- ---- The room and the teachers ----
    insert into room (school_id, name, max_students) values (helios, 'Salón principal', 30) returning id into salon;

    create temp table seed_teacher (key text primary key, name text, person uuid) on commit drop;
    insert into seed_teacher (key, name) values
        ('cristina', 'Cristina Urzúa'), ('miriam', 'Miriam Rodríguez'), ('pablo', 'Pablo Olivares'),
        ('dafne', 'Dafne Alexandra'), ('mariana', 'Mariana Alvarez');
    for t in select * from seed_teacher loop
        insert into person (full_name) values (t.name) returning id into k;
        update seed_teacher set person = k::uuid where key = t.key;
        insert into membership (school_id, person_id, role, status) values (helios, k::uuid, 'teacher', 'active');
        insert into staff_card (person_id) values (k::uuid);
    end loop;

    -- ---- Prices (from August; the history the school already had) ----
    insert into price (school_id, kind, amount, starts_on) values
        (helios, 'fee', 660, '2026-08-01'), (helios, 'visit', 290, '2026-08-01'), (helios, 'trial', 290, '2026-08-01');

    -- ---- The week: each teacher's groups, as the school gives them ----
    create temp table seed_class (key text primary key, name text, teacher text, kind text, weight numeric, monthly smallint, kids boolean,
                                  slots text[], id uuid) on commit drop;
    insert into seed_class (key, name, teacher, kind, weight, monthly, kids, slots) values
        ('cris-am', 'Danza aérea', 'cristina', 'aerial', 2, null, false, '{1|10:30|12:00,3|10:30|12:00,5|10:30|12:00}'),
        ('cris-pm', 'Danza aérea', 'cristina', 'aerial', 2, null, false, '{2|16:00|18:00,4|16:00|18:00}'),
        ('cris-dom', 'Danza aérea', 'cristina', 'aerial', 2, null, false, '{7|12:00|13:30}'),
        ('movilidad', 'Movilidad y flexibilidad', 'cristina', 'mobility', 1, 8, false, '{2|16:30|18:00,5|10:30|12:00}'),
        ('ninos', 'Danza aérea para niños', 'miriam', 'kids', 1, null, true, '{1|16:00|18:00,3|16:00|18:00,5|16:00|18:00}'),
        ('miriam', 'Danza aérea', 'miriam', 'aerial', 1, null, false, '{4|14:00|16:00,5|14:00|16:00}'),
        ('pablo-6', 'Danza aérea', 'pablo', 'aerial', 4, null, false, '{1|18:00|20:00,3|18:00|20:00}'),
        ('pablo-8', 'Danza aérea', 'pablo', 'aerial', 3, null, false, '{1|20:00|22:00,3|20:00|22:00,5|20:00|22:00}'),
        ('pablo-mj', 'Danza aérea', 'pablo', 'aerial', 4, null, false, '{2|18:30|20:30,4|18:30|20:30}'),
        ('pablo-dom', 'Danza aérea', 'pablo', 'aerial', 2, null, false, '{7|13:30|15:00}'),
        ('avanzados', 'Danza aérea · solo avanzados', 'pablo', 'advanced', 3, null, false, '{3|12:00|14:00,5|12:00|14:00}'),
        ('dueto', 'Dueto aéreo', 'pablo', 'duet', 1, 12, false, '{4|20:30|22:00,5|18:00|20:00,6|18:00|20:00}'),
        ('dafne-mj', 'Danza aérea', 'dafne', 'aerial', 3, null, false, '{2|20:30|22:30,4|20:30|22:30}'),
        ('dafne-sab', 'Danza aérea', 'dafne', 'aerial', 3, null, false, '{6|10:00|12:00}'),
        ('dafne-dom', 'Danza aérea', 'dafne', 'aerial', 1.5, null, false, '{7|08:00|10:00,7|10:00|12:00}'),
        ('mariana', 'Danza aérea', 'mariana', 'aerial', 2, null, false, '{6|08:00|10:00}');

    for c in select * from seed_class loop
        insert into class (school_id, name, teacher_id, monthly_sessions, for_kids, per_visit)
        values (helios, c.name, (select person from seed_teacher where key = c.teacher), c.monthly, c.kids, true) returning id into k;
        update seed_class set id = k::uuid where key = c.key;
        foreach k in array c.slots loop
            insert into schedule (school_id, class_id, weekday, start_time, end_time, first_date, last_date, room_id)
            values (helios, (select id from seed_class where key = c.key), split_part(k, '|', 1)::smallint, split_part(k, '|', 2)::time,
                    split_part(k, '|', 3)::time, '2026-08-03', '2027-07-31', salon);
        end loop;
    end loop;
    -- The schedule made sessions from today; the history needs them from 26 Sep too.
    perform private.generate_sessions(sc.id, history_from) from schedule sc where sc.school_id = helios;
    update session set status = 'cancelled' where school_id = helios and (starts_at at time zone 'America/Mexico_City')::date = '2026-11-16';

    insert into price (school_id, kind, class_id, amount, starts_on)
    select helios, 'monthly', id, case key when 'movilidad' then 600 else 1000 end, '2026-08-01' from seed_class where monthly is not null;

    -- ---- Packages: so many aerial classes a week plus one complementary, at any class ----
    for cnt in 2..5 loop
        insert into package_offer (school_id, name, per_week) values (helios, format('%s clases de aéreo + 1 complementaria', cnt), cnt + 1) returning id into k;
        insert into package_offer_class (offer_id, class_id) select k::uuid, id from seed_class;
        insert into price (school_id, kind, offer_id, amount, starts_on) values (helios, 'package', k::uuid, 1485 + (cnt - 2) * 150, '2026-08-01');
    end loop;

    -- ---- Teacher pay: per class, by how many students came ----
    insert into teacher_pay_rule (school_id, starts_on, days, scheme, empty_pay) values (helios, '2026-08-01', 'half', 'tiers', 0) returning id into k;
    insert into teacher_pay_tier (rule_id, from_students, to_students, amount) values
        (k::uuid, 1, 1, 110), (k::uuid, 2, 2, 165), (k::uuid, 3, 5, 275), (k::uuid, 6, 7, 385), (k::uuid, 8, 9, 440), (k::uuid, 10, null, 550);

    -- ---- 50 students ----
    create temp table seed_student (n integer primary key, name text, age integer, plan text, payday smallint, since date, guardian text,
                                    health text, person uuid, guardian_person uuid) on commit drop;
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

    -- ---- What each student takes ----
    for st in select * from seed_student loop
        k := coalesce(st.since, (date '2026-01-05' + (st.n * 23) % 210))::text;
        if st.plan like 'pk%' or st.plan = 'kids' then
            insert into student_package (school_id, student_id, offer_id, per_week, starts_on, price)
            select helios, st.person, o.id, o.per_week, k::date, p.amount
            from package_offer o join price p on p.offer_id = o.id
            where o.school_id = helios and o.per_week = case st.plan when 'kids' then 3 else substr(st.plan, 3)::int + 1 end;
        elsif st.plan in ('mobility', 'duet') then
            insert into enrollment (school_id, student_id, class_id, how, starts_on, price)
            select helios, st.person, id, 'monthly', k::date, case key when 'movilidad' then 600 else 1000 end
            from seed_class where key = case st.plan when 'mobility' then 'movilidad' else 'dueto' end;
        end if;
    end loop;

    -- Each student's usual week (their slots), chosen steadily from their number: never two at once.
    create temp table seed_week (student uuid, schedule uuid, odds numeric, kind text) on commit drop;
    for st in select * from seed_student loop
        week_slots := '{}';
        cnt := case when st.plan like 'pk%' then substr(st.plan, 3)::int when st.plan in ('wellhub', 'totalpass') then 2 + st.n % 2
                  when st.plan = 'visit' then 1 else 0 end;
        -- Aerial classes (the advanced ones for packages of 4 and 5).
        for s in
            select sc.* from schedule sc join seed_class cl on cl.id = sc.class_id
            where sc.school_id = helios and (cl.kind = 'aerial' or (cl.kind = 'advanced' and st.plan in ('pk4', 'pk5')))
            order by md5(st.n::text || sc.id::text)::uuid, cl.weight desc
        loop
            exit when cardinality(week_slots) >= cnt;
            if not exists (select 1 from schedule o where o.id = any (week_slots) and (o.weekday = s.weekday)) then
                week_slots := week_slots || s.id;
            end if;
        end loop;
        -- One complementary for packages; the kids' class three times a week; the complementary-only plans.
        if st.plan like 'pk%' then
            week_slots := week_slots || (select sc.id from schedule sc join seed_class cl on cl.id = sc.class_id
                                         where cl.kind in ('mobility', 'duet') and not exists (select 1 from schedule o where o.id = any (week_slots)
                                             and o.weekday = sc.weekday and o.start_time < sc.end_time and sc.start_time < o.end_time)
                                         order by md5(st.n::text || sc.id::text) limit 1);
        elsif st.plan = 'kids' then
            week_slots := array(select sc.id from schedule sc join seed_class cl on cl.id = sc.class_id where cl.key = 'ninos');
        elsif st.plan = 'mobility' then
            week_slots := array(select sc.id from schedule sc join seed_class cl on cl.id = sc.class_id where cl.key = 'movilidad');
        elsif st.plan = 'duet' then
            week_slots := array(select sc.id from schedule sc join seed_class cl on cl.id = sc.class_id where cl.key = 'dueto' and sc.weekday >= 5);
        end if;
        insert into seed_week select st.person, unnest(week_slots),
            case when st.plan in ('wellhub', 'totalpass') then 0.72 when st.plan = 'visit' then 0.4 else 0.87 end, st.plan;
        -- Per-visit and Wellhub/TotalPass students are enrolled per visit in their usual classes.
        if st.plan in ('wellhub', 'totalpass', 'visit') then
            insert into enrollment (school_id, student_id, class_id, how, starts_on, price)
            select distinct helios, st.person, sc.class_id, 'visit'::pay_how, coalesce(st.since, date '2026-06-01'), 290
            from schedule sc where sc.id = any (week_slots);
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
      and (x.starts_at at time zone 'America/Mexico_City')::date >= greatest(history_from, coalesce(ss.since, history_from))
      and (abs(hashtext('came' || w.student::text || x.id::text)) % 1000) / 1000.0 < w.odds;

    -- A guest teacher now and then: Dafne in the advanced class every other week.
    insert into attendance (school_id, session_id, person_id, kind, method, created_by)
    select helios, x.id, (select person from seed_teacher where key = 'dafne'), 'guest_teacher', 'qr', (select person from seed_teacher where key = 'dafne')
    from session x where x.class_id = (select id from seed_class where key = 'avanzados') and x.ends_at < now()
      and x.starts_at >= history_from and extract(week from x.starts_at)::int % 2 = 0 and x.status = 'scheduled';

    -- A substitute in October.
    update session set substitute_id = (select person from seed_teacher where key = 'dafne')
    where id = (select id from session where class_id = (select id from seed_class where key = 'pablo-6')
                and (starts_at at time zone 'America/Mexico_City')::date = '2026-10-21');

    -- Trial classes for the newest students, the week before they joined.
    insert into booking (school_id, student_id, session_id, class_id, kind, price, created_at)
    select distinct on (ss.person) helios, ss.person, x.id, x.class_id, 'trial', 290, x.starts_at - interval '2 days'
    from seed_student ss join session x on x.school_id = helios and x.status = 'scheduled'
         and (x.starts_at at time zone 'America/Mexico_City')::date between ss.since - 6 and ss.since - 1
    join seed_class cl on cl.id = x.class_id and cl.kind = case when ss.plan = 'kids' then 'kids' else 'aerial' end
    where ss.since is not null and x.ends_at < now()
    order by ss.person, x.starts_at;
    insert into attendance (school_id, session_id, person_id, kind, method, created_by, created_at)
    select helios, b.session_id, b.student_id, 'student', 'qr', b.student_id, (select starts_at from session where id = b.session_id)
    from booking b where b.school_id = helios and b.kind = 'trial' on conflict do nothing;

    -- ---- Payments: October and November around each payment day; per class and Wellhub/TotalPass, per visit ----
    insert into payment_proof (id, school_id, student_id, method, covers, enrollment_id, package_id, month, amount, expected, file_path, state, reason,
                               decided_at, created_by, created_at)
    select pid, helios, plan.student, (array['transfer', 'transfer', 'card', 'cash'])[1 + abs(hashtext(plan.id::text || m::text)) % 4]::pay_method,
           'month', plan.enrollment, plan.package, m, plan.price, plan.price,
           format('%s/proofs/%s/%s.jpg', helios, plan.student, pid),
           case when sent < today - 6 then 'confirmed' else 'uploaded' end::proof_state, null,
           case when sent < today - 6 then sent + interval '1 day 10 hours' end, plan.student, sent + interval '13 hours'
    from (select e.student_id as student, e.id, e.id as enrollment, null::uuid as package, e.price, e.starts_on from enrollment e where e.school_id = helios and e.how = 'monthly'
          union all select p.student_id, p.id, null, p.id, p.price, p.starts_on from student_package p where p.school_id = helios) plan
    join membership ms on ms.school_id = helios and ms.person_id = plan.student and ms.role = 'student'
    cross join unnest(array[date '2026-10-01', date '2026-11-01']) m
    cross join lateral (select gen_random_uuid() as pid,
        greatest(plan.starts_on, private.due_day(m, ms.payment_day) + (abs(hashtext(plan.id::text || m::text)) % 10) - 4) as sent) x
    where date_trunc('month', plan.starts_on) <= m and x.sent <= today;

    insert into payment_proof (id, school_id, student_id, method, covers, session_id, amount, expected, file_path, state, decided_at, created_by, created_at)
    select pid, helios, a.person_id,
           case ss.plan when 'wellhub' then 'wellhub' when 'totalpass' then 'totalpass' else 'cash' end::pay_method, 'visit', a.session_id,
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
    where id = (select pp.id from payment_proof pp join seed_student ss on ss.person = pp.student_id where ss.n = 12 and pp.month = '2026-10-01');
    update payment_proof set state = 'rejected', reason = 'El monto no coincide con tu paquete.', amount = 1200
    where id = (select pp.id from payment_proof pp join seed_student ss on ss.person = pp.student_id where ss.n = 20 and pp.month = '2026-11-01');

    -- Registration fees: the newest students paid theirs; the one who joined this week still owes it.
    insert into registration_fee (school_id, student_id, reason, amount, owed_since, done_at)
    select helios, person, 'joined', 660, since, case when n = 24 then null else since + interval '2 days' end
    from seed_student where since is not null and plan not in ('wellhub', 'totalpass', 'visit');

    -- ---- Teacher payments for the closed periods: 16–31 Oct paid and confirmed; 1–15 Nov paid, one to confirm, one to pay ----
    insert into teacher_payment (school_id, teacher_id, period_start, period_end, amount, calculated, paid_on, method, answer, answered_at)
    select helios, tt.person, pr.pfrom, pr.pto, pay.total, pay.total, pr.pto, case tt.key when 'mariana' then 'cash' else 'transfer' end::teacher_payment_method,
           case when pr.pfrom = date '2026-11-01' and tt.key = 'dafne' then null else 'received' end::teacher_payment_answer,
           case when pr.pfrom = date '2026-11-01' and tt.key = 'dafne' then null else pr.pto + interval '1 day' end
    from seed_teacher tt
    cross join (values (date '2026-10-16', date '2026-10-31'), (date '2026-11-01', date '2026-11-15')) pr(pfrom, pto)
    cross join lateral (select coalesce(sum((private.session_pay(x)).amount), 0) as total from session x
                        where x.school_id = helios and coalesce(x.substitute_id, x.teacher_id) = tt.person and x.status = 'scheduled'
                          and (x.starts_at at time zone 'America/Mexico_City')::date between pr.pfrom and pr.pto) pay
    where pay.total > 0 and not (pr.pfrom = date '2026-11-01' and tt.key = 'mariana') and pr.pto < today;

    -- ---- The board ----
    insert into announcement (school_id, class_id, kind, body, visible_until, created_by, created_at) values
        (helios, (select id from seed_class where key = 'dueto'), 'note',
         'El sábado 12 de diciembre presentamos los duetos al final de la clase. Las dos semanas antes ensayamos la secuencia completa; vengan con su pareja.',
         today + 30, (select person from seed_teacher where key = 'pablo'), now() - interval '2 days'),
        (helios, null, 'note', 'Para registrar su clase, traigan la app de Wellhub o TotalPass abierta con el código del día.', today + 30, null, now() - interval '6 days');

    -- The test accounts, when they exist: the director and the teacher get a class each to see.
    update session set teacher_id = (select p.id from person p join auth.users u on u.id = p.user_id where u.email = 'prueba.maestra@example.com')
    where class_id = (select id from seed_class where key = 'mariana') and starts_at > now()
      and exists (select 1 from person p join auth.users u on u.id = p.user_id join membership m on m.person_id = p.id and m.school_id = helios and m.role = 'teacher'
                  where u.email = 'prueba.maestra@example.com');
    update class set teacher_id = (select p.id from person p join auth.users u on u.id = p.user_id where u.email = 'prueba.maestra@example.com')
    where id = (select id from seed_class where key = 'mariana')
      and exists (select 1 from person p join auth.users u on u.id = p.user_id join membership m on m.person_id = p.id and m.school_id = helios and m.role = 'teacher'
                  where u.email = 'prueba.maestra@example.com');

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
    raise notice 'Helios seeded: % students, % sessions, % attendances', (select count(*) from seed_student),
        (select count(*) from session where school_id = helios), (select count(*) from attendance where school_id = helios);
end $seed$;
