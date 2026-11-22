# CLAUDE.md — Art School Management (draft)

An app for an art school: register students and teachers, link them, schedule each class's time
frame, and track attendance. **Draft**: the stack and several rules are still open (see the end).

## Words used here

The owner's words, and what they mean in this project. Code uses the English column.

| Owner says | Means | In code |
|---|---|---|
| alumni / alumnos | the school's students (current ones, not graduates) | `student` |
| assistance / asistencia | attendance at a class session | `attendance` |
| time frame | the period a teacher's class with a student runs, and the hours a session can be checked into | `schedule` / `session window` |
| registered / unregistered | enrolled and active in the school, or not (kept, never deleted) | `status: active / inactive` |

## Roles

- **Admin**: the school owner's account. Creates **directors**. One or few, created by hand.
- **Director**: runs the school day to day. Invites **teachers**, registers and unregisters students,
  assigns and unassigns students to teachers, and sets each class's time frame.
- **Teacher**: sees the attendance of their own classes, and can add a student who came but didn't check in.
- **Student**: checks into their class, only within its time frame.

## Rules

1. Students and teachers are registered and unregistered, never deleted: their history stays.
2. A student can have several teachers.
3. A teacher can't have the same student twice in overlapping time frames.
4. Each class (teacher + its students) has a time frame set by a director.
5. A student can check in to a class only during its session window.
6. A teacher can mark a student present after the fact; the record says it was added by the teacher.
7. Only admins create directors; only directors invite teachers.

Enforce these where the data lives (database rules), not only in the screens, so a tampered client
can't skip them.

## Working conventions

- Code, identifiers and comments in English. User-facing text in Spanish, unless decided otherwise.
- Keep TypeScript strict once code exists: no `any`, no `@ts-ignore`.
- No new dependencies without asking first.
- Never put secret or service keys in the app.
- IDE: JetBrains Rider; keep the project openable as a plain folder, and don't commit editor files.

## Open questions (decide before building)

- **Stack**: the same as VetClinicTracker (Vite + React + TypeScript + Supabase, hosted on Render under
  `kokoasoft.com`)? That reuses what's proven: logins, invites by email through Resend, RLS.
- **One school or several?** If several, every table carries a school id, as VetClinicTracker does.
- **Do students have their own logins**, or does a tablet at the door check them in?
- **What is a "class"?** A teacher + a group of students on a weekly schedule (e.g. Tuesdays 4–6 pm,
  September to December), or one-to-one lessons? This decides how "time frame" is stored.
- **Check-in window**: from when to when (e.g. 15 minutes before to 30 after the start)?
- **Rule 3** read as: the same teacher–student pair can't be booked twice in overlapping periods. Confirm.
- Can a teacher remove a check-in that was wrong, or only add ones that were missing?
- Language of the app: Spanish only, or Spanish and English?
