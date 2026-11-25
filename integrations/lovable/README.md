# Ruta in a Lovable project

Ruta runs server-side, next to your provider keys, in front of every AI call. Paste `PROMPT.md` into your Lovable project's chat, adjusted to your stack, or follow these steps.

1. **Install**: `bun add github:walak-dev/ruta#v0.2.0` (or `npm install`). The repo ships a built `dist/`, so git installs work without a build step. On Supabase Edge (Deno) you can import `dist/ruta.bundle.mjs`, a single file.
2. **Catalog**: build it from your own routes table (exact model ids plus USD per 1M tokens) with `catalogFromRows()`. No aliases, no third-party auto-routers.
3. **Wire it**: call `ruta.decide()` before your AI call. `instant` and `cache` answers skip the model; `model` gives you `decision.model` and `decision.maxOutputTokens` for your existing call; `refuse` gives a plain reason. After the call, `ruta.record(decision, { ok, inTok, outTok, sessionId })`.
4. **Shadow first**: set `policy.shadow = true` and log each decision next to what you used, storing hashes and numbers, never prompt text. Compare for two weeks, then switch per feature.
5. **Customers see tier names only**: show `decision.explain.customer.es` (for example "Rápida: es una pregunta corta. Costo estimado: 0,02 créditos."). Keep `explain.admin` for admin screens.
6. **Money stays deterministic**: when `decision.aiMayExecute` is false, the AI may draft but your audited code executes, and `confirmRequired` means a person confirms first.
