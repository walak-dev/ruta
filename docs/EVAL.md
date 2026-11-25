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

Measured on 0.2.0 with the round-1 review fixes. These phrases were used while writing the rules, so treat the scores as an upper
bound, not as accuracy on new messages.

| Language | Items | SAFETY-1 | SAFETY-2 | USE-1 | USE-2 | LANG |
|---|---|---|---|---|---|---|
| es | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 100% (71/71) |
| en | 77 | 100% (38/38) | 100% (30/30) | 95.7% (22/23) | 96.0% (24/25) | 97.3% (71/73) |
| pt | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 95.9% (70/73) |
| fr | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 100% (72/72) |
| de | 77 | 100% (38/38) | 100% (30/30) | 100% (23/23) | 100% (25/25) | 98.6% (70/71) |
| all | 385 | 100% (190/190) | 100% (150/150) | 99.1% (114/115) | 99.2% (124/125) | 98.3% (354/360) |

## Held-out phrases

Phrases written by independent evaluators who did not see the rules, decided the same way as the corpus.

### Round 1 (before fixes)

Measured on 0.2.0 as first committed (188 phrases in two sets, summed per language). "adversarial" is a
subset of the rows above (counted in them too), not extra phrases.

| Language | SAFETY-1 | SAFETY-2 | USE-1 | USE-2 | LANG |
|---|---|---|---|---|---|
| es | 97.1% (34/35) | 100% (30/30) | 100% (16/16) | 83.3% (15/18) | 100% (60/60) |
| en | 100% (26/26) | 100% (23/23) | 100% (9/9) | 88.9% (8/9) | 95.1% (39/41) |
| pt | 100% (18/18) | 100% (15/15) | 100% (7/7) | 88.9% (8/9) | 93.3% (28/30) |
| fr | 100% (16/16) | 100% (14/14) | 100% (6/6) | 83.3% (5/6) | 100% (25/25) |
| de | 100% (16/16) | 100% (14/14) | 100% (6/6) | 66.7% (4/6) | 100% (24/24) |
| all | 99.1% (110/111) | 100% (96/96) | 100% (44/44) | 83.3% (40/48) | 97.8% (176/180) |
| adversarial | 100% (11/11) | 100% (11/11) | n/a (0/0) | n/a (0/0) | 100% (11/11) |

After round 1 these phrases were used to improve the rules (the failures that were fixed are kept in
`test/corpus/heldout-round1.json`, where the tests check SAFETY only), so they are no longer unseen and a
fresh held-out round follows.

### Round 2 (before fixes)

A fresh set of 125 phrases (25 per language), written after round 1 by an evaluator who had not seen the
rules or the earlier sets. Measured on 0.2.0 with the round-1 fixes.

| Language | SAFETY-1 | SAFETY-2 | USE-1 | USE-2 | LANG |
|---|---|---|---|---|---|
| es | 100% (14/14) | 100% (12/12) | 100% (7/7) | 83.3% (5/6) | 100% (25/25) |
| en | 100% (14/14) | 100% (12/12) | 71.4% (5/7) | 66.7% (4/6) | 100% (25/25) |
| pt | 100% (14/14) | 100% (12/12) | 85.7% (6/7) | 50.0% (3/6) | 100% (25/25) |
| fr | 92.9% (13/14) | 100% (12/12) | 100% (7/7) | 66.7% (4/6) | 100% (25/25) |
| de | 92.9% (13/14) | 100% (12/12) | 100% (7/7) | 66.7% (4/6) | 100% (25/25) |
| all | 97.1% (68/70) | 100% (60/60) | 91.4% (32/35) | 66.7% (20/30) | 100% (125/125) |

Three of the 125 phrases turned out to match earlier tuning data (all passed); without them USE-1 is 31/34
and LANG 122/122.

What failed:

- SAFETY-1, two money actions labelled `none`: "Règle ma facture d'électricité avec mon portefeuille" (the
  verb régler was missing) and "Zeig mir mein Guthaben und heb dann 100 Euro ab" (the clause split at
  "dann" separated "heb" from "ab"). Both are fixed in 0.2.0 and kept in `test/corpus/heldout-round2.json`.
  On the same 125 phrases after the fix, SAFETY-1 is 70/70; nothing else changed.
- USE-1, three harmless messages labelled `money` (they cost a stronger tier and a confirmation): "Send my
  best wishes to the whole team", "Can you transfer me to a real person?", "Manda um abraço para a equipe
  toda".
- USE-2, ten messages that could skip the model went to it: thanks and greetings with extra words ("Merci
  beaucoup pour votre aide", "Olá, tudo bem com vocês?"), one balance and one status question. The
  greeting and thanks lists were closed on purpose in round 1 so they never swallow a second request; this
  is the price.

Also measured on this set and not a published metric: 8 of 10 money questions ("What's the fee to send money
to Honduras?") are labelled `money`, which costs a stronger tier, not safety.

After round 2 these phrases are development data too. The next fresh round is the one to trust.

