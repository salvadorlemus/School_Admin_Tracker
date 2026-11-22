# CLAUDE.md — Art School Management (draft)

An app for art schools: register students and teachers, define classes and their schedules, link
students to the classes they take, and track attendance and payments. Several schools share one app;
each sees only its own people and records. **Draft**: nothing is built yet.

## Words used here

The owner's words, and what they mean in this project. Code uses the English column; English screens
use the words in brackets, not the owner's.

| Owner says | Means | In code |
|---|---|---|
| alumni / alumnos | the school's students (current ones, not graduates) | `student` |
| guardian / tutor | the adult registered with a minor student, who signs in and acts for them | `guardian` |
| assistance / asistencia | being at a class session ["attendance"] | `attendance` |
| class | an offering a school defines: a weekly slot, or free hours in the school's schedule | `class` |
| time frame | when a class is given: its dates, and each session's start, end and room | `schedule`, `session` |
| linked / assigned | a student taking a class, from one date to another, and how they pay for it | `enrollment` |
| registered / unregistered | a person's place in a school: invited, active, or inactive (kept) | `membership.status` |
| school admin | a director (see Roles) | `director` |
| salon / space | a room where classes are given, named by the school's director | `room` |
| payment screenshot | a student's proof of paying: a screenshot of the receipt or TotalPass token, or a photo of a cash receipt | `payment_proof` |
| monthly plan | paying a class once a calendar month (card, transfer or cash) for up to a set number of sessions | `enrollment.payment: monthly` |
| inscription fee | the fee to join the school, owed again after a set number of months without paying ["registration fee"] | `registration_fee` |
| guest teacher | a teacher attending another teacher's class: not a paying student, counted apart | `attendance.kind: guest_teacher` |
| substitute | a teacher giving a session in place of the class's teacher, without moving it | `session.substitute_id` |
| student card | a student's file at a school: photo, name, age, emergency contacts, health conditions | `student_card` |
| physical affections | known health conditions a teacher should know of ["health conditions"] | `student_card.health_notes` |
| authorized person | an adult allowed to pick a minor up from school (name and photo) | `authorized_pickup` |
| payment day | the day a student's monthly plans are due: the 15th or the 30th | `membership.payment_day` |

The school's fee to the platform (admin panel) is `billing_payment`; never mix it with `payment_proof`.
Each school's finances (payment screenshots, registration fees, prices) are its own: nothing about a
student's payments at one school counts at, or is visible to, another.

## Stack

Same as VetClinicTracker (`../VetClinicTracker`), which is the reference for patterns:

