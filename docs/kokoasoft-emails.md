# Kokoasoft email addresses

One list for every Kokoasoft product (Lyra, Paws & Pockets…), so each app reuses these addresses
instead of creating new ones. All of them are in English. Add a row here before an app uses a new one.

The `kokoasoft.com` mailboxes are what people write to. `mail.kokoasoft.com` is the subdomain
verified in Resend: apps **send** from it and nobody writes to it. One sender serves every product;
the display name says which product it is (`Lyra <no-reply@mail.kokoasoft.com>`).

How they reach your Gmail and how you send from them: [`kokoasoft-email-setup.md`](kokoasoft-email-setup.md).

## In use

| Address | What it's for | Used by | Mailbox needed |
|---|---|---|---|
| `admin@kokoasoft.com` | The platform admin's sign-in (each app's admin panel) | Paws & Pockets (`pawsandpockets.admin.kokoasoft.com`); Lyra's admin panel when it goes live | Yes: password and invitation links arrive here |
| `privacy@kokoasoft.com` | Personal data: rights requests (access, correction, deletion), consent, privacy questions | Lyra's terms and privacy notice (`src/lib/legal.ts`) | Yes: requests must be answered within 20 business days (LFPDPPP) |
| `no-reply@mail.kokoasoft.com` | Sender of every app email (invitations, payment notices, password links), through Resend | Paws & Pockets and Lyra (`EMAIL_FROM` in each Edge Function's secrets; Supabase Auth's SMTP sender) | No: send-only |

## Ready for when they're needed

Create the mailbox (or an alias forwarding to the owner) only when a product starts showing the address.

| Address | What it's for |
|---|---|
| `support@kokoasoft.com` | Help with an app: schools, directors and users who can't sign in or find something |
| `billing@kokoasoft.com` | Schools' and clinics' monthly fees to the platform, invoices and tax details |
| `hello@kokoasoft.com` | General contact and new customers (the kokoasoft.com site) |
| `security@kokoasoft.com` | Reports of security problems in any app |
| `legal@kokoasoft.com` | Contracts, terms of service and legal notices |

## Rules

- English local parts only (`privacy`, not `privacidad`), whatever language the app is in.
- No new address per product (`lyra-support@…`): the product goes in the email's subject or display name.
- Apps never use a personal address (no `@outlook.com` or `@gmail.com` in code, docs or settings).
- Test logins are `prueba.…@kokoasoft.com` (`prueba.admin@`, `prueba.maestra@`…), never one of the addresses above, and
  have no mailbox: see `docs/test-accounts.md`. The `prueba.` prefix is reserved for them.
