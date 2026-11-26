# CLAUDE.md — Lyra (art school management)

**Lyra** (`lyra.kokoasoft.com`) is an app for art schools, starting with aerial dance studios (silks,
hoop, trapeze, pole): register students and teachers, define classes and their schedules, link
students to the classes they take, and track attendance and payments. Several schools share one app;
each sees only its own people and records. **Status (v1.0.0)**: every screen is built as a clickable
prototype with invented data (`src/mock/`); the Supabase database, auth, storage and emails are
not built yet. The data model and rules below are what the backend must implement.

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
| linked / assigned | a student taking a class, from one date to another, and how they pay for it (the student chooses it) | `enrollment` |
| test class | a single class a student books once per class to try it, at the school's trial price ["trial class"] | `booking.kind: trial` |
| registered / unregistered | a person's place in a school: invited, active, or inactive (kept) | `membership.status` |
| school admin | a director (see Roles) | `director` |
| salon / space | a room where classes are given, named by the school's director | `room` |
| payment screenshot | a student's proof of paying: a screenshot of the receipt or TotalPass token, or a photo of a cash receipt | `payment_proof` |
| monthly plan | paying a class once a calendar month (card, transfer or cash) for up to a set number of sessions | `enrollment.payment: monthly` |
| package | paying once a calendar month for up to X sessions a week, at whichever of a set of classes the student chooses | `package` |
| notices board | the screen in the app where schedule and price changes, and staff notes, are posted ["Notices"] | `announcement` |
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
- Hosted on Render as one static site with two addresses (Cloudflare CNAMEs to Render), as in
  VetClinicTracker: the app at `lyra.kokoasoft.com` and the platform admin panel at
  `lyra.admin.kokoasoft.com`. `VITE_APP_HOST` and `VITE_ADMIN_HOST` (Render's environment) tell them
  apart (`src/lib/hosts.ts`): the admin's address shows only the admin panel and the sign-in, the
  app's never shows the panel; unset (locally) both share one address. Invitations always open the app.
- The version (`package.json`) shows at the end of the sign-in screen; each release bumps it and is
  tagged (`V1.2.0`).
- Never put the secret / service_role key in the app.

## Data model (draft)

Every school-owned table carries `school_id`. `person` is shared by all the schools a person belongs
to; the platform tables (`billing_payment`, the admin log) belong to the admin.

- `school`: details, an optional logo, time zone, enabled or disabled, and the number of months
  without paying after which a student owes the registration fee again.
- `person`: the login (email) and the person's own name and phone, which only they can edit. A minor
  student is a `person` with no login; their guardian signs in for them.
- `membership`: a person's role in a school (director, teacher, student, guardian) and status
  (invited, active, inactive). One person can hold several, in several schools (a director who
  teaches is director and teacher; a student can take classes in two schools). A student's
  membership also holds whether they're a minor (set by the director) and their payment day.
- `guardian_link`: which minors a guardian answers for, in a school (a guardian can have several).
- `student_card`: per student per school: photo, name, birth date (the age is calculated, never
  stored), health conditions, active or deactivated, and the "everything I wrote is true"
  declaration (who and when). An adult's card has its `emergency_contact` rows (name,
  relationship (picked from a list, stored as a key, or typed under "Other…"), phone). A minor's people come from their guardian's `family_person` list instead.
  Every change is kept in `student_card_log` (what changed, who,
  when), which only the school's directors read.
- `family_person`: a guardian's people at a school, entered once and shared by all their children
  there: name, relationship, phone (needed for an emergency contact), photo (needed to pick up),
  whether they're an emergency contact, whether they can pick the children up (on by default for an
  emergency contact), and, in `family_person_child`, which of the children they're for (all by
  default). Changes are logged in `student_card_log` for each child they touch.
- `staff_card`: one per teacher or director, filled once for all their schools: photo, emergency
  contacts (name, relationship, phone) and optional health notes, so a school knows whom to call.
  Only the person and the directors of the schools where they currently teach or direct read it
  (a school loses access when the membership ends). Unlike a student's card, it isn't per school:
  no school's terms or consent attach to it.
- `terms`: each school's terms PDF, with a version; a new upload is a new version, never a replacement.
- `terms_acceptance`: the school, the terms' version, the student it's for, who accepted, and when.
- `room`: name, optional capacity (classes at once, students in total), archived.
- `class`: its teacher, kind (weekly, or free hours), and the maximum number of students (for free
  hours, of attendants); once full, no one else can enroll or book.
- `schedule`: a weekly class's weekday, start and end time, first and last date, and room.
- `session`: a real row for each time a class is given, with start and end (`timestamptz`), room,
  status (scheduled, cancelled) and an optional substitute teacher. Generated from the schedule
  for weekly classes (in the school's time zone); set one by one by the director for free hours. A
  replacement session points at the cancelled one it replaces. Editing a schedule regenerates its future sessions
  that have no attendance yet; past sessions never change.
- `session_secret`: the secret each session's check-in QR is made from, in its own table so students
  can never read it.
- `session_log`: every cancellation and substitute change: what changed, who, when.
- `enrollment`: a student in a weekly class, from one date to another, paying per visit or monthly
  (with the sessions a month the plan covers), and the price it was created with; created by the
  student (or guardian), stamped with who and when.
- `booking`: a student's place in one session, booked by the student (or guardian), with its kind
  (a free-hours place, or a trial class) and the price it was booked at.
- `package`: a student's monthly package at a school: the classes it covers (picked by the
  director), the sessions a week it allows (Monday to Sunday), from one date to another, and the price it was created with. The student isn't enrolled in
  any one of those classes; they come to whichever they choose.
