# CLAUDE.md — Art School Management (draft)

An app for art schools: register students and teachers, define classes and their schedules, link
students to the classes they take, and track attendance and payments. Several schools share one app;
each sees only its own people and records. **Draft**: nothing is built yet.

## Words used here

The owner's words, and what they mean in this project. Code uses the English column.

| Owner says | Means | In code |
|---|---|---|
| alumni / alumnos | the school's students (current ones, not graduates) | `student` |
| guardian / tutor | the adult registered with a minor student, who accepts the terms for them | `guardian` |
| assistance / asistencia | being at a class session (a check-in, or a record made for the student) | `attendance` |
| class | an offering a school defines: a weekly slot, or free hours in the school's schedule | `class` |
| time frame | when a class is given: its dates, and each session's start, end and room | `schedule`, `session` |
| linked / assigned | a student taking a class, from one date to another, and how they pay for it | `enrollment` |
| registered / unregistered | enrolled and active in the school, or not (kept, never deleted) | `status: active / inactive` |
| school admin | a director (see Roles) | `director` |
| salon / space | a room where classes are given, named by the school's director | `room` |
| payment screenshot | a student's proof of paying: a screenshot of the receipt or TotalPass token, or a photo of a cash receipt | `payment_proof` |
| monthly plan | paying a class once a month (card, transfer or cash) for up to a set number of sessions | `enrollment.payment: monthly` |
| guest teacher | a teacher attending another teacher's class: not a paying student, counted apart | `attendance.kind: guest_teacher` |

The school's fee to the platform (admin panel) is `billing_payment`; never mix it with `payment_proof`.

## Stack

Same as VetClinicTracker (`../VetClinicTracker`), which is the reference for patterns:

- Vite + React + TypeScript (strict) + `@supabase/supabase-js`. Node / npm.
- Supabase: Postgres with RLS, Auth (a login per person), Storage (a private bucket for payment
  screenshots, each school in its own folder), Edge Functions for anything that needs the service key
  (invites, emails, deleting a school's files).
- Email (invites with the terms PDF, password links) through Resend, from the verified
  `mail.kokoasoft.com`; Supabase Auth's own emails go through Resend's SMTP too.
- Hosted on Render as a static site, on a subdomain of `kokoasoft.com`, behind Cloudflare.
- Never put the secret / service_role key in the app.

## Data model (draft)

- `school`: details, time zone (all session times are read in it), enabled or disabled.
- `membership`: a person's role in a school (director, teacher, student, guardian) and status. One
  person can hold several (a director who teaches is director and teacher).
- `room`: name, optional capacity (classes at once, students in total), archived.
- `class`: its teacher and kind (weekly, or free hours with a number of attendants).
- `schedule`: a weekly class's weekday, start and end time, first and last date, and room.
- `session`: a real row for each time a class is given, with start and end (`timestamptz`), room and
  status (scheduled, moved, cancelled). Generated from the schedule for weekly classes; set one by
  one by the director for free hours. A moved session points at the one it replaces.
- `enrollment`: a student in a class, from one date to another, paying per visit or monthly (with
  the sessions a month the plan covers).
- `attendance`: a session, a person, its kind (student, guest teacher), how it was recorded (QR
  check-in, teacher, director), and who and when, stamped by the database.
- `attendance_log`: every removal or correction by a director, with the old and new values, who
  and when.
- `payment_proof`: a student, the method, the file, and what it covers (one attendance for per-visit
  payers, one month of one enrollment for monthly ones), checked by whom and when.
- `terms_acceptance`: who accepted which version of the school's terms, for which minor, and when.

## Roles

- **Admin** (platform): the owner's account. Runs the **admin panel** (below). Sees schools, their
  directors and usage, never a school's students, teachers' classes, attendance or payments.
- **Director** (school admin): runs one school, and can also teach. Names the school's rooms (and
  their capacity), defines classes, their schedules (with a room) and free hours, moves a session to
  another time frame, invites teachers, registers and unregisters students and their guardians,
  assigns and unassigns students to a class (with how they pay), checks payment screenshots, and is
  the only one who can remove or correct an attendance record.
- **Teacher**: sees the attendance and payment screenshots of their own classes, shows the session's
  check-in QR code, and records a student's attendance up to 1 hour after the session ends (a student
  who came but didn't check in). Can attend another teacher's class as a guest teacher.
- **Student**: has their own login, created from an email invite. Sees the classes they're linked to,
  checks in by scanning the QR code shown in the room, and uploads their payment screenshots.
- **Guardian**: registered with a minor student. Accepts the school's terms and conditions before the
  minor is registered, and sees the minor's classes, attendance and payments.

Every login starts from an **invitation email sent through Resend** (directors by the admin; teachers,
students and guardians by a director): a one-time link to choose a password, also shown to whoever
invited, to send by hand if the email doesn't arrive. The link works once and expires, a new one
cancels the old one, and each one sent is logged.

## Rules

1. **Several schools**: every table carries `school_id`, and RLS keeps each school to its own rows.
   Every policy (tables and storage) goes through one check: an active membership in an enabled
   school.
2. People are registered and unregistered, never deleted: their history stays. Unregistering is
   refused while the person still has future sessions: a teacher's sessions are reassigned first, a
   student's enrollments are ended first. A late payment doesn't unregister a student; the director
   sees it as pending.
