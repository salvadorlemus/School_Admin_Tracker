# Test accounts

Logins for trying Lyra on the online Supabase project (`lyra`, `qkiipoxjexofqtmuyjap`). They use
Kokoasoft's own domain, `kokoasoft.com`, with a `prueba.` prefix so they never clash with a real address
(`admin@`, `privacy@`… in `docs/kokoasoft-emails.md`). Another Kokoasoft app can use the same emails:
each Supabase project keeps its own logins, passwords and data.

| Email | Role in Lyra | Password variable |
|---|---|---|
| `prueba.plataforma@kokoasoft.com` | Platform admin (the admin panel) | `TEST_PLATFORM_PASSWORD` |
| `prueba.admin@kokoasoft.com` | Director of Helios (also holds the teacher role) | `TEST_ADMIN_PASSWORD` |
| `prueba.maestra@kokoasoft.com` | Teacher at Helios | `TEST_TEACHER_PASSWORD` |
| `prueba.alumna@kokoasoft.com` | Adult student at Helios (pays on the 15th) | `TEST_STUDENT_PASSWORD` |
| `prueba.tutor@kokoasoft.com` | Guardian at Helios, of "Prueba Niña" (a minor with no login, pays on the 30th) | `TEST_TUTOR_PASSWORD` |

**Passwords:** in `.env.test.local` at the project root. It's ignored by git (`*.local`), so each computer
keeps its own copy. `TEST_PLATFORM_PASSWORD` and `TEST_ADMIN_PASSWORD` can be the same values as in
VetClinicTracker's `.env.test.local`; the other three are new.

The student and the guardian start as **invited**, like anyone a director registers: their first
sign-in walks through the card and the terms, which makes them active. Helios gets a stand-in terms
version 1 so students can be registered; the director uploads the real PDF from Terms.

The `prueba.` addresses have no mailbox: Cloudflare Email Routing only forwards the addresses in use and
its catch-all stays off (`docs/kokoasoft-email-setup.md`), so mail sent to them is dropped. That's why
these accounts are created by hand instead of by invitation. Real people (Helios's staff and students)
are invited by email from the app. If a test ever needs to receive mail (an invitation, a password
link), add a routing rule for that one address in Cloudflare, and remove it afterwards.

## Creating them (once)

1. Fill in the five passwords in `.env.test.local`.
2. Supabase dashboard → **Authentication → Users → Add user → Create new user**, once per email in the
   table, with its password and **Auto Confirm User** on.
3. Supabase dashboard → **SQL Editor → New query**: paste `supabase/scripts/test_users.sql`, click
   **Run**. It makes the platform admin, creates the school Helios with its director, the teacher, the
   student and the guardian with their child, and lists what it set up. Running it again changes nothing.

## Helios's sample data

The director and the teacher see Helios's invented students and their history. Three scripts, each
pasted into **SQL Editor** and run by hand:

| Script | What it does |
|---|---|
| `supabase/seed.sql` | An empty Helios (no classes): its whole setup (room, teachers, week, prices, packages, teacher pay) plus 50 students and two months of history |
| `supabase/scripts/helios_sample.sql` | A Helios that has its setup but no students: the 50 students and the last two months of history, dated back from the day it runs |
| `supabase/scripts/clear_helios_sample.sql` | Removes the invented students and all the history; keeps the setup and the sessions ahead |

To refresh the history (for example a month later, so it reaches today), run `clear_helios_sample.sql`
and then `helios_sample.sql`. Each script says in its result what it did, or which one to run instead.
Before Helios starts using Lyra for real, run `clear_helios_sample.sql` once.

## Changing a password

Authentication → Users → the account's **⋯** → **Reset password** sends an email, which the `prueba.`
addresses never receive. Instead, delete the user, create it again with the new password (step 2), and run the
script again (step 3). Then update `.env.test.local`.

## Moving from `@example.com` (once)

The accounts were first made as `prueba.…@example.com`. To keep them (and everything already recorded
for them) under the new emails, run this once in **SQL Editor**, then sign in with the new email and
the same password:

```sql
update auth.users set email = replace(email, '@example.com', '@kokoasoft.com')
where email like 'prueba.%@example.com';
update auth.identities set identity_data = jsonb_set(identity_data, '{email}',
    to_jsonb(replace(identity_data->>'email', '@example.com', '@kokoasoft.com')))
where provider = 'email' and identity_data->>'email' like 'prueba.%@example.com';
```