- `price`: what it prices (the registration fee, a class's monthly plan, a package, a per-visit cash
  payment, a trial class, free hours per student by number of attendants), the class or package it's for when it
  has one, the amount, and from when. The director adds a new row to change a price, never edits
  one: new enrollments and bookings take the latest, and old ones keep theirs.
- `attendance`: a session, the person who attended (the child, for a minor), its kind (student,
  guest teacher), how it was recorded (QR check-in, teacher, director), whether the student's terms
  were pending, and who recorded it and when, stamped by the database.
- `attendance_log`: every removal or correction by a director, with the old and new values, who
  and when.
- `payment_proof`: a student, the method, the file, what it covers (one attendance for per-visit
  payers, one calendar month of one enrollment or package, or the registration fee), and its
  state: uploaded, confirmed or rejected by a director (who and when).
- `registration_fee`: a fee a student owes a school (on joining, or again after months without
  paying), owed until the director marks it as done (who and when).
- `announcement`: a post on a school's notices board: created by the database when a session is
  cancelled or given by a substitute, a class changes teacher, or a price changes (marked
  important); or written by a teacher (for one of their classes) or a director (for a class or the
  whole school). The class when it has one, the date, what changed or the text, who, and when, and
  whether a director kept it past its usual time on the board (rule 23).
- `teacher_pay_rule`: how a school pays its teachers, from a date: pay days (the 15th and the 30th,
  or the 30th), the scheme (a fixed amount per session, with optional amounts per teacher; a
  percentage of confirmed student payments, with what TotalPass pays the school per visit; or an
  amount per session by ranges of students, with what an empty session pays), and its amounts. A new rule is a new row from the current
  period; closed periods keep theirs.
