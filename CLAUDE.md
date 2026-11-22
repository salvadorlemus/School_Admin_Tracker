# CLAUDE.md — Art School Management (draft)

An app for art schools: register students and teachers, define classes and their schedules, link
students to the classes they take, and track attendance. Several schools share one app; each sees
only its own people and records. **Draft**: nothing is built yet.

## Words used here

The owner's words, and what they mean in this project. Code uses the English column.

| Owner says | Means | In code |
|---|---|---|
| alumni / alumnos | the school's students (current ones, not graduates) | `student` |
| assistance / asistencia | attendance at a class session | `attendance` |
| class | an offering a school defines: a weekly slot, or free hours in the school's schedule | `class` |
| time frame | when a teacher gives a class to a student: dates, and each session's start and end | `schedule`, `session` |
| registered / unregistered | enrolled and active in the school, or not (kept, never deleted) | `status: active / inactive` |
| school admin | a director (see Roles) | `director` |

## Stack

Same as VetClinicTracker (`../VetClinicTracker`), which is the reference for patterns:

- Vite + React + TypeScript (strict) + `@supabase/supabase-js`. Node / npm.
- Supabase: Postgres with RLS, Auth (a login per person), Storage if photos are needed, Edge Functions
  for anything that needs the service key (invites).
- Email (invites, password links) through Resend, from the verified `mail.kokoasoft.com`.
- Hosted on Render as a static site, on a subdomain of `kokoasoft.com`, behind Cloudflare.
- Never put the secret / service_role key in the app.

## Roles

- **Admin** (platform): the owner's account. Runs the **admin panel** (below). Sees schools, their
  directors and usage, never a school's students, teachers' classes or attendance.
- **Director** (school admin): runs one school. Defines classes and their schedules, invites teachers,
  registers and unregisters students, assigns and unassigns students to a teacher's class, and is the
  only one who can remove or correct an attendance record.
- **Teacher**: sees the attendance of their own classes, and records a student's attendance after the
  check-in window (a student who came but didn't check in, or checked in late).
- **Student**: has their own login, created from an email invite. Sees the classes they're linked to
  and checks in to a session.

Every login starts from an **invitation email sent through Resend** (directors by the admin; teachers
and students by a director): a one-time link to choose a password, also shown to whoever invited, to
send by hand if the email doesn't arrive.

## Rules

1. **Several schools**: every table carries `school_id`, and RLS keeps each school to its own rows.
2. Students and teachers are registered and unregistered, never deleted: their history stays.
3. A class is defined by a director: either a weekly occurrence (e.g. Tuesdays 4–6 pm, September to
   December) or free hours in the school's schedule assigned to a teacher. Only the director sets
   the free hours and their exact times; teachers don't book them.
4. A student can be linked to several classes and several teachers.
5. A teacher can't have the same student twice in the same (overlapping) time frame.
6. A student checks in to a session themselves, from the session's start up to 30 minutes after it.
   After that only the teacher can record it.
7. A teacher can **add** attendance, never remove it. Removing or correcting one is for a director.
   Every record says who recorded it and when (the student, or the teacher on their behalf).
8. Only the admin creates schools and directors; only directors invite teachers and register students.

Enforce these where the data lives (database constraints, RLS, triggers that stamp who and when),
not only in the screens, so a tampered client can't skip them.

## Admin panel (platform admin only)

Modelled on VetClinicTracker's Plataforma (`docs/platform-admin-plan.md` there):

- **Schools**: register a school, assign and change its director (invite by email), edit its details
  (contact, tax details for invoices, notes).
- **Enable / disable a school**: disabled, nobody from it can sign in or read anything (the database
  enforces it); its data stays and it can be enabled again. Delete only a disabled school, after typing
  its name.
- **Payments**: a monthly fee per school, a billing day and an optional trial end date; payments
  recorded by hand (amount, date, month paid, method, who paid), never edited, corrected with a
  negative entry. Shows who is up to date, due soon or overdue.
- **Usage per school**: storage in MB against the plan's limit, number of students, teachers and
  classes, check-ins in the last 30 days, last activity. Counts only, no records.
- **Calendar**: payments due and received, trial ends, disables, and the admin's own reminders, beside
  an upcoming and overdue list.
- **Log**: every admin action with who and when, kept even after a school is deleted.
- Each school's director can download the school's own data (export), since the admin can't see it.

## Copy

- The app is in **Spanish and English**. Every static text lives in a translation file per language,
  reached through one `t('key')` helper; never write user-facing text straight into a component.
- Code, identifiers and comments in English.
- Texts say what really happens: don't promise an email or a notification that doesn't exist.

## Working conventions

- Keep TypeScript strict: no `any`, no `@ts-ignore`.
- No new dependencies without asking first.
- A new migration changes production: the owner approves each push. Never edit a migration that has run.
- New tables and functions need explicit grants (start from no privileges, as VetClinicTracker does).
- Interactive elements are real buttons and inputs (keyboard and focus), and the layout works on phones.
- IDE: JetBrains Rider; keep the project openable as a plain folder, and don't commit editor files.

## Open questions

- **Early check-in**: can a student check in a few minutes before the session starts (e.g. from
  10 minutes before), or only from the start time? Either way it closes 30 minutes after the start.
