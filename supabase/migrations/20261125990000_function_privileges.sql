-- Who may run which function, stated once at the end.
--
-- Postgres lets everyone (PUBLIC) run a new function, and the project's defaults pass that on to the
-- API roles, so the earlier migrations' default-privilege lines didn't hold. The `private` schema isn't
-- exposed by the API, but nothing internal should depend on that alone: here every function loses its
-- default grants, and only the ones the policies call (and the API actions) are granted back.

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- The checks row-level security and the storage policies call, as the signed-in person.
grant execute on function
    private.me(), private.is_platform_admin(), private.is_member(uuid, member_role[]), private.is_director(uuid), private.is_staff(uuid),
    private.acts_for(uuid, uuid, boolean), private.my_schools(), private.valid_time_zone(text), private.can_see_person(uuid),
    private.can_read_card(uuid, uuid), private.family_reader(uuid), private.can_read_staff(uuid), private.can_read_proof(payment_proof),
    private.can_read_announcement(announcement), private.file_readable(text), private.file_uploadable(text)
    to authenticated;

-- Everything else in `private` (deleting a student's data, the check-in codes, the queues, the daily
-- jobs) runs only inside the database: from triggers, from the public functions (as their owner),
-- from pg_cron, or from Edge Functions with the secret key.
