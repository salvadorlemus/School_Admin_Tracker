# Design brief — Art School Management screen mockups

A brief for Claude Design: mock up the app's main screens with the sample data below. The full spec
is `CLAUDE.md` at the repo root; this file holds only what the mockups need.

## The product

A web app for art schools. Several schools share it; each sees only its own people and records.
Directors run a school, teachers give classes, students (or a parent, for children) check in to
classes by scanning a QR on the teacher's phone and upload payment screenshots. It runs in the
browser, mostly on phones.

## What to make

- **Phone first** (390 × 844) for every student and teacher screen. Director screens on a laptop
  (1280 × 800) too, and they must still work on a phone.
- **Spanish** text in the mockups (the app is in Spanish and English; Spanish is the default).
  Use the texts given here where there are some.
- Real buttons and inputs, large tap targets (44 px at least), visible focus, readable contrast.
- Light and dark versions of at least Home (student) and Session (teacher).
- **Visual direction is yours to choose**: an art school, so warm and creative, but calm and clear
  to use. Not childish, even though some students are children. No stock photos: people's photos are
  placeholders (initials or simple illustrated avatars).
- "TotalPass" is a real payment service: write its name as plain text, never draw a logo.
- Show states, not only the happy path: empty lists, a rejected screenshot, a failed check-in, an
  unread count.

### Colours that carry meaning (keep them consistent everywhere)

| Meaning | Where |
|---|---|
| Substitute teacher | sessions given by another teacher (calendar, schedule, notices) |
| Cancelled | cancelled sessions (struck through, with the replacement if any) |
| Confirmed / Uploaded / Rejected | payment screenshot states |
| Terms pending | a student who hasn't accepted the latest terms |
| Over the plan | a student who went over their monthly plan or weekly package |
| Warning (not an error) | room capacity exceeded: the director can still save |

## Screens to mock, in priority order

1. **Sign in** (everyone): email, password, "¿Olvidaste tu contraseña?", language switch ES / EN.
2. **Registration: student card** (invited student; for a minor, the parent): photo, name, birth
   date, emergency contacts (add more), health conditions, authorized pickup people (minors only, with
   photo), "Declaro que todo lo que escribí aquí es verdad" checkbox (required), Continue.
3. **Registration: terms reader**: the school's PDF inside the app, a progress indicator, the
   **Aceptar** button disabled until the last page, then enabled.
4. **Student — Home**: today's and upcoming sessions from both schools, each labelled with its
   school; the substitute and the cancellation marked; a big **Registrar asistencia** (check in)
   button; unread notices badge.