- `teacher_payment`: a payment from the school to a teacher for a closed pay period: the amount (the
  app's calculation, or another with a note), date, method (transfer, cash), an optional receipt
  photo, who recorded it and when; then the teacher's answer: received, or "doesn't match" with a
  note. Never edited: a correction is another entry for the same period.
- `notification`: a personal in-app notice for a person (what it's about, read or not). Payment
  notices are also emailed. Reminders are created by a `pg_cron` job and emailed by an Edge Function; each
  reminder is sent once.
- Built so far (`supabase/migrations/`, not pushed yet): the tables above, plus `package_offer` (a
  package the director offers) beside `student_package` (a student's), `email_outbox` (every email,
  queued by the database and sent once by an Edge Function through Resend), `invitation` (only the
  link token's hash), `deletion_request`, and the queues `file_deletion` and `login_deletion` that an
  Edge Function with the secret key works through. One daily `pg_cron` job (`private.daily()`) sends
  payment and payday reminders, finds minors turning 18, charges fees owed again and runs the
  3-month data countdown, each by the school's own date.

## Roles

- **Admin** (platform): the owner's account. Runs the **admin panel** (below). Sees schools, their
  directors (with their phone and email, to call or write to them) and usage, never a school's students, teachers' classes, attendance, payments or cards.
- **Director** (school admin): runs a school (a school can have several directors), and can also
  teach. Names the school's rooms (and their capacity), defines classes, their schedules (with a room)
  and free hours, sets and updates prices, uploads the terms, moves or cancels a session or gives it
  to a substitute, invites teachers, registers students (marking minors) and their guardians,
  deactivates or deletes a student from the school, ends a student's enrollment, confirms or rejects payment screenshots, and is the only one who can remove or
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
- **Directors and teachers in several schools** switch between them from the line under each main
  tab's title, which names the current school with an arrow ("Estudio Aéreo Colibrí ▾") and lists
  their schools when tapped (not on Account), since everything they do (schedule, students,
  payments, notices) is for one school at a time. With one school there's no switch.

### Invitations

- Every login starts from an **invitation email sent through Resend** (directors by the admin;
  teachers, students and guardians by a director). It opens one page: who invited them, what's ahead,
  and the password (one field with "show"); nothing is used up until they press Continue, so a mail
  scanner opening the link doesn't spend it.
- The link works once and expires after 24 hours; a new one cancels the old one; each one sent is
  logged. Whoever invited never sees the link: if the email doesn't arrive, they **resend** it. The
  screen is the same whether the person was new or already had a login.
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
   director sets the exact times and the maximum number of attendants; students book their own
   place; the price is per student, by the number of attendants (from `price`).
4. **Students choose their classes**: a student (a guardian, for each child) enrolls from the app in
   the school's weekly classes, takes a package, or books free hours, choosing only among the payment
   options and prices the director set. It's active at once; the director gets a notice and can end
   it. A class at its maximum shows as full and refuses new enrollments (a database check, not only
   the screen). A student can book one **trial class** per class, at the school's trial price, paid
   per visit with a screenshot. A student can be linked to several classes and several teachers. Each enrollment says how the
   student pays: per visit (TotalPass or cash) or a monthly plan (card, transfer or cash) for up to a
   number of sessions per calendar month that the director sets. Instead of enrollments, a student
   can have a **package**: paid monthly (card, transfer or cash), up to a number of sessions a week,
   at whichever of the package's classes they choose. The director picks which classes packages
   cover; the school's other classes are outside any package, with their own price, and a package
   holder who wants one enrolls in it separately (a student can have a package and enrollments). A
   package's week runs Monday to Sunday (in the school's time zone). Going over a plan or a package never stops a
   student from attending: the director, the teacher and the student are notified.
5. Within one school, a student can't be in two sessions that overlap: a trigger refuses it when an
   enrollment or booking is saved, or a replacement session created. Other schools are never looked at.
6. **Check-in**: one QR per session, never one per student. The teacher (or substitute) opens the
   session on their phone and the app shows its QR, which changes every 30 seconds (a code made from
   the session's secret and the current time, served only to that session's teacher, substitute and
   the school's directors). Each student scans it with their own phone, signed in; a guardian picks
   which of their minors are there (siblings can check in together). From 10 minutes before the
   session's start up to 30 minutes after it, a database function checks the code against the
   server's clock (accepting the previous code too), the time window, that the student is enrolled,
   booked, or has a package covering the class, and that they've accepted the school's latest terms, then records the attendance for
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
   move. Every class schedule says its room: "Teacher A, Tuesdays 7–9 am, Sala aérea 1". Rooms are wide
   spaces, so several classes can share one at overlapping times. Each room has an optional capacity:
   how many classes it holds at once, and how many students in total (enrolled and booked; drop-ins
   can't be foreseen). When a schedule would go over either number, the director sees a warning and
   can still save it. This is the one rule that only warns, by design.
10. **Payment screenshots**: per-visit payers upload one for each session they attend (the TotalPass
   token, or a photo of the cash receipt). Monthly payers upload one per calendar month for each
   class (package holders, one per month for the package), covering up to the plan's sessions; the
   app shows how many they've used. The image is
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
   the 15th or the 30th (in February, its last day). Each calendar month's monthly plans and package at
   that school are due that day, and reminded automatically 5 days before, 1 day before and on the day,
   unless a screenshot for that month has been uploaded. A student who joins mid-month pays that
   month in full, due on the first payment day after joining. The reminder job uses each school's own
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
   again, and is notified; months without any enrollment or package don't count. It never blocks attendance:
   it stays marked as owed until the director checks it as done.
16. **Guest teachers**: a teacher attending another teacher's class is recorded as a guest teacher,
   owes no payment and is counted apart from students.
17. **Cancelling, substitutes**: a director can cancel a session and choose whether to offer a
   replacement session (a new session at another time, linked to the cancelled one; this is also how
   a session moves: there's no separate "move"), give it to a substitute without moving it, change
   a class's teacher from a date on, or end a class on one of its sessions (its later sessions go,
   and its enrollments end with it; past sessions and attendance stay). Each change is kept in
   `session_log`, posted on the notices board (rule 23), and the teacher's and director's calendar
   shows a substituted session in a different colour.
18. **Student card**: a new student fills in their card on the registration page reached from the
   invite (the guardian, for a minor): photo (optional: it can be added later from the card), name, birth date (the card shows the age, calculated),
   emergency contacts (name, relationship, phone), and known health conditions. A minor's card also
   lists the authorized people who can pick them up (name and photo), and the guardian declares they
   have those people's consent to share their photo (once per person: editing later keeps it ticked for
   the people already saved, and only someone new asks for it again). A guardian with several children enters their
   people once (the family list), then each child's own part; one reading of the terms accepts for
   all of them. Saved people show as small cards with edit and delete; a change asks first. The page ends with a required "I declare that
   everything I wrote here is true" box, recorded with who and when. Photos are compressed on the
   phone and kept in the private bucket. The student (or guardian) can edit the card at any time;
   each change is logged and the school's directors are notified. A card is never copied from one
   school to another: a student in two schools fills in each.
19. **Who sees a card**: the student (or guardian), the school's directors, and the teachers of the
   classes the student is currently enrolled in or that their current package covers (a substitute,
   on the day of the session they give).
   Access ends when the enrollment ends, or the teacher or student becomes inactive. On the card,
   each emergency contact's phone is a link that calls it (`tel:`). Cards hold health data, so the
   admin never sees them, and a student's card never crosses to another school (a staff card is one
   per person, seen only by the schools where they teach or direct).
20. **Deactivating and deleting a student**: a director can deactivate a student's card (the student
   becomes inactive and the card is hidden from teachers), or delete the student from the school.
   Deleting removes that school's card, photos, contacts, health conditions, pickup people and
   payment screenshots; their attendance and payment records stay, with no name, so the school's
   counts stay right. A student (or guardian) can ask the app to delete their data from a school:
   the app emails them a link, which opens a confirmation panel saying what will be deleted, and
   confirming does the same as a director's delete. A person left with no school has their login
   deleted too.
21. **Keeping an unregistered student's data**: when a student becomes inactive, their card and
   files are kept for 3 months. Once a month during those 3 months, they (or their guardian) get an
   email saying that they'll lose access to the school and its benefits, with the link to ask for
   their data to be deleted right away (rule 20). The day after the 3 months end, their data at that
   school is deleted as in rule 20, and an email tells them it has been deleted and that they'd need
   to enroll again. Registering them again before then stops the countdown.
22. **Turning 18**: on a minor student's 18th birthday (from the card's birth date), the school's
   directors get a notice inviting them to register the student again as an adult (with their own
   login) and to delete the old registration, which ends the guardian's access.
23. **Notices board**: each school has a board in the app where every schedule change is posted
   automatically ("Nov 26, Silks 12 pm: given by a substitute"; "Nov 28, Trapeze 4 pm:
   cancelled"), and so is every price change, marked important. Teachers can post notes for their
   own classes, and directors for a class or the whole school; posts are never edited (a correction
   is a new post). Students and guardians see the boards of their schools together, newest first, with
   an unread count, showing only the posts for the whole school (a director's school-wide note, a
   price change) and those for their classes (a guardian's, for their children, each marked with
   whose class it is); a teacher's board shows the whole school's posts and their own classes'. Students the change touches directly (enrolled in the class, booked in the
   session, or with a package covering it) also get a personal in-app notice. Schedule changes are
   never emailed; email stays for payments and the account (invites, terms, data deletion). Posts
   leave the board on their own: a schedule change the day after its session, a teacher change a
   week after it applies, a price change 30 days after it applies, a note 30 days after it's posted;
   a director can keep one longer. Staff read this rule at the bottom of the board.
