# Art School Management

A phone-first web app for art schools: students and teachers, classes and their schedules,
enrollments, QR check-in, payments and payment screenshots, teacher pay, and a notices board.
Several schools share one app, and each sees only its own people and records.

**Status — v1.0.0: clickable prototype.** Every screen, for every role, is built and works with
invented sample data. Changes made while clicking around stay in memory until the page reloads.
The backend (Supabase database, auth, storage, emails) is the next step; its data model and rules
are written down in [`CLAUDE.md`](CLAUDE.md).

## Roles

| Role | What they do in the app |
|---|---|
| **Student** | Sees their classes in all their schools (list or calendar), enrolls in classes, packages or free hours, books a trial class, checks in by scanning the teacher's QR, uploads payment screenshots, keeps their card (health conditions, emergency contacts) up to date. |
| **Guardian** | Everything a student does, for each of their minor children (one family list of emergency contacts and pickup people for all of them). |
| **Teacher** | Their month of sessions, the session QR and attendance, their students' cards, their pay by period (calculated from attendance by the school's rule) and confirming each payment. |
| **Director** | Runs a school: dashboard with today's sessions and to-dos, a monthly summary (margin, trial conversion, places taken, students about to leave, late payments, retention), the calendar and weekly plan (move, cancel, substitute, change teacher, end a class), students, teachers, rooms, prices, terms, payment screenshots, and paying teachers. |
| **Admin** | The platform: registers schools and their directors, enables or disables them, records each school's fee, sees usage counts — never a school's students or records. |

## Trying the prototype

Requires Node 20+.

```sh
npm install
npm run dev
```

Open <http://localhost:5174>. The first screen lists every role and flow (sign in as a student,
a guardian, a teacher, a director or the admin, or walk through an invitation).

- **Stress data**: open <http://localhost:5174/?stress> to add 7 schools, a teacher and a student in
  all of them, a guardian with 7 children, 50+ more students and very long names and texts.
- **Phones**: the dev server listens on your network (`npm run dev -- --host`), so a phone on the
  same Wi-Fi can open `http://<your-computer's-ip>:5174`. On a laptop the app shows inside a phone
  frame.
- **Language and theme**: Spanish and English, light and dark, from Account (kept on that device).

Other scripts: `npm run build` (type-check and production build into `dist/`), `npm run typecheck`,
`npm run preview`.

## Tech

- Vite + React 18 + TypeScript (strict, no `any`).
- No UI library: the shared pieces (buttons, cards, lists, popups, form fields, carousel) are in
  `src/ui/`, colours and type in `src/styles/app.css` (light and dark themes).
- A small hash router with every screen and popup as a browser history entry (`src/lib/router.tsx`).
- All texts in Spanish and English through `t('key')` (`src/data/texts.es.json`, `texts.en.json`).
- Planned backend: Supabase (Postgres with row-level security, Auth, Storage, Edge Functions,
  `pg_cron`), emails through Resend, hosted on Render behind Cloudflare.

## Project layout

```
src/
  App.tsx            routes
  screens/           one folder per role: student, teacher, director, admin, entry (sign-in,
                     invitations, terms), shared (cards, notices, pay, labels)
  ui/                shared components (Screen, Fields, Layers, Icon)
  lib/               router, texts, date and money formatting
  state/             language, theme, current school
  mock/              invented data and the in-memory changes (removed as screens read Supabase)
  data/              texts in Spanish and English
docs/
  design/            the original design brief
  future-improvements.md
CLAUDE.md            the full spec: vocabulary, data model, rules, every screen, conventions
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — the specification: the owner's vocabulary, the data model, the 24 rules
  (enforced in the database, not only in the screens), every screen per role, and the working
  conventions (phones first, copy, buttons, carousels, accessibility).
- [`docs/future-improvements.md`](docs/future-improvements.md) — agreed ideas for later, such as
  automatic translation of what people type.

## Next steps

1. Supabase schema, row-level security and storage policies from the data model in `CLAUDE.md`.
2. Auth and the invitation flow (Resend emails, one-time links).
3. Replace `src/mock/` screen by screen with real queries; keep the skeletons for loading.
4. Edge Functions for invites, payment emails, reminders (`pg_cron`) and data deletion.