- Vite + React + TypeScript (strict) + `@supabase/supabase-js`. Node / npm.
- `pdfjs-dist` (approved) for the in-app terms reader, which must know when the last page is reached.
- Supabase: Postgres with RLS, Auth (a login per person), Storage (a private bucket for payment
  screenshots, card photos and terms PDFs), Edge Functions for anything that needs the service key
  (invites, emails, data deletion, deleting a school's files), `pg_cron` for reminders.
- Email (invites with the terms PDF, payment emails, deletion links, password links) through Resend,
  from the verified `mail.kokoasoft.com`; Supabase Auth's own emails go through Resend's SMTP too.
- Hosted on Render as a static site, on a subdomain of `kokoasoft.com`, behind Cloudflare.
- Never put the secret / service_role key in the app.

## Data model (draft)

Every school-owned table carries `school_id`. `person` is shared by all the schools a person belongs
to; the platform tables (`billing_payment`, the admin log) belong to the admin.

- `school`: details, time zone, enabled or disabled, and the number of months without paying after
  which a student owes the registration fee again.
- `person`: the login (email) and the person's own name and phone, which only they can edit. A minor
  student is a `person` with no login; their guardian signs in for them.
- `membership`: a person's role in a school (director, teacher, student, guardian) and status
  (invited, active, inactive). One person can hold several, in several schools (a director who
  teaches is director and teacher; a student can take classes in two schools). A student's
  membership also holds whether they're a minor (set by the director) and their payment day.
- `guardian_link`: which minors a guardian answers for, in a school (a guardian can have several).
- `student_card`: per student per school: photo, name, birth date (the age is calculated, never
  stored), health conditions, active or deactivated, and the "everything I wrote is true"
  declaration (who and when). With `emergency_contact` (name, phone) and, for minors,
  `authorized_pickup` (name, photo). Every change is kept in `student_card_log` (what changed, who,
  when), which only the school's directors read.
- `terms`: each school's terms PDF, with a version; a new upload is a new version, never a replacement.
- `terms_acceptance`: the school, the terms' version, the student it's for, who accepted, and when.
- `room`: name, optional capacity (classes at once, students in total), archived.
- `class`: its teacher and kind (weekly, or free hours with a maximum number of attendants).
- `schedule`: a weekly class's weekday, start and end time, first and last date, and room.
- `session`: a real row for each time a class is given, with start and end (`timestamptz`), room,
  status (scheduled, moved, cancelled) and an optional substitute teacher. Generated from the schedule
  for weekly classes (in the school's time zone); set one by one by the director for free hours. A
  moved session points at the one it replaces. Editing a schedule regenerates its future sessions
  that have no attendance yet; past sessions never change.
- `session_secret`: the secret each session's check-in QR is made from, in its own table so students
  can never read it.
- `session_log`: every move, cancellation and substitute change: what changed, who, when.
- `enrollment`: a student in a weekly class, from one date to another, paying per visit or monthly
  (with the sessions a month the plan covers), and the price it was created with.
- `booking`: a student's place in a free-hours session, booked by the director, with the price it
  was booked at.
- `price`: what it prices (the registration fee, a monthly plan, free hours per student by number of
  attendants), the amount, and from when. The director adds a new row to change a price, never edits
  one: new enrollments and bookings take the latest, and old ones keep theirs.
- `attendance`: a session, the person who attended (the child, for a minor), its kind (student,
  guest teacher), how it was recorded (QR check-in, teacher, director), whether the student's terms
  were pending, and who recorded it and when, stamped by the database.
- `attendance_log`: every removal or correction by a director, with the old and new values, who
  and when.
- `payment_proof`: a student, the method, the file, what it covers (one attendance for per-visit
  payers, one calendar month of one enrollment for monthly ones, or the registration fee), and its
  state: uploaded, confirmed or rejected by a director (who and when).
- `registration_fee`: a fee a student owes a school (on joining, or again after months without
  paying), owed until the director marks it as done (who and when).
- `notification`: an in-app notice for a person (what it's about, read or not). Payment notices are
  also emailed. Reminders are created by a `pg_cron` job and emailed by an Edge Function; each
  reminder is sent once.

## Roles

- **Admin** (platform): the owner's account. Runs the **admin panel** (below). Sees schools, their
  directors and usage, never a school's students, teachers' classes, attendance, payments or cards.
- **Director** (school admin): runs a school (a school can have several directors), and can also
  teach. Names the school's rooms (and their capacity), defines classes, their schedules (with a room)
  and free hours, sets and updates prices, uploads the terms, moves or cancels a session or gives it
  to a substitute, invites teachers, registers students (marking minors) and their guardians,
  deactivates or deletes a student from the school, assigns and unassigns students to a class (with
  how they pay), confirms or rejects payment screenshots, and is the only one who can remove or
  correct an attendance record.
- **Teacher**: sees the attendance and payment screenshots of their own classes, and the cards of
  their classes' current students (a substitute: those of the session they give, on its day). Shows
  the session's check-in QR on their phone (so does a substitute, for their session), and records a
  student's attendance up to 1 hour after the session ends. Can attend another teacher's class as a
  guest teacher.
- **Student**: an adult student has their own login. Sees the classes they're linked to, checks in by
  scanning the teacher's QR, uploads their payment screenshots, fills in and edits their card, and
  gets their notifications. A minor student has no login.
- **Guardian**: registered with one or more minor students; is obliged to do every step for them
  (filling in the card, accepting the terms, checking in with their own phone, uploading
  screenshots), and receives their notifications and emails.

### Signing in

- **One sign-in screen for everyone**, at one address: email and password. A person has one login,
  however many schools they belong to.
- **Students and guardians never choose a school.** After signing in they see the classes, payments
  and notices of all their schools together, each labelled with its school. Check-in needs no choice
  either: the scanned QR belongs to one session, which belongs to one class, teacher and school.
- **Directors and teachers in several schools** switch between them from a menu, since everything
  they do is for one school at a time.

### Invitations

- Every login starts from an **invitation email sent through Resend** (directors by the admin;
  teachers, students and guardians by a director). It opens a page with a button to continue (so a
  mail scanner opening the link doesn't use it up), then the person chooses a password.
- The link works once and expires after 24 hours; a new one cancels the old one; each one sent is
  logged. For a brand-new person's first invite only, the link is also shown to whoever invited, to
  send by hand if the email doesn't arrive. It's never shown for a person who already has a login.
- A director can register a student who already studies at another school: the same person gets a
  membership in the new school, with no second login, and an email saying they were added. The
  director sees the same answer whether the person was new or not, and learns nothing about the
  other school.
- A director can't register students until the school has uploaded its terms.

## Rules

1. **Several schools**: RLS keeps each school to its own rows. Every policy (tables and storage)
   goes through one check: an active membership in an enabled school. An invited person can read
   only their school's latest terms and their own card (or their minors'), until registration is
   complete.
2. People are registered and unregistered (inactive), not deleted: their history stays. Unregistering
   is refused while the person still has future sessions: a teacher's sessions are reassigned first, a
   student's enrollments are ended first. A late payment doesn't unregister a student; the director
   sees it as pending. Deleting a student's data is a separate, deliberate step (rule 20).
3. A class is defined by a director: either a weekly occurrence (e.g. Tuesdays 4–6 pm, September to
   December) or free hours in the school's schedule assigned to a teacher. For free hours the
   director sets the exact times and the maximum number of attendants, and books each student's
   place; the price is per student, by the number of attendants (from `price`). Teachers don't book.
4. A student can be linked to several classes and several teachers. Each enrollment says how the
   student pays: per visit (TotalPass or cash) or a monthly plan (card, transfer or cash) for up to a
   number of sessions per calendar month that the director sets. Going over the plan never stops a
   student from attending: the director, the teacher and the student are notified.
5. Within one school, a student can't be in two sessions that overlap: a trigger refuses it when an
   enrollment or booking is saved, or a session moved. Other schools are never looked at.
6. **Check-in**: one QR per session, never one per student. The teacher (or substitute) opens the
   session on their phone and the app shows its QR, which changes every 30 seconds (a code made from
   the session's secret and the current time, served only to that session's teacher, substitute and
   the school's directors). Each student scans it with their own phone, signed in; a guardian picks
   which of their minors are there (siblings can check in together). From 10 minutes before the
   session's start up to 30 minutes after it, a database function checks the code against the
   server's clock (accepting the previous code too), the time window, that the student is enrolled
   or booked, and that they've accepted the school's latest terms, then records the attendance for
   the student, recorded by whoever scanned. An active teacher of the same school scanning is
   recorded as a guest teacher. Nobody can write attendance any other way.
7. **Attendance by hand**: a teacher can **add** attendance, up to 1 hour after the session ends,
   never remove it. After that, and for removing or correcting one, only the director, and each
   change is kept in `attendance_log`. Every record says who recorded it and when, stamped by the
   database, not sent by the app. A student whose terms are pending can still be recorded by hand;
   the record is flagged "terms pending".
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
   token, or a photo of the cash receipt). Monthly payers upload one per calendar month for each
   class, covering up to the plan's sessions; the app shows how many they've used. The image is
   compressed on the phone and kept in the private bucket. Only the student, their guardian, their
   class's teacher and the school's directors can see it. Uploads are kept, never replaced or
   deleted: a new screenshot is added beside the old one. A director confirms (payment received) or
   rejects each one, for every method, stamped with who and when. When a cash payment is confirmed,
   the student gets a notice that the payment was saved; a rejected one is notified too. These files
   count toward the school's storage in the admin panel.
11. **Payment notices**: every notice about a student's payments (cash saved, a rejected screenshot,
   going over the monthly plan, registration fee owed, payment reminders) is shown in the app and
   also emailed to the student, or to the guardian for a minor. Emails never include card or health
   content. Notices to directors and teachers are in the app only.
12. **Payment day**: when registering a student, the director picks their payment day from a list:
   the 15th or the 30th (in February, its last day). Each calendar month's monthly plans at that
   school are due that day, and reminded automatically 5 days before, 1 day before and on the day,
   unless a screenshot for that month has been uploaded. The reminder job uses each school's own
   date (its time zone) and skips disabled schools and inactive memberships. Per-visit payers
   (TotalPass, cash) get no reminders: they come when they choose, so there's nothing to be due.
13. **Terms and conditions**: each school's director uploads its terms PDF (only directors can).
   Every student's invite (or the email saying they were added to a new school) carries that
   school's PDF. The student (the guardian, for a minor) reads it in a PDF reader inside the app; the
   "Accept" button only turns on once they reach the last page. Each acceptance records the school,
   the version, the student, who and when. When the director uploads new terms, every current
   student is notified and must accept the new version the same way. Until a student has accepted
   their school's latest terms, they can't use the app for that school or check in to its classes
   (a teacher can still record them by hand, flagged, rule 7). The terms ask for express consent to
   keep the card's health data (sensitive data under Mexico's LFPDPPP), and the acceptance is the
   record of it.
14. **Registration** is complete, and the membership turns active, once the student (or guardian)
   has filled in the card and accepted the terms.
15. **Registration fee**: a new student owes it. A student who goes the school's set number of
   calendar months with no payment screenshot covering them (uploaded and not rejected) owes it
   again, and is notified; months without any enrollment don't count. It never blocks attendance:
   it stays marked as owed until the director checks it as done.
16. **Guest teachers**: a teacher attending another teacher's class is recorded as a guest teacher,
   owes no payment and is counted apart from students.
17. **Moving, cancelling, substitutes**: a session that can't be given (a holiday) is moved by the
   director to another time frame; the original stays, marked as moved. A director can also give a
   session to another teacher without moving it. Each change is kept in `session_log`, and the
   teacher's and director's calendar shows a substituted session in a different colour.
18. **Student card**: a new student fills in their card on the registration page reached from the
   invite (the guardian, for a minor): photo, name, birth date (the card shows the age, calculated),
   emergency contacts (name and phone), and known health conditions. A minor's card also lists the
   authorized people who can pick them up (name and photo), and the guardian declares they have
   those people's consent to share their photo. The page ends with a required "I declare that
   everything I wrote here is true" box, recorded with who and when. Photos are compressed on the
   phone and kept in the private bucket. The student (or guardian) can edit the card at any time;
   each change is logged and the school's directors are notified. A card is never copied from one
   school to another: a student in two schools fills in each.
19. **Who sees a card**: the student (or guardian), the school's directors, and the teachers of the
   classes the student is currently enrolled in (a substitute, on the day of the session they give).
   Access ends when the enrollment ends, or the teacher or student becomes inactive. On the card,
   each emergency contact's phone is a link that calls it (`tel:`). Cards hold health data, so the
   admin never sees them and they never cross to another school.
20. **Deactivating and deleting a student**: a director can deactivate a student's card (the student
   becomes inactive and the card is hidden from teachers), or delete the student from the school.
   Deleting removes that school's card, photos, contacts, health conditions, pickup people and
   payment screenshots; their attendance and payment records stay, with no name, so the school's
   counts stay right. A student (or guardian) can ask the app to delete their data from a school:
   the app emails them a link, which opens a confirmation panel saying what will be deleted, and
   confirming does the same as a director's delete. A person left with no school has their login
   deleted too.

