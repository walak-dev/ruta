Add Ruta (think-first model routing, open source: github.com/walak-dev/ruta) to this project. Additive only; don't change existing features, prices or auth.

1. Install `github:walak-dev/ruta#v0.1.0` and create a server-only module `src/lib/ai-router.server.ts`. Build Ruta's catalog from our model table (exact model ids and USD prices per million tokens). Keys stay server-side.
2. Before every server-side AI call, run `ruta.decide()` with the message, channel, session id, recent history and the user's remaining AI budget. If the path is `instant` or `cache`, answer without calling a model. If it's `model`, call the chosen model with `maxOutputTokens`. If it's `refuse`, show the plain reason. After the call, run `ruta.record()` with the outcome and token usage.
3. Start in shadow mode: keep using today's model, and save each decision to a new table `ai_route_decisions` (decision id, feature, would-be tier and model, actual model, estimated cost both ways, task, risk, language, reasons, input hash). Never store prompt or answer text. Admins only can read it.
4. Customers only ever see the tier name and the reason from `explain.customer`, never a vendor or model name. Add a test that scans customer-facing text for vendor names.
5. Add an admin page showing would-be savings, tier mix, how many messages needed no AI, risk pins and top reasons, per feature, with a switch per feature from shadow to live.

Done when: shadow rows appear for real AI calls with no change in behavior or cost; a greeting and a status question are marked as needing no AI; a payment- or login-related request is marked Pro with confirmation; the vendor-name scan passes.
