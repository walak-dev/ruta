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
  [docs/EVAL.md](docs/EVAL.md). 84 tests, up from 21; the 21 original tests are kept as they were (only
  reformatted).
- Biome 2.5.6 for lint and format (single quotes, semicolons, trailing commas, 2 spaces, width 100):
  `npm run lint`, `npm run format`.
- `npm run build:all` rebuilds every committed artifact: `dist/`, the single-file bundles, the Claude skill
  script and the MCP server. In 0.1.0 the skill script and the MCP server were built by commands that were
  not in `package.json`, so nothing kept them in step with the source. Both now include the 0.2.0 rules.
- CI on Node 18, 20 and 22 runs lint, the core type-check, `build:all` and the tests, then fails if the
  committed artifacts differ from a fresh build.

## 0.1.0

First release: engine, provider adapters, swarm budgets, MCP server, Claude skill, 21 tests.