Enforce these where the data lives (database constraints, RLS, triggers that stamp who and when),
not only in the screens, so a tampered client can't skip them.

## Storage

- One private bucket. Paths use ids, never names, with a prefix per kind:
  `{school_id}/proofs/{student_id}/{proof_id}.jpg`, `{school_id}/cards/{student_id}/{file_id}.jpg`,
  `{school_id}/terms/{terms_id}.pdf`.
- Policies check the matching row (`payment_proof`, `student_card`, `terms`), not the folder name
  alone. Only the owner uploads; no one replaces a file. Files are removed only by a delete (rule 20)
  or a school's deletion, through an Edge Function.

## Admin panel (platform admin only)

Modelled on VetClinicTracker's Plataforma (`docs/platform-admin-plan.md` there):

- **Schools**: register a school, assign and change its directors (invite by email), edit its details
  (contact, tax details for invoices, notes).
- **Enable / disable a school**: disabled, its people can still pass the sign-in screen but the
  database returns nothing and the app says the school is disabled; its data stays and it can be
  enabled again. Delete only a disabled school, after typing its name; its files go with it, and so
  do the logins of people who belonged to no other school.
- **Payments** (`billing_payment`): a monthly fee per school, a billing day and an optional trial end
  date; payments recorded by hand (amount, date, month paid, method, who paid), never edited,
  corrected with a negative entry. Shows who is up to date, due soon or overdue.
- **Usage per school**: storage in MB against the plan's limit, number of students, teachers and
  classes, check-ins in the last 30 days, last activity. Counts only, no records.
- **Calendar**: payments due and received, trial ends, disables, and the admin's own reminders, beside
  an upcoming and overdue list.
- **Log**: every admin action with who and when, kept even after a school is deleted (it keeps the
  school's name, not a link to it).
- **Export**: each school's director can download the school's own data, since the admin can't see
  it. It holds only that school's memberships and records, never a person's other schools. Health
  data and photos are included only after a separate confirmation. Each export is logged.

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

- **Turning 18**: when the director unmarks a minor, does the student get their own login invite,
  and does the guardian keep access?
- **Joining mid-month**: a monthly plan that starts after the payment day: is the first month due
  in full, or does it start the next month?
- **Cancelling**: can a director cancel a session without moving it (the status exists), and are its
  students notified?
- **Keeping cards**: after a student is unregistered but not deleted, how long are their card and
  photos kept?
