# Lyra

**lyra.kokoasoft.com** — a phone-first web app for art schools, starting with aerial dance studios
(silks, hoop, trapeze, pole): students and teachers, classes and their schedules,
enrollments, QR check-in, payments and payment screenshots, teacher pay, and a notices board.
Several schools share one app, and each sees only its own people and records.

**Status — v1.2.0: the database is live (Supabase), with Helios as the first school; the director's and
teacher's screens read and change it. The rest of the screens are still the clickable prototype.** Every screen, for every role, is built and works with
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

## Sample data

The invented data the prototype runs on (an aerial dance studio, Estudio Aéreo Colibrí, and its
sister schools) is in **`src/mock/data.ts`**: schools, rooms, teachers, classes and their weekly
slots, students and their cards, enrollments and packages, prices, payment screenshots, notices and
personal notices, in that order, each block with a comment. Sessions are generated from the classes'
slots for November and December. The stress additions are the `if (STRESS)` blocks in the same file.

**Helios** (`src/mock/helios.ts`) is a second aerial studio with its real setup: one room, its weekly
schedule, prices, packages and teacher pay (per class, by how many students came). Its students are
invented and listed by hand there (name, age, plan, payment day); two months of history (26 Sep to
today: attendance, payment screenshots, trial classes, registration fees, teacher payments) are
generated from each one's plan, so the director's numbers add up. The director (Ana Torres) switches to
it from the school line under each title.

A few more sample values live elsewhere: the teacher pay rules and payments in `src/mock/pay.ts`,
the director's summary numbers in `src/mock/insights.ts`, the admin's school list and billing in
`src/screens/admin/Admin.tsx` (`SCHOOL_ROWS`, `DETAILS`), and the dashboard's to-dos in
`src/screens/director/DirectorMain.tsx`. Edit, save, and the dev server reloads.

## Demo hosting

Render static site from this repo (`main`): build `npm ci && npm run build`, publish `dist`,
environment `NODE_VERSION=20`, `VITE_APP_HOST=lyra.kokoasoft.com`, `VITE_ADMIN_HOST=lyra.admin.kokoasoft.com`;
custom domains `lyra.kokoasoft.com` and `lyra.admin.kokoasoft.com`. In Cloudflare, a `CNAME lyra` and a
`CNAME lyra.admin` to the Render address, DNS only until Render issues the certificate, then proxied with SSL Full
(strict). The page is marked `noindex` while it's a demo.

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
