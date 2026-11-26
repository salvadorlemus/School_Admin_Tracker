# Test accounts

Logins for trying Lyra on the online Supabase project (`lyra`, `qkiipoxjexofqtmuyjap`). The emails
for the platform admin and the director are the same ones VetClinicTracker uses for its platform admin
and its clinic admin; the teacher, student and guardian are Lyra's own. They're separate logins in each project: same email, separate passwords, separate data.

| Email | Role in Lyra | Password variable |
|---|---|---|
| `prueba.plataforma@example.com` | Platform admin (the admin panel) | `TEST_PLATFORM_PASSWORD` |
| `prueba.admin@example.com` | Director of Helios (also holds the teacher role) | `TEST_ADMIN_PASSWORD` |
| `prueba.maestra@example.com` | Teacher at Helios | `TEST_TEACHER_PASSWORD` |
| `prueba.alumna@example.com` | Adult student at Helios (pays on the 15th) | `TEST_STUDENT_PASSWORD` |
| `prueba.tutor@example.com` | Guardian at Helios, of "Prueba Niña" (a minor with no login, pays on the 30th) | `TEST_TUTOR_PASSWORD` |

**Passwords:** in `.env.test.local` at the project root. It's ignored by git (`*.local`), so each computer
keeps its own copy. `TEST_PLATFORM_PASSWORD` and `TEST_ADMIN_PASSWORD` can be the same values as in
VetClinicTracker's `.env.test.local`; the other three are new.

The student and the guardian start as **invited**, like anyone a director registers: their first
sign-in walks through the card and the terms, which makes them active. Helios gets a stand-in terms
version 1 so students can be registered; the director uploads the real PDF from Terms.

`example.com` never receives mail, so these accounts are created by hand instead of by invitation.
Real people (Helios's staff and students) are invited by email from the app.

## Creating them (once)

1. Fill in the five passwords in `.env.test.local`.
2. Supabase dashboard → **Authentication → Users → Add user → Create new user**, once per email in the
   table, with its password and **Auto Confirm User** on.
3. Supabase dashboard → **SQL Editor → New query**: paste `supabase/scripts/test_users.sql`, click
   **Run**. It makes the platform admin, creates the school Helios with its director, the teacher, the
   student and the guardian with their child, and lists what it set up. Running it again changes nothing.

## Changing a password

Authentication → Users → the account's **⋯** → **Reset password** sends an email, which example.com
never receives. Instead, delete the user, create it again with the new password (step 2), and run the
script again (step 3). Then update `.env.test.local`.
