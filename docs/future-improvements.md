# Future improvements

Ideas agreed as worth doing later, with what was decided so far. Not part of the first version;
CLAUDE.md stays the spec of what's built.

## Automatic translation of what people type

**Why:** the app is in Spanish and English (every app text goes through `t()`), but what people
write themselves stays in the language they wrote it in. Offering the English version to schools
with English-speaking teachers, or students, means their posts should reach Spanish readers in
Spanish, and the other way round.

**What would be translated**

| Content | Translate? |
|---|---|
| Board posts (teacher and director notes) | Yes: the main case |
| Screenshot rejection reasons | Yes |
| Health conditions | Not by default: sensitive data under the LFPDPPP, and a wrong translation of an allergy is riskier than of a class note. Only if the school's terms say they may be sent to a translator |
| Relationships (emergency contacts, pickup people) | No need: already a dropdown of keys shown in each reader's language; only "Other…" keeps what was typed |
| Names (classes, rooms, people, schools) | Never: they're names |
| Admin and school notes | No: only their writer reads them |

Schedule and price notices the database posts are already built from app texts, so they need no
translation.

**How**

1. Translate when a text is saved, not when it's read: an Edge Function detects its language and
   stores the translation into the other one beside the original (`body_es`, `body_en`,
   `source_lang`), so each text is translated once and every reader sees the same translation.
2. A reader in the other language sees the translation with a small "Traducido automáticamente ·
   Ver original" line that switches to the original.
3. Both ways: someone writes in their own language and never has to choose.
4. Translator: a Claude model (Haiku: fast, cheap, good with Mexican Spanish and art vocabulary) or
   DeepL, called from the Edge Function so the key never reaches the app. Short texts: the cost per
   school per month is small. No new app dependency (an HTTP call, like the Resend emails).

**Decisions still open**

- Whether to translate health conditions at all (and then the terms' wording, rule 13).
- Which translator, and its data processing agreement.
- Whether a writer can correct a translation, or only the original.