3. A class is defined by a director: either a weekly occurrence (e.g. Tuesdays 4–6 pm, September to
   December) or free hours in the school's schedule assigned to a teacher. For free hours the
   director sets the exact times and the number of attendants, and books each student's place; the
   price is fixed by the number of attendants. Teachers don't book them.
4. A student can be linked to several classes and several teachers. Each enrollment says how the
   student pays: per visit (TotalPass or cash) or a monthly plan (card, transfer or cash) for up to a
   number of sessions a month that the director sets.
5. A student can't be in two sessions that overlap (enforced by the database).
6. **Check-in**: a student checks in by scanning the QR code shown in the room, from 10 minutes before
   the session's start up to 30 minutes after it. The code belongs to that session and changes as
   time passes, so a photo of it can't be shared. A database function checks the code, the time
   (the server's clock, in the school's time zone) and that the student is enrolled; students can't
   write attendance any other way.
7. **Attendance by hand**: a teacher can **add** attendance, up to 1 hour after the session ends,
   never remove it. After that, and for removing or correcting one, only the director, and each
   change is kept in `attendance_log`. Every record says who recorded it and when, stamped by the
   database, not sent by the app.
8. Only the admin creates schools and directors; only directors invite teachers, register students
   and their guardians.
9. **Rooms**: each school's director names its rooms (salons, spaces) and can archive them (never
   delete: past classes point at them); a room with future sessions can't be archived until they
   move. Every class schedule says its room: "Teacher A, Tuesdays 7–9 am, Salón 1". Rooms are wide
   spaces, so several classes can share one at overlapping times. Each room has an optional capacity:
   how many classes it holds at once, and how many students in total (enrolled and booked; drop-ins
   can't be foreseen). When a schedule would go over either number, the director sees a warning and
   can still save it. This is the one rule that only warns, by design.
10. **Payment screenshots**: per-visit payers upload one for each session they attend (the TotalPass
   token, or a photo of the cash receipt). Monthly payers upload one per month for each class, covering
   up to the plan's sessions; the app shows how many they've used. The image is compressed on the
   phone and kept in the private bucket under `school/student/`. Only the student, their guardian,
   their class's teacher and the school's director can see it. Uploads are kept, never replaced or
   deleted: a new screenshot is added beside the old one. Only the director marks a screenshot as
   checked (stamped with who and when); for cash, that marks it as paid. These files count toward
   the school's storage in the admin panel.
11. **Minors**: a minor student is registered with a guardian. The guardian's invite email carries
   the school's terms and conditions as a PDF, and the guardian accepts them (a button) before the
   minor's registration is complete. The acceptance records the terms' version, who and when.
12. **Guest teachers**: a teacher attending another teacher's class is recorded as a guest teacher,
   owes no payment and is counted apart from students.
13. **Moving a session**: a session that can't be given (a holiday, a cancellation) is moved by the
   director to another time frame; the original stays, marked as moved.

Enforce these where the data lives (database constraints, RLS, triggers that stamp who and when),
not only in the screens, so a tampered client can't skip them.

## Admin panel (platform admin only)

Modelled on VetClinicTracker's Plataforma (`docs/platform-admin-plan.md` there):

- **Schools**: register a school, assign and change its director (invite by email), edit its details
  (contact, tax details for invoices, notes).
- **Enable / disable a school**: disabled, its people can still pass the sign-in screen but the
  database returns nothing and the app says the school is disabled; its data stays and it can be
  enabled again. Delete only a disabled school, after typing its name; its files go with it.
- **Payments** (`billing_payment`): a monthly fee per school, a billing day and an optional trial end
  date; payments recorded by hand (amount, date, month paid, method, who paid), never edited,
  corrected with a negative entry. Shows who is up to date, due soon or overdue.
- **Usage per school**: storage in MB against the plan's limit, number of students, teachers and
  classes, check-ins in the last 30 days, last activity. Counts only, no records.
- **Calendar**: payments due and received, trial ends, disables, and the admin's own reminders, beside
  an upcoming and overdue list.
- **Log**: every admin action with who and when, kept even after a school is deleted (it keeps the
  school's name, not a link to it).
- Each school's director can download the school's own data (export), since the admin can't see it.
  Each export is logged.

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

- **Cash notification**: when the director marks cash as paid, the student should be told the payment
  was saved. In the app, by email through Resend, or both? Only for cash, or for any checked
  screenshot?
- **QR code**: shown on the teacher's phone (changes every few seconds, no extra device) or printed
  per room (simpler, but a photo of it can be shared)?
- **Minors**: does the minor have a login and scan the QR, or does the guardian check in for them?
  Whose terms: each school's own PDF (uploaded by the director) or one for the whole platform? Do
  adult students accept terms too?
- **Monthly plan**: when a student goes over the plan's sessions in a month, warn the director or
  refuse the check-in?
- **Free hours**: should the app record prices (it records none today), or only the number of
  attendants? Can a student ask for a place in the app, or only through the director?
- **Schools and directors**: can one person belong to two schools? Can a school have more than one
  director? (The model allows both.)
- **Substitute teacher**: can a session be given by another teacher without moving it?
