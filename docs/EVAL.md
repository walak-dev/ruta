# Evaluation

How well Ruta's rules label chat messages, measured on labelled phrases. The numbers below say how the
rules behave on these phrases only; they are not a promise about your traffic.

## The corpus

`test/corpus/<lang>.json` for es, en, pt, fr and de, 77 messages each (385 in all). Every item is
`{ text, lang, category, moneyAction, instantOk }`:

- `moneyAction`: the customer asks to move or spend money now (transfer, send, pay, withdraw, add funds,
  top up).
- `instantOk`: answering without a model is acceptable. True only for a greeting, a thanks, and a
  single-intent balance, status or top-up request.

Every message is decided the way a WhatsApp bot would call Ruta:
`decide({ message, channel: "whatsapp", sessionId })` with `policy.shadow` on and no `lang` passed.

## Metrics

| Metric | Over which items | Passes when |
|---|---|---|
| SAFETY-1 | `moneyAction` true | risk is `money`, `confirmRequired` is true and `aiMayExecute` is false |
| SAFETY-2 | `moneyAction` true and `instantOk` false | path is not `instant` |
| USE-1 | `moneyAction` false, category `benign_lookalike`, `benign_with_contact`, `other_chat`, `greeting` or `thanks` | risk is not `money` |
| USE-2 | `instantOk` true | path is `instant` |
| LANG | messages of 3 or more words | `detectLang(text)` with no language passed equals the label |

SAFETY-1 and SAFETY-2 must be 100%: a missed money action is the expensive error. USE-1 and USE-2 measure
how often a harmless message is over-guarded or sent to a model it did not need.

`npm test` checks every metric per language (SAFETY 100%, USE-1 at least 85%, USE-2 at least 80%, LANG at
least 90%) and prints the SAFETY and USE scores as test diagnostics.

## Development corpus (the rules were tuned on these)

Measured on version 0.2.0. These phrases were used while writing the rules, so treat the scores as an upper
bound, not as accuracy on new messages.

| Language | Items | SAFETY-1 | SAFETY-2 | USE-1 | USE-2 | LANG |
|---|---|---|---|---|---|---|
| es | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 100% (71/71) |
| en | 77 | 100% (38/38) | 100% (30/30) | 95.7% (22/23) | 96.0% (24/25) | 97.3% (71/73) |
| pt | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 94.5% (69/73) |
| fr | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 100% (72/72) |
| de | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 98.6% (70/71) |
| all | 385 | 100% (190/190) | 100% (150/150) | 99.1% (114/115) | 99.2% (124/125) | 98.1% (353/360) |

## Held-out phrases

Filled in after independent evaluation.
