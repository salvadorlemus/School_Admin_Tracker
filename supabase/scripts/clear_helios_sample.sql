-- Clears Helios's invented data before the school starts using Lyra for real. Run by hand in
-- Supabase → SQL Editor (not a migration), once, when the owner decides.
--
-- Goes: the 50 invented students and their guardians (people without a login), and every record of
-- the sample history at Helios: attendance, payment screenshots (their files are queued for
-- deletion), registration fees, enrollments, packages taken, bookings, teacher payments, notices,
-- personal notifications, change logs, and the sessions before today.
--
-- Stays: the school, its room, classes, weekly schedule and sessions from today on, prices, package
-- offers, the teacher pay rule, the terms, and the teachers (placeholders without a login: invite
-- each real teacher from Teachers, then give them their classes with "change the teacher").
-- The test accounts (prueba.*) stay as people with logins; their history at Helios goes too.
--
-- Runs as the database owner, so it can remove history the app itself never deletes.

do $clear$
declare
    helios uuid := (select id from school where name = 'Helios');
    today date;
    invented uuid[];
begin
    if helios is null then
        raise notice 'There is no school named Helios: nothing to clear';
        return;
    end if;
    today := private.school_today(helios);

    -- The invented people: students and guardians at Helios with no login and no other school.
    select coalesce(array_agg(distinct p.id), '{}') into invented
    from person p join membership m on m.person_id = p.id
    where m.school_id = helios and m.role in ('student', 'guardian') and p.user_id is null
      and not exists (select 1 from membership o where o.person_id = p.id and o.school_id <> helios);

    -- Their files and the screenshots' files go through the deletion queue (the worker removes them from the bucket).
    insert into file_deletion (path)
    select file_path from payment_proof where school_id = helios and file_path is not null
    union select photo_path from student_card where school_id = helios and student_id = any (invented) and photo_path is not null
    on conflict do nothing;

    -- ---- The sample history ----
    delete from attendance_log where school_id = helios;
    delete from attendance where school_id = helios;
    delete from payment_proof where school_id = helios;
    delete from registration_fee where school_id = helios;
    delete from booking where school_id = helios;
    delete from enrollment where school_id = helios;
    delete from student_package where school_id = helios;
    delete from teacher_payment where school_id = helios;
    delete from announcement where school_id = helios;
    delete from notification where school_id = helios;
    delete from student_card_log where school_id = helios;
    delete from session_log where school_id = helios;
    delete from reminder_sent where school_id = helios;
    -- Sessions before today (and the replacements that point at them) leave; the ones from today on stay.
    update session set replaces_id = null where school_id = helios and replaces_id in
        (select id from session where school_id = helios and (starts_at at time zone (select time_zone from school where id = helios))::date < today);
    delete from session where school_id = helios and (starts_at at time zone (select time_zone from school where id = helios))::date < today;

    -- ---- The invented people ----
    delete from terms_acceptance where school_id = helios and student_id = any (invented);
    delete from emergency_contact where card_id in (select id from student_card where school_id = helios and student_id = any (invented));
    delete from student_card where school_id = helios and student_id = any (invented);
    delete from family_person_child where family_person_id in (select id from family_person where school_id = helios and guardian_id = any (invented));
    delete from family_person where school_id = helios and guardian_id = any (invented);
    delete from guardian_link where school_id = helios and (guardian_id = any (invented) or student_id = any (invented));
    delete from membership where school_id = helios and person_id = any (invented);
    delete from person where id = any (invented);

    raise notice 'Helios cleared: % invented people removed; % classes and % sessions ahead kept',
        coalesce(array_length(invented, 1), 0), (select count(*) from class where school_id = helios),
        (select count(*) from session where school_id = helios);
end $clear$;