24. **Teacher pay**: each school sets how it pays its teachers (`teacher_pay_rule`): on the 15th and
   the 30th (each covering its half month; in February, its last day) or once a month on the 30th,
   and by one scheme: a fixed amount per session given (optionally per teacher); a percentage of
   what the students paid for the session, counting only confirmed payments (a plan or package:
   its price over the sessions it covers, once the month's screenshot is confirmed; cash: the
   per-visit price; TotalPass: what TotalPass pays the school per visit), with what's still
   unconfirmed shown apart and added to the first payday after it's confirmed (students usually
   pay within 5 days of their payment day, so most of it joins the next payday, which the line
   names); or an amount per session by
   how many students came (ranges the director sets, and what a session nobody came to pays, if
   anything). A teacher sees **Payment not confirmed** beside a student whose plan or package
   payment for the month isn't confirmed yet (My students, and who's expected in a session). Counted from attendance: trial classes are the school's and never count (they
   stay on the teacher's schedule), TotalPass counts, guest teachers don't; a session counts for
   whoever gave it (the substitute, not the class's teacher), and cancelled ones don't. A change
   applies from the current period, and the teachers are notified in the app; closed periods keep
   the rule they had. The money moves outside the app (transfer, cash), but each payment is recorded
   in it (`teacher_payment`): a director records it for a closed period, the teacher gets a notice
   and confirms it was received or says it doesn't match (with a note), which becomes a director's
   to-do; a correction is another payment, never an edit.

Enforce these where the data lives (database constraints, RLS, triggers that stamp who and when),
not only in the screens, so a tampered client can't skip them.

## Screens

What each person sees after the one sign-in screen. A screen only shows what the database lets that
role read; hiding a menu never protects anything. The mockup brief for these is
`docs/design/claude-design-brief.md`.

**Before the app opens** (everyone, in this order when they apply):
- **Registration** (invited students and guardians), numbered steps: the account (the invite page),
  the card form (started with the name the school registered), then the terms reader, then done,
  which offers **Choose my classes** besides opening the app.
- **New terms**: the terms reader, until the latest version is accepted.
- **School disabled**: a message, nothing else.

**On the main tabs**, the top bar keeps the notices button (with the unread count) in view, and for
everyone but the admin the card button too (a teacher's or director's own staff card); both open as
popups that close back to the screen. List screens opened from a tab (Más's Rooms, Prices, Terms…)
keep only the notices; forms, done screens, the camera and a person's or item's detail (the screens
without the bottom bar) show neither, so their title has the room. A card's **Edit** edits everything that's the person's,
their own name, phone and email included (a guardian's own details stay in Account). A new email
is the sign-in: the change applies only once the person opens the confirmation link sent to it
(Supabase Auth's email change). The notices popup says whose board it is (the school, or each
school's board under its name for a student in several), keeps its "posted by itself, never
emailed" line (students and guardians; staff read it on the post screen) and the post button pinned at its bottom, and ends above the bottom bar. Account
screens show no email under their title: it belongs to the card.

**Student** (and guardian, for their minors). All their schools together, each item labelled with
its school; no school menu. Bottom bar: Home, Classes, Payments, Account.
- **Home**: today's and upcoming sessions (class, teacher, room, time), substitutes and
  cancellations marked; a big **Check in** button kept above the bottom bar. An upcoming session's
  class opens as a popup (when, teacher, room, how they pay, next sessions, leave), like the board.
  A guardian's Home follows the child picked in its carousel: a card only when a payment needs
  doing (a fee owed, a rejected screenshot; the rest is in Payments), their session today, and their
  upcoming sessions (same popup).
- **Check in**: the camera, to scan the teacher's QR; a guardian first picks which minors are there,
  in a popup on Home (back from the camera returns to it).
  Then a clear result: checked in, or why not (too early, too late, code changed, not enrolled,
  terms pending), with the button that can fix it: scan again (too early, code changed), read the
  terms, or see Classes (not enrolled); too late says the teacher can still add them by hand.
- **Classes**: their classes and package, each opening the same popup as Home (leave one: they stay
  until the end of the paid month; a class a package covers is left with the package), and the
  classes, packages and free hours they can join (a guardian, for the child picked) in three tabs.
  Classes their package covers aren't offered again. With many classes: a search and a row of day
  initials; once one school is picked, only the day row (that school's classes are few enough). Classes they can join come first, with places
  left; then those at the same time as one they take at that school ("overlaps …", rule 5); then
  the full ones. A class opens with how to pay (shown, not asked, when there's one way) and when to
  start (the next session already picked), **Enroll**, and **Trial class** if they haven't tried it.
  With classes in several schools, the line under the title ("‹all schools› ▾", like the staff's school line, always in view) keeps both views to one school (their
  classes, the ones to join, and packages and free hours, which are their school's). Two views,
  **List** and **Calendar**. The calendar is the month with their sessions as dots; "Show classes with places" adds rings on the days with classes they
  could join (with places left). A day lists their sessions (each opening the class popup), then **You can join**:
  that day's classes with places left, by time, the ones at the same time as theirs marked; one
  opens the enroll screen starting that day, since enrolling is every week. Packages and free hours
  stay in the list.
- **Payments**: per class or package, what's due and when; sessions used against the plan (this
  month, or this week for a package); each screenshot and its state (uploaded, confirmed, rejected);
  registration fee owed (a guardian with three or more children picks "Payments for ‹all› ▾"); **Upload screenshot**, for the plan picked, on only while it needs one
  (nothing sent yet, a rejected one, a fee owed; otherwise a line says it's sent or paid): the upload screen shows what's
  paid (class or package, school, amount, due date) instead of asking again.
- **My card** (popup; a guardian picks which child, a student in several schools which school's card,
  since each school has its own, from the popup's subtitle written as text with ▾): tapping the photo changes it; age, health
  conditions, emergency contacts, pickup people (minors); a student's own name and phone fold
  inside it; **Edit** opens the form, which holds them too.
- **Notices** (popup): personal notices first, then each school's board under its name (with more
  than two schools, one heading "Board of ‹school› ▾" picks one board or all of them).
- **Account**: name and phone (guardians; a student's are in their card), password (asks, then
  emails a link: the password is never changed inside the app), language (kept on that phone: the app opens in it; Spanish until one is picked), theme (automatic, light,
  dark; kept on that phone), accepted terms, and at
  the bottom, pinned above **Sign out**, **I want my data deleted**, a popup where they pick the school and tick a box to turn
  the button on; it asks once more, then emails the link.

**Teacher**. One school at a time; the school line under each main tab's title switches it when they teach in several.
- **My schedule**: the month, with the days that have classes marked; tapping a day opens its
  sessions in a popup (tapping today scrolls to today's sessions, listed below the month instead);
  substitutes in their colour.
- **Session** (one screen for the teacher and the school's directors): **Show QR** (full screen,
  changing every 30 seconds, open from 10 minutes before the start to 30 after); who's expected and
  who has checked in, guest teachers counted apart, each student with their health-conditions,
  terms-pending and payment-not-confirmed flags; **Add attendance** until 1 hour after the end. A director adds at any time, taps a record (marked **Correct**) to remove or correct
  it, also for past sessions (whose missing students show as "didn't come"), and sees the change
  history.
- **My students**: their classes' current students, grouped by class (with its days and times),
  health conditions first; each opens the card, emergency phones as call links. The search stays at
  the top and the list scrolls in its own box, each class's name and times staying in view at its
  top while its students scroll under it.
- **Payments**, two tabs: **My pay**, by pay period ("Period: … ▾", the current one first, then
  closed ones with their payday): the students that count and the amount side by side, the sessions given
  (and covered as a substitute), then per class, each opening its sessions with who came and what
  each one pays; a line says how the school pays (rule 24); a closed period shows its payment
  (amount, date, method, receipt) with **I got it** and **Doesn't match** (a note to the director). **Screenshots**: their classes' payment
  screenshots, view only.
- **Notices** (popup): the board and personal notices (a student over their plan, a change to their
  classes); **Post a notice** for one of their classes. A class post belongs to the class itself
  (its id, never its name): it shows the class's teacher, days and times, so two classes with the
  same name can't be mixed up, and the class's students see it marked **Your class**.
- **My card** (popup, the card button at the top): photo, emergency contacts, health notes, with
  their name, phone and email folded inside it; **Edit** opens one form for all of it. It's one card
  for all their schools (`staff_card`), which says so when they teach in several.
- **Account**: password (by email), language, theme, **Sign out** pinned at the bottom. A new teacher
  registers in two steps: the invite page (password) and their card (started with the name the
  school gave, photo optional), then done opens **My schedule**.

**Director**. One school at a time (the school line under the title switches it, with several). A director who teaches reaches the
teacher's **My students** and **My pay** (without the screenshots tab: those are reviewed in
Payments) from More, and **My classes** in Calendar › Month marks and
keeps to the sessions they give, each opening its Session.
- **First steps** (a new director's first screen after registering, the same two steps as a
  teacher, and a row in More): the school's setup in the order each step needs the one before:
  terms (needed to register students), rooms, teachers, prices, the week in Plan, students. Each
  opens its screen and shows whether it's done, with progress and the next step on the main button.
- **Dashboard**, two tabs. **Today**: today's sessions in every room; to-dos (the first six, then a
  last row opening the rest): screenshots to check, registration fees
  owed, students over their plan, new class enrollments (opening Students filtered to them, each
  marked with the class and date, with a way back to everyone), card changes, minors turning 18,
  teachers to pay and payments a teacher disputed. Each to-do keeps one row's size, and clears itself once dealt with: screenshots reviewed, the fee marked paid, the adult
  registration done, every student's acceptance, the teacher paid or the dispute settled; those only to know about (a card change, a new
  enrollment, a student over their plan) clear once the director opens the student's file (or its
  change history). The popup with all of them says so.
  The registration fee is called "cuota de inscripción" there, so it isn't mistaken for enrolling in
  a class.
  **Summary**: six numbers about the school this month, each a card in the colour of what it means
  for the school (green good, yellow worth watching, red needs attention, also said in words), with
  last month's for a trend (an arrow, green when it improved) and opening its breakdown screen:
  class margin (confirmed income minus teacher pay, per class), trial classes that turned into an
  enrollment (per class and teacher), places taken (per class, and attendance by weekday and time of
  day), students about to leave (stopped coming, month unpaid, missed sessions, class ending; each
  opens their file), late payments (after the 5 days following the payment day; by month and who),
  and students still active 3 months after joining (by the month they joined). Each breakdown says
  where its colours change, and names each class with its teacher, days and hours (classes can share
  a name).
- **Calendar**, two tabs. **Month**: every session by day, with previous and next month and a legend drawn
  with the calendar's own dots; tap one to open its Session (QR and attendance: add, remove or
  correct, with the change history), then two groups of changes. **Only this session**: move it
  (another day, time or room: stored as a cancellation with its linked replacement), give it to a
  substitute (or, when it has one, back to its teacher), or cancel it (no make-up; its screen offers moving instead). **From this session on**
  (weekly classes): change days, times or room (Plan's form, applying from that session), change
  the teacher (from one of its next sessions, picked from a list), or end the class. Each opens in
  its own mode, so no screen asks which of them it is. A session that's over only offers its
  attendance.
  **Ending a class**: pick its last session from the ones ahead; the screen says what happens (its
  students' enrollments end with it, packages stop covering it, later sessions come off the
  calendar, past sessions, attendance and payments stay) and points to changing it from a date when
  only the days, times or teacher change. Done offers **Create its replacement**: a copy with the
  same teacher, days, times and room starting the next day, with a box (on) to notify the old
  class's students in the app so they can enroll if they want (rule 4: they choose).
  **Plan**: the school's typical week, the weekly activities (class, teacher, days and times, room,
  dates, maximum of students) that repeat until their end date; the save button turns on once
  everything needed is filled in; editing one asks first from which of its next sessions the
  change applies (earlier ones never change), keeps a started class's first date, and has
  **End the class** below the save button; add one (the **Activity** or **Free hours** button picks its kind,
  so the form doesn't ask), edit one, or **duplicate** one to start from its pattern; each card shows
  how it's paid (in packages, monthly price, per visit); free hours below; room capacity warnings.
  Plan is the one list of the school's classes (there's no separate Classes screen).
- **Rooms**: names, capacity, archive. With many rooms, "In use (n) | Archived (n)" tabs beside the
  search show one list at a time. Each room (and **Add room**) opens its own screen: name and
  capacity, save, and archive pinned apart. A room with sessions ahead lists the classes holding
  them under "Used by", each opening its Plan form from its next session there (to change its room),
  and offers no archive until they move.
- **Students**: the list (search and status tabs stay at the top, the list scrolls in its own box);
  register (an adult, or a guardian with one or more children; payment day), end an
  enrollment (it shows until when: the end of the month paid), deactivate (off until their
  enrollments are ended; an inactive student shows the 3-month countdown and **Reactivate**),
  delete; a minor turning 18 is registered as an adult from their file (name, email and payment
  day already filled); once they finish registering as an adult, a to-do asks to delete the minor
  registration (the sent screen says so); each student's card, classes, payments and change history.
  **Register a student** is a button at the top of the director's main tabs (detail screens keep
  the room for their title).
- **Teachers**: invite, deactivate, reassign future sessions; each teacher's card (emergency contacts).
  With many teachers, "Active | Invited | Inactive" tabs (with counts) beside the search; rows keep one size.
  A teacher with sessions ahead (their own or covering someone) shows a **Reassign** row saying how
  many, and Deactivate stays off until none are left. Reassigning picks a new teacher for each class
  from a date (saved once every class has one); the sessions they covered go back to their
  teacher. A deactivated teacher can be reactivated.
- **Payments**: screenshots to confirm or reject, one after another (deciding one opens the next),
  each with the date and time it was sent, to match the bank deposit, and the amount against the
  plan's price (marked when they differ), shown before the picture; rejecting picks the reason from a
  dropdown (the usual ones, or "Other…" to write it), which is what the student reads;
  registration fees, who's due or overdue.
- **Pay teachers**: a closed period (text with ▾) with each teacher's calculated pay and where its
  payment stands (to pay, to confirm, received, doesn't match; disputed ones first); a teacher opens
  their pay, where **Record payment** opens its form (amount filled with the calculation, a note
  required when it differs, date, method, optional receipt photo taken or picked on the phone, which
  both the director and the teacher open from the payment's "see receipt"). As teachers' payday
  approaches (5 days before, the day before, the day itself), the director gets a notice saying how
  many are still to pay, like the students' payment reminders. Panel's to-dos list teachers to
  pay and disputed payments.
- **Teacher pay** ("How their pay is calculated"): the pay days and the scheme (rule 24; by ranges,
  each range's from, up to and pay are typed, a new range starts empty before the last "or more" one,
  and a range that doesn't follow the one before says so and keeps save off), with each teacher's amount for the current
  period under the form, recalculated as it's edited, to compare schemes before saving. Each
  teacher's file has **Their pay**, the same view the teacher has.
- **Prices**: registration fee (and the months without paying after which it's owed again), monthly
  plans per class, packages, per-visit cash, trial class, free hours; each change is a new price from a date (shown beside the current one until then), posted on the
  board as important. **Add package** (the footer button) and each package open its own screen: name,
  classes a week, the classes it covers (all or some, each with its teacher, days and hours) and, for
  a new one, its price (an existing one changes price like any other). One nobody has can be
  deleted; one in use is no longer offered (its students keep it) and can be offered again.
- **Terms**: upload a new version; who has and hasn't accepted (a few, then a last row for the rest,
  in a list that shows five at a time), counting only current students (a deactivated one leaves
  the counts); earlier versions with their full date.
- **Export**; notices are the popup on every screen, where directors also post.

**Admin**: the admin panel only (below), and an Account tab (password, language, **Sign out**).

## Storage

- One private bucket. Paths use ids, never names, with a prefix per kind:
  `{school_id}/proofs/{student_id}/{proof_id}.jpg`, `{school_id}/cards/{student_id}/{file_id}.jpg`,
  `{school_id}/terms/{terms_id}.pdf`, `{school_id}/teacher-payments/{payment_id}.jpg`,
  `{school_id}/logo/{file_id}.png`, and `staff/{person_id}/{file_id}.jpg` for staff cards (one per
  person, not per school).
- Policies check the matching row (`payment_proof`, `student_card`, `staff_card`, `terms`,
  `teacher_payment`, `school`), not the folder name alone. Only the owner uploads; no one replaces a file. Files are removed only by a delete (rule 20)
  or a school's deletion, through an Edge Function.

## Admin panel (platform admin only)

Modelled on VetClinicTracker's Plataforma (`docs/platform-admin-plan.md` there):

- **Schools**: register a school (asked: its name and first director's name and email; an optional logo, shown as a small square, or the school's initials until one is uploaded, wherever the school is named on its own (the invite page, the staff school line, the student's school picker, each board's heading, the admin's schools); time zone and
  fee start with the usual values; trial end, tax details and notes are optional and folded away;
  creating it sends the invite and says so, with **Resend**); each school opens its own screen (not a popup: deleting needs
  typing), with enable / disable pinned at its bottom (a disabled school adds **Delete school**, which opens
  its own screen: what goes, what stays, typing the name turns the button on); assign and change its
  directors (invite by email), and **Edit details** on its own screen (name, time zone, fee, billing
  day from 1 to 28, trial end, tax details for invoices, notes). Each school shows its directors with links to call or
  write to them. At the top, the platform's total storage in GB against the hosting plan.
- **Enable / disable a school**: disabled, its people can still pass the sign-in screen but the
  database returns nothing and the app says the school is disabled; its data stays and it can be
  enabled again. Delete only a disabled school, after typing its name; its files go with it, and so
  do the logins of people who belonged to no other school.
- **Payments** (`billing_payment`): a monthly fee per school, a billing day and an optional trial end
  date; payments recorded by hand on their own screen (amount, date, month paid, method, who paid), never edited,
  corrected with a negative entry. One screen with the calendar: overdue, then upcoming (payments
  due, trial ends, the admin's own reminders), then the history (payments received, corrections,
  disables), and each school's fee and whether it's up to date.
- **Usage per school**: storage in GB against the plan's limit, number of students, teachers and
  classes, people active and check-ins in the last 30 days, last activity. Counts only, no records.
  App use is the admin's: the director's Summary doesn't show it.
- **Log**: every admin action with who and when, kept even after a school is deleted (it keeps the
  school's name, not a link to it).
- **Export**: each school's director can download the school's own data, since the admin can't see
  it. It holds only that school's memberships and records, never a person's other schools. Health
  data and photos are included only after a separate confirmation. Each export is logged.

## Copy

- The app is in **Spanish and English**. Every static text lives in a translation file per language,
  reached through one `t('key')` helper; never write user-facing text straight into a component.
- What the app writes about the data is app text too: the data keeps keys and ISO dates (a
  relationship is `mother`, a plan's kind, a covered month `2026-11`, a notice's date), and the
  screens turn them into words in the reader's language (`src/screens/shared/labels.ts`). Only what
  people typed stays as typed: names (classes, rooms, people, schools), posts, health notes, an
  "Other…" answer. Translating what people type is in `docs/future-improvements.md`.
- Code, identifiers and comments in English.
- Texts say what really happens: don't promise an email or a notification that doesn't exist.

## Working conventions

- Keep TypeScript strict: no `any`, no `@ts-ignore`.
- No new dependencies without asking first.
- A new migration changes production: the owner approves each push. Never edit a migration that has run.
- **Database work happens locally first**: `npm run db:start` (Docker Desktop running) starts Supabase on
  this machine, `npm run db:reset` rebuilds it from `supabase/migrations/`, and `npm run test:db` runs
  the pgTAP tests in `supabase/tests/database/` (each rule checked as the roles it applies to, inside a
  transaction that's rolled back). Every rule that lives in the database gets a test there. Migrations
  that haven't been pushed can still be edited; once pushed, never.
- New tables and functions need explicit grants (start from no privileges, as VetClinicTracker does).
- Interactive elements are real buttons and inputs (keyboard and focus). Each input says what it
  holds (`type`, `inputMode`, `autoComplete`), so phones open the right keyboard (numbers for
  amounts, a phone pad for phones). Dates and times are written by the app in its language ("Mar 1
  dic 2026", "17:00"), whatever language the phone is in, with the phone's own picker opening on
  tap (`DateField`, `TimeField`).
- **Phones first, for every role**: directors too mostly use the app on their phone. Design every
  screen at 390px wide first; wider screens only give it more room. On the web (600px and up) the app fills the window: the
  content is one centred column (`--content-max`), popups open as dialogs in the middle, and from 900px
  the bottom bar becomes a side menu with the app's name. `?frame` shows the phone outline on a laptop,
  to review the phone layout. Keep content clear of the
  notch and home bar (safe areas); the page itself never scrolls (iOS Safari would drag the bars with it), only one scroll area between the top bar and the bottom bar (a long list of people under a search
  field scrolls in its own box instead, so the field stays and the list ends above the bottom bar); prefer
  cards that scroll sideways, or tabs, to very long pages.
- **Building screens**: colours, type and the shared pieces (buttons, cards, chips, lists, popups,
  form fields) live in `src/styles/app.css` and `src/ui/`; screens compose them and set no colours
  of their own. Every screen and popup is a browser history entry: back (the app's arrow, the
  browser's, the phone's gesture) goes to the page the person came from, and the screen keeps its
  scroll position. Every page opened from a button has a back arrow, main tabs included when a
  button (not the bottom bar) opened them.
- **Bottom texts and main buttons** sit in the screen's footer, always in view, never under the
  scroll. A pinned text only explains the footer's button (why it's off, until when, what happens
  when tapped); any other explanation goes in the scroll, under what it explains. Detail screens
  (opened from a list, with a back arrow) hide the bottom bar. Anything chosen from a fixed list is a dropdown (with "Other…" and a text field when the
  list can't hold every answer); a choice that changes what a screen or popup shows (the school,
  the child, the class a list keeps to, the board) is text with ▾ instead (`MenuText`, or the school
  line under a title), opening the phone's own list, one line, long names ending in "…", while a
  value being entered in a form stays a labelled dropdown; a list's filter is kept in the URL, so
  back from a row finds it still applied; tabs that switch views stay as tabs. Carousels select the card that
  reaches the middle while swiping (or the one tapped), and the screen follows the selected card at once (what
  it fetches shows a skeleton of its shape meanwhile; anything loaded from the server does, and the
  prototype stands in for the wait); tapping the
  selected card again opens it (its class, its session), which the card says at its bottom right,
  with no separate button; the cards keep one size (each line stays on one line, tags are short words, with an icon where it helps (♡ Salud, Términos, $ Pago),
  and a fixed-height row shows two tags and "+N", the file showing all, long names end in
  "…"), so a long text never moves the page; with more than eight cards a count ("3 of 19")
  replaces the dots, and the dashboard's sessions start at the one going on now; the selected
  card sits in the middle, with its neighbours peeking at both sides, and it's kept in the URL, so
  coming back to the screen finds it still selected. Day pickers are one row of
  seven initials from Monday, the full width; a picked day only changes colour. A person's own name,
  phone and email show in their card, always in view under their own heading, never as a separate
  menu row. A finished step
  (registration, enrolling) centres its message and shows a short confetti burst, and takes the
  form's place in the history, so back never reopens a form that was already sent. A popup's main
  action is pinned at its bottom too. Popups fade and rise in, and fade and sink out (the exit starts in the same frame, so nothing flickers). Scroll areas show no scrollbar, as on a phone. Main buttons are 48px tall (the check-in button two short lines), so a pinned action leaves the content its room. Deactivating, deleting and signing out are pinned at the
  bottom of their screen, drawn apart from a main action (outline or plain), sign out last. Button
  colours say what happens: the accent goes ahead; red deletes or ends something ("I want my data
  deleted", ending an enrollment, deleting); a neutral outline is reversible (deactivate, archive,
  leave a class, sign out). An off button keeps its kind, only faded (a neutral outline, a pale red). Each screen's own "add" is a labelled footer button; the top bar's only add
  icon is the director's **Register a student** (on the main tabs), which no screen repeats in its
  footer. A session card already shows its times: no separate time column beside it; inside its class's popup it leaves out the class name (the title says it). A screen that would scroll for a line or two is tightened to fit a phone with its browser bars (390 × 664). The school line under the title (staff in several schools) replaces a subtitle naming the school. Lists of
  names joined in a sentence use the language's own "and". A person named in a chip shows as first
  name and surname initial ("Mariana R."), so chips stay short; in lists and cards, people show as
  first name and first surname ("Sofía Ramírez" for "Sofía Ramírez Castro"), the full name only in
  their own file. A school name too long for that line ends in "…"; the list of schools shows it in full.
- **Ask before changes others rely on**: removing a pickup person or emergency contact, changing
  health conditions, cancelling or reassigning sessions, new prices or terms, posts, corrections,
  deactivating and deleting all show a confirmation box first. Buttons for a step that needs
  something first (reading the whole PDF, ticking a box, typing a name) stay off until it's done.
- **The live app** (`src/live/`): signing in with a real login loads what that person may see
  from Supabase into the same shapes the prototype uses (`load.ts`), so the screens read it unchanged;
  the screens' changes are sent to the database (`actions.ts`) and everything reloads after each one,
  so a refused change comes back as it was (shown at the bottom). Wired so far: the director's and
  the teacher's screens (reading), confirming and rejecting screenshots, sessions (cancel, move,
  substitute, change teacher, end a class), prices, deactivating students, attendance by hand, posts,
  fees marked paid, teacher payments and their answers; the invitation link (`#/invite/{token}`). The
  student's and guardian's screens, registration (card and terms), check-in, uploads and the admin
  panel still show the prototype's data. Helios's data is `supabase/seed.sql`.
- **The prototype** runs in this app with invented data from `src/mock/` (an aerial dance studio,
  Estudio Aéreo Colibrí, and its sister schools, plus Helios in `src/mock/helios.ts`: a real
  studio's schedule, prices and teacher pay, with invented students whose two months of attendance and
  payments are generated from their plans; the prototype's teacher (Mariana Alvarez) and director (Ana
  Torres) work there; remove it as screens read Supabase); its sessions cover November and December, the months the calendars show. The director's changes (the calendar's, reassigning and deactivating teachers, adding and
  archiving rooms, ending enrollments, deactivating students, new prices and terms, confirming or
  rejecting screenshots, the teacher pay rule and teacher payments), a teacher confirming or
  disputing a payment, a student leaving a class and the admin enabling, disabling or deleting a school
  apply to that data until the page reloads, and post on the
  board as the database would (`src/mock/changes.ts`). Opening it as `/?stress#/...` adds stress data (7 schools, a teacher and a student in
  all of them, a guardian with 7 children (one in four schools, another in three), 50 more students, very long names and texts) to test that
  screens hold: long text ends in … or wraps inside its card, never past it. Long lists grow
  tools as they grow: a search (behind a magnifier button, beside the tabs or dropdown of that list, since
  searching is occasional) above more than about ten teachers, rooms or classes (Plan also gets
  a row of day initials), a class picker (text with ▾) for a teacher with more than three classes (each
  class shows a few students and a button for the rest), the dashboard's first six to-dos with the rest
  in a popup (opened from the list's last row, as "see N more" rows are everywhere), boards ten posts at a time (three per school while all of a student's schools show),
  and long change histories in a box that shows five at a time. The Claude Design canvas in the
  brief is from before and no longer updated; the app is the reference for the screens.
- IDE: JetBrains Rider; keep the project openable as a plain folder, and don't commit editor files.
