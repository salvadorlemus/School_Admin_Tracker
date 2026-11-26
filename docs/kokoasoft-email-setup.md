# Setting up Kokoasoft's email addresses in Gmail

How to receive and send from the addresses in [`kokoasoft-emails.md`](kokoasoft-emails.md)
(`admin@`, `privacy@`, `support@`…) inside your own Gmail, at no cost, with what Kokoasoft already
has: the domain's DNS at Cloudflare and a Resend account.

- **Receiving**: Cloudflare Email Routing forwards each address to your Gmail.
- **Sending**: Gmail's "Send mail as" sends through Resend's SMTP, so replies leave as
  `privacy@kokoasoft.com` and not your Gmail address.
- `no-reply@mail.kokoasoft.com` needs nothing: the apps already send from it, and nobody writes to it.

Time: about 30 minutes, plus a few minutes for the DNS changes to take effect.

---

## Part 1: Look before changing anything (2 min)

1. Go to <https://dash.cloudflare.com> → **kokoasoft.com** → **DNS** → **Records**.
2. Filter by type **MX**.
   - **None at `kokoasoft.com`**: good, continue. Don't create them by hand: Part 2, step 4 makes
     Cloudflare add them for you. (MX records at other names, such as `send.mail`, are Resend's for the
     apps: leave them.)
   - **Some already there** (for example from another email provider): stop. Email Routing replaces
     them, and that provider would stop receiving. Decide which one you keep first.
   - **`route1.mx.cloudflare.net`, `route2…`, `route3…`**: Email Routing is already on (that's
     probably how `admin@kokoasoft.com` gets the Paws & Pockets emails). Skip to Part 2, step 5.
3. Filter by type **TXT** and look for a record at `kokoasoft.com` that starts with `v=spf1`.
   Remember whether there's one: a domain may have only one SPF record (Part 2, step 4).

The records of `mail.kokoasoft.com` (Resend's, for the apps' emails) aren't touched in any step.

## Part 2: Receive the addresses in Gmail (10 min)

1. Cloudflare → **kokoasoft.com** → **Email** → **Email Routing** → **Get started**
   (or **Enable Email Routing**).
2. When it asks for a first address: **Custom address** `privacy`, **Destination** your Gmail
   address → **Create and continue**.
3. Cloudflare sends a verification email to your Gmail: open it and click **Verify email address**.
   Each destination is verified once; every later address reuses it.
4. Back in Cloudflare, **Add records and enable**. It adds three MX records and one SPF TXT record
   at `kokoasoft.com`.
   - If Part 1 found an SPF record already, Cloudflare offers to merge it: accept. The result must
     be **one** record, for example `v=spf1 include:_spf.mx.cloudflare.net ~all`.
5. **Email Routing** → **Routing rules** → **Create address**, once for each address in use:

   | Custom address | Action | Destination |
   |---|---|---|
   | `admin` | Send to an email | your Gmail |
   | `privacy` | Send to an email | your Gmail (already made in step 2) |

   Add the "ready for later" ones (`support`, `billing`, `hello`, `security`, `legal`) only when a
   product starts showing them; each one is a minute's work.
6. Leave **Catch-all address** off (**Disabled** or **Drop**): with it on, anything @kokoasoft.com
   reaches you, spam included.
7. **Test it**: from another account (your Outlook, for example) write to `privacy@kokoasoft.com`.
   It should arrive in your Gmail within a minute. Look in Spam if it doesn't.

## Part 3: A Resend key just for Gmail (3 min)

Gmail sends through Resend, so Resend has to accept `@kokoasoft.com` as a sender. Today it only
accepts `mail.kokoasoft.com` (the apps').

1. <https://resend.com> → **Domains** → **Add domain** → `kokoasoft.com` → region the same as
   `mail.kokoasoft.com` → **Add**.
2. Resend shows the records to create (DKIM `resend._domainkey`, and an MX and a TXT at `send`).
   In Cloudflare → **DNS** → **Records** → **Add record**, create each one exactly as shown, with
   **Proxy status: DNS only** (grey cloud).
   - They don't clash with Email Routing: Resend's MX lives at `send.kokoasoft.com`, not at
     `kokoasoft.com`.
3. Back in Resend → **Verify DNS records**. Wait until it says **Verified** (minutes, sometimes an hour).
4. Resend → **API Keys** → **Create API key**:
   - Name: `Gmail send as`
   - Permission: **Sending access**
   - Domain: `kokoasoft.com`
   - Copy the key (it starts with `re_`). It shows only once. Keep it in your password manager, not
     in a file in any project.

A separate key means that if it ever leaks, you delete it without touching the apps' key.

## Part 4: Send as each address from Gmail (5 min per address)

On a computer (the phone app can't add it):

1. Gmail → ⚙ → **See all settings** → **Accounts and Import** (or **Accounts**).
2. **Send mail as** → **Add another email address**.
3. Name: `Kokoasoft` (or `Lyra · Kokoasoft`, as you want people to see it). Email: `privacy@kokoasoft.com`.
   Leave **Treat as an alias** ticked → **Next step**.
4. SMTP server:

   | Field | Value |
   |---|---|
   | SMTP Server | `smtp.resend.com` |
   | Port | `587` |
   | Username | `resend` |
   | Password | the `re_…` key from Part 3 |
   | | **Secured connection using TLS** |

   → **Add account**.
5. Gmail sends a confirmation code to `privacy@kokoasoft.com`, which Part 2 forwards to your Gmail.
   Open it and click the link, or paste the code.
6. Repeat 2–5 for `admin@kokoasoft.com` (and later for each new address).
7. In **Accounts and Import**, under **Send mail as**, choose **Reply from the same address the
   message was sent to**. A request that arrived at `privacy@` is then answered from `privacy@`
   without you picking it.

## Part 5: Keep them out of Spam, and find them (3 min)

1. In Gmail's search box, click the filter icon. In **To** write `@kokoasoft.com` → **Create filter**.
2. Tick **Never send it to Spam** and **Apply the label** → **New label** `Kokoasoft` →
   **Create filter**.

## Part 6: Tell receivers what to trust (2 min)

Cloudflare → **DNS** → **Records** → **Add record**:

| Type | Name | Content |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:privacy@kokoasoft.com` |

`p=none` only reports and blocks nothing. After a few weeks without problems it can become
`p=quarantine`. If a `_dmarc` record already exists, edit it instead of adding a second one.

## Part 7: Check it all (5 min)

1. From your Gmail, write to your Outlook choosing **From: privacy@kokoasoft.com**.
2. In Outlook, the sender shows as `privacy@kokoasoft.com`, with no "on behalf of" and not in junk.
3. Reply from Outlook: the reply arrives in Gmail with the `Kokoasoft` label, and answering it goes
   out from `privacy@` by itself.
4. Optional: send one to <https://www.mail-tester.com> to see a score (aim for 9/10 or more).

## Good to know

- **Resend's free plan** sends 100 emails a day and 3,000 a month, **shared** with the apps'
  emails (invitations, payment notices). Personal replies use little; if the apps grow, the paid
  plan lifts it.
- **Replying to a rights request** (`privacy@`): the law gives 20 business days. The label in
  Part 5 keeps them together.
- **Adding an address later**: Part 2, step 5 (receive), then Part 4 (send), then a row in
  [`kokoasoft-emails.md`](kokoasoft-emails.md).
- **Removing access**: delete the address in Cloudflare (stops receiving) and the "Gmail send as" key
  in Resend (stops sending).