5. **Student — Check in**: camera view with a scan frame; then the result screens: success ("Listo,
   asistencia registrada · Dibujo de figura humana · 10:02"), and one failure ("El código expiró,
   escanea de nuevo" or "Aún no es hora: abre 10 minutos antes").
6. **Guardian — Check in**: pick which children are here (checkboxes for Mateo and Valentina), then
   scan.
7. **Student — Payments**: package usage this week (2 of 3), what's due and when, screenshots with
   their states, **Subir comprobante**; a second example for Camila with a rejected screenshot and the
   reason.
8. **Student — My card**: the card as the student sees it, with **Editar**.
9. **Notices**: the notices board (schedule changes) and personal notices, unread first.
10. **Teacher — My schedule**: today and this week; the substitute session in its colour.
11. **Teacher — Session**: header (class, room, time), **Mostrar QR** button, the expected list
    with checked-in / not yet, plan type tags, the "Términos pendientes" flag, **Agregar asistencia**
    (available until 1 hour after the end).
12. **Teacher — QR full screen**: big QR, session name, a 30-second countdown ring, "Se renueva cada
    30 segundos".
13. **Teacher — Student card** (opened from the session list): health conditions first and
    prominent, emergency contacts with a call button each, pickup people for a minor.
14. **Director — Dashboard** (laptop and phone): today's sessions by room, the to-do list (below).
15. **Director — Calendar** (laptop): the week by room, a cancelled session with its replacement, a
    substitute session, the capacity warning dialog.
16. **Director — Payments to check**: list of screenshots, a viewer with **Confirmar** / **Rechazar**
    (rejecting asks for a reason).
17. **Director — Register a student**: adult or minor, parent's details for a minor, payment day
    (dropdown: 15 or 30), enroll in classes or give a package.
18. **Director — Terms**: current version, upload a new one, who has and hasn't accepted (41 of 58).
19. **Admin panel — Schools** (laptop): the platform owner's list of schools with status, billing
    state and usage counts. No student data appears here.

## Sample data

All people, schools and numbers are invented. Dates are in 2026; **today is Thursday, 26 November
2026**, around 9:50 am, Mexico City time. Money in Mexican pesos (MXN).

### Schools

| School | Directors | Notes |
|---|---|---|
| **Taller de Arte Colibrí** (main sample) | Ana Torres (also teaches Óleo), Pablo Méndez | 58 students, 6 teachers, 9 classes |
| **Estudio Ámbar** | Irene Castañeda | only appears in Sofía's views (a student in two schools) |

### Rooms (Colibrí)

| Room | Capacity: classes at once | Capacity: students |
|---|---|---|
| Salón 1 | 3 | 30 |
| Salón 2 | 2 | 16 |
| Sala de Cerámica | 1 | 10 |

### Teachers (Colibrí)

Mariana Ruiz, Diego Herrera, Lucía Ortega, Rodrigo Salas, Ana Torres (director who teaches),
Fernanda Gil.

### Classes (Colibrí)

| Class | Teacher | When | Room | How it's paid |
|---|---|---|---|---|
| Dibujo de figura humana | Mariana Ruiz | Tue & Thu 10:00–12:00 | Salón 1 | in packages |
| Acuarela | Lucía Ortega | Mon & Wed 17:00–19:00 | Salón 2 | in packages |
| Óleo | Ana Torres | Sat 10:00–13:00 | Salón 1 | in packages |
| Cerámica en torno | Diego Herrera | Thu 12:00–14:00 | Sala de Cerámica | monthly plan, 4 sessions, $1,600 |
| Dibujo infantil | Mariana Ruiz | Thu 16:00–17:30 | Salón 2 | monthly plan, 4 sessions, $1,200 |
| Taller libre de grabado (free hours) | Fernanda Gil | Fri 27 Nov 18:00–20:00 | Salón 1 | per student: 1 person $450, 2–3 $350, 4 $300; max 4 |

### Prices (Colibrí)

- Registration fee ("Inscripción"): $800.
- Package "3 clases por semana" (Dibujo de figura, Acuarela, Óleo): $2,400 a month.
- Package "2 clases por semana": $1,800 a month.
- Per visit: TotalPass, or cash $250.

### Sessions around today

| Date | Session | Note |
|---|---|---|
| Thu 26 Nov 10:00 | Dibujo de figura humana · Salón 1 · Mariana Ruiz | normal; 7 of 10 checked in by 10:15 |
| Thu 26 Nov 12:00 | Cerámica en torno · Sala de Cerámica | **substitute**: Rodrigo Salas instead of Diego Herrera |
| Thu 26 Nov 16:00 | Dibujo infantil · Salón 2 · Mariana Ruiz | normal |
| Fri 27 Nov 18:00 | Taller libre de grabado · Salón 1 · Fernanda Gil | 3 of 4 places booked |
| Sat 28 Nov 10:00 | Óleo · Salón 1 · Ana Torres | **cancelled**, replaced by Wed 2 Dec 10:00, Salón 1 |
| Sat 28 Nov 10:00 | (capacity example) Óleo + Retrato adding up to 32 students in Salón 1 | **warning**: over 30 |

### Students

| Student | Age | School(s) | Pays | Details for the mockups |
|---|---|---|---|---|
| **Sofía Ramírez Castro** (main student persona) | 27 | Colibrí + Estudio Ámbar | Colibrí: package 3/week, payment day 15. Ámbar: Cerámica monthly, payment day 30 | This week 2 of 3 used. November screenshot (transfer, $2,400) **confirmed**. Ámbar reminder: "Tu pago de Cerámica en Estudio Ámbar vence el 30 nov". Health: "Asma leve; trae inhalador en su mochila". Emergency: Laura Castro (mamá) 55 1234 5678; Javier Ramírez (hermano) 55 8765 4321. Updated her card on 24 Nov |
| **Mateo López Vega** | 9 (minor) | Colibrí | Dibujo infantil, monthly, cash, payment day 30 | Guardian: **Daniela Vega** (mamá). November cash receipt **uploaded**, waiting for the director. Health: "Alergia al cacahuate; la maestra tiene su autoinyector". Pickup: Daniela Vega, Roberto López (papá), Carmen Vega (abuela) |
| **Valentina López Vega** | 12 (minor) | Colibrí | Dibujo infantil, monthly, cash, payment day 30 | Mateo's sister, same guardian (they check in together). November cash receipt **uploaded**. Health: none declared |
| **Andrés Molina** | 34 | Colibrí | per visit, TotalPass | **Terms pending** (version 3 uploaded on 20 Nov, not accepted yet); in today's Dibujo de figura list |
| **Regina Flores** | 45 | Colibrí | Cerámica, monthly, card, payment day 30 | **Over the plan**: 5 of 4 sessions in November. Screenshot (card, $1,600) **uploaded** |
| **Héctor Navarro** | 52 | Colibrí | Cerámica, monthly | Came back after 3 months without paying: **registration fee owed** ($800) |
| **Camila Ortiz** | 19 | Colibrí | Acuarela via package 2/week, payment day 30 | November screenshot **rejected**: "La imagen está borrosa, sube otra por favor". Reminder sent 25 Nov: "Tu pago vence el 30 nov" |
| **Emilio Sánchez** | 17 (minor, turns 18 on 29 Nov) | Colibrí | package 2/week | Guardian: Patricia Sánchez. Director to-do: "Emilio cumple 18 el 29 nov: regístralo como adulto" |

Guest teacher example: **Diego Herrera** checked in to Lucía's Acuarela on Wed 25 Nov as
"Maestro invitado".

### Notices board (Colibrí)

- **26 nov · Cerámica en torno 12:00** — La imparte Rodrigo Salas (suplente).
- **28 nov · Óleo 10:00** — Cancelada. Reposición: miércoles 2 dic, 10:00, Salón 1.
- **A partir del 7 dic · Acuarela** — Nueva maestra: Mariana Ruiz.

Personal notices (Sofía): "Tu pago de Cerámica en Estudio Ámbar vence el 30 nov" (unread);
"Tu comprobante de noviembre fue confirmado" (read). Personal notices (Daniela, for her children):
"Se guardó el pago en efectivo de Mateo" (example for after the director confirms).

### Director dashboard to-dos (Ana Torres, Colibrí)

- 3 comprobantes por revisar: Mateo López (efectivo, $1,200), Valentina López (efectivo, $1,200),
  Regina Flores (tarjeta, $1,600).
- 1 inscripción pendiente: Héctor Navarro ($800).
- 1 alumna sobre su plan: Regina Flores (5 de 4 en noviembre).
- 1 tarjeta modificada: Sofía Ramírez cambió sus condiciones de salud (24 nov).
- 1 alumno cumple 18: Emilio Sánchez (29 nov).
- Términos v3: 41 de 58 alumnos aceptaron.

### Admin panel (platform owner)

| School | Status | Billing | Students | Teachers | Classes | Check-ins (30 days) | Storage |
|---|---|---|---|---|---|---|---|
| Taller de Arte Colibrí | Active | Up to date | 58 | 6 | 9 | 412 | 1.8 of 5 GB |
| Estudio Ámbar | Active | Due on 1 Dec | 31 | 3 | 5 | 198 | 0.6 of 5 GB |
| Casa Pigmento | Disabled | Overdue (Oct) | 22 | 2 | 4 | 0 | 0.4 of 5 GB |

## Rules the screens must respect

- The admin panel shows counts only: never students, cards, attendance or payments.
- A teacher sees only the cards of their own classes' current students; health conditions come
  first on the card, and each emergency phone is a call button.
- Teachers view payment screenshots but can't confirm or reject them; only directors can.
- A teacher can add attendance but never remove it; there's no delete control on their screens.
- Students and parents never pick a school; staff in several schools switch from a menu.
- Texts say what really happens: no "we'll email you" unless an email is really sent (payments,
  invites, terms and data deletion are emailed; schedule changes are not, they go to the board).
