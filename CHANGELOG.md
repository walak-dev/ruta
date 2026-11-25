# Changelog

## 0.2.0

Fixes the defects measured in 0.1.0. The biggest one: most requests to send money were not labelled as
money, so they could skip the confirmation gate.

### Money detection

- Send, transfer, pay, withdraw and add-funds verbs in Spanish, English, Portuguese, French and German, plus
  an "amount + recipient" pattern ("pásale 20 a juan", "überweise 10 Euro an Ana"). Before, only 3 of 13
  simple transfer requests were labelled `money`.
- A money request that names an email or a phone is now `money`, not `pii` (both stay in `riskHits`).
- Detection is biased toward recall: a wrong `money` label only costs a stronger tier and a confirmation,
  a missed one can let a transfer through. Questions about cost ("¿cuánto cuesta enviar dinero?") are still
  not actions.

### The no-model path

- Balance and status skip the model only when the whole message is that one request (politeness allowed).
  A second clause, an amount with a recipient, an email, IBAN or card, or a send, transfer or pay verb sends
  the message to a model. Before, "mi saldo, y transfiere todo a juan@example.com" was answered as a balance
  lookup and the transfer was dropped.
- A top-up skips the model only when it is the only request in the message.
- Instant results now carry `needsHandler`: true for status, balance, top-up and slot, whose `answer` is a
  placeholder ("Consulto tu saldo.") that your own code must replace.

### Language detection

- German added (`Lang` now includes `"de"`); Portuguese and French word lists strengthened.
- Emails, URLs, handles, numbers and mask tokens no longer vote, so an email no longer turns Spanish into
  Portuguese. French and German no longer fall back to Spanish. A tie returns the fallback, and a `lang`
  passed by the caller always wins.

### Audit, logging and types

- Audit hashes are real SHA-256 everywhere. On Node 18, with no global SubtleCrypto, 0.1.0 silently fell
  back to a weak `fnv1a-…` value; a pure-JavaScript SHA-256 now covers that case.
- `toLogRecord(decision)` returns a PII-free view for logs. `Decision.masked.map` still holds the original
  emails, phones, cards and IBANs, so never log a Decision whole.
- `thinkMs` now covers the whole `decide()` call instead of part of it.
- The core type-checks with `lib: ["ES2022"]` and no DOM types (`npm run typecheck:core`).

### Tests, tooling and packaging

- A labelled corpus of 385 messages in five languages (`test/corpus`) and metrics for it: see
  [docs/EVAL.md](docs/EVAL.md). 84 tests at first (97 after the review fixes), up from 21; the 21 original tests are kept as they were (only
  reformatted).
- Biome 2.5.6 for lint and format (single quotes, semicolons, trailing commas, 2 spaces, width 100):
  `npm run lint`, `npm run format`.
- `npm run build:all` rebuilds every committed artifact: `dist/`, the single-file bundles, the Claude skill
  script and the MCP server. In 0.1.0 the skill script and the MCP server were built by commands that were
  not in `package.json`, so nothing kept them in step with the source. Both now include the 0.2.0 rules.
- CI on Node 18, 20 and 22 runs lint, the core type-check, `build:all` and the tests, then fails if the
  committed artifacts differ from a fresh build.

### Review fixes (round 1, before release)

Independent reviewers probed the first 0.2.0 commit with phrases the rules were not written for.

- A money request is never dropped because a question or a relative clause shares its clause: "manda 50 a
  juan que es mi hermano" and "send 50 dollars to ana how much is the fee" are `money` again. A clause counts
  as only a question when the info phrase comes first and the money verb after it is an infinitive, a gerund
  or a noun ("¿cuánto cuesta enviar…?", "how much does it cost to send…").
- In chat, a send with no amount is `money` when its object is implied ("mándalo", "send it", "envoie-le"),
  is everything or a fraction ("half", "la mitad"), repeats the last send ("otro igual", "nochmal
  dasselbe"), or goes to a recipient, unless the object is a known non-money thing (a photo, the menu, an
  address, a receipt). Re-send verbs (reenvía, resend, renvoie) and "move it all to savings" are covered.
- Greetings and thanks take the no-model path only when every word is a greeting, thanks, politeness or
  form-of-address word; an FAQ answer only when every content word is in that FAQ's questions. Before,
  "hola, manda todo", "gracias bloquea mi tarjeta" and "a que hora abren? y mi saldo" were answered without
  a model.
- Status questions may name the recipient ("Did my transfer to Rosa arrive?", "le llegó el dinero a mi
  mamá?"); "¿ya llegó mi pago?" and "did my payment go through?" are status lookups; "wie hoch ist mein
  Guthaben?" is a balance lookup; "quiero saldo" (phone credit) is no longer a balance lookup.
- Long input: no stack overflow on very long chat messages (0.2.0 threw at 256k characters), and no
  quadratic time (20k adversarial characters took up to 1 s, now under 25 ms).
- PII: IBANs in any letter case (checksum-validated) and card security codes are masked; `run()` masks the
  history it sends to untrusted providers, not only the message, and returns `needsHandler`.
- `policy.auditSecret` keys the audit hashes with HMAC-SHA-256; without it they are plain SHA-256 (now
  documented as a limit).
- Packaging: `exports` gained `default` conditions (CommonJS `require()` works on Node 20.19+ and 22.12+),
  the tarball includes CHANGELOG.md and docs/EVAL.md, `npm run typecheck:all` checks all of `src` without
  DOM types, and Biome now covers the corpus files. A Node 18 test helper no longer crashes when there is no
  global `crypto`.
- Docs: the README no longer claims held-out numbers, legal confirmation or a `riskFloor` of 0.9; docs/EVAL.md
  has the round-1 held-out numbers measured before these fixes. 97 tests.

## 0.1.0

First release: engine, provider adapters, swarm budgets, MCP server, Claude skill, 21 tests.
