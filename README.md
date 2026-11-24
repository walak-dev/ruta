# Ruta

**Piensa antes de gastar.** Ruta decide, antes de gastar un solo token, el camino más barato que va a funcionar: sin IA, una respuesta guardada, un modelo rápido o uno fuerte. Pone el riesgo por encima de la complejidad (dinero, seguridad, identidad, legal), explica cada decisión en palabras simples y nunca se pasa del presupuesto. Nació para bodegas por WhatsApp, apps fintech y enjambres de agentes en Latinoamérica, donde cada centavo de IA cuenta.

- La mayoría de los mensajes de una bodega no necesitan IA: saludos, preguntas frecuentes, "¿ya llegó mi recarga?", "recarga 10 al 5355…". Ruta los resuelve con reglas, a 0 créditos, y el dinero siempre pasa por confirmación.
- Cuando sí hace falta un modelo, elige el de **menor costo esperado hasta una respuesta que sirva**, no el más barato por llamada.
- El cliente solo ve el nivel ("Rápida", "Pro") y el porqué. Los nombres de modelos y proveedores quedan para el admin.

---

**Think before you spend.** Ruta is a small, dependency-free TypeScript engine that decides, per message, whether a request needs no model, a cached answer, a quick model or a frontier model, and how many output tokens it may use. It is risk-aware, explainable, budget-first and portable (Node, Deno, Bun, Workers, Supabase Edge, browser). It ships with provider adapters, an MCP server for Claude, a Claude skill, and a Lovable integration kit.

## How it thinks

```
message ─▶ instant ─▶ memory ─▶ read ─▶ ask? ─▶ select ─▶ budget ─▶ decision
           no model   reuse     ~1 ms   only if  expected   shorten,
           needed     safe      signals unsure   cost to    step down,
                      answers                    success    or refuse
```

The thinking usually takes under 5 ms. A tiny model is consulted only when the cheap read is unsure, and it can adjust the task or difficulty but never lower the risk class.

## What's different

Routers exist. This combination doesn't:

1. **The cheapest model is no model.** A zero-AI path for greetings, FAQs, status and balance lookups, and structured intents, with slot filling ("¿A qué número va la recarga?").
2. **Risk beats complexity.** Money, auth and security, identity and KYC, and legal requests get a minimum tier and a confirmation gate. AI can draft money logic but never execute it.
3. **Expected cost to a usable answer.** `attempt + (1 − p) × (next tier + cost of a wrong answer)`. A cheap model that fails often loses to one that works the first time.
4. **Cache-aware stickiness.** Staying on a warm model is priced in, so Ruta keeps a session where the provider already cached your project instead of re-reading it elsewhere.
5. **Output and context diet.** Per-task output caps, short-channel caps for WhatsApp and SMS, and only the last four turns after a stable, cacheable prefix.
6. **Verify, climb once, stop.** One escalation on an unusable answer, then a loop breaker. No token-burning bug loops.
7. **Budget-first.** When credits run low it shortens the answer, then steps down (never for sensitive requests), then says so plainly.
8. **Explains every pick twice.** Plain, tier-only words for customers; model, odds and prices for admins.
9. **Measures the language tax.** Characters-per-token is learned per model and language from real usage instead of assumed.
10. **Local-first and offline.** Local models are a tier; offline mode keeps working when the internet doesn't.
11. **Swarm budgets.** One budget per agent swarm, tier bounds per role, and a loop breaker per agent.
12. **Shadow mode.** Decide and log what Ruta would do beside what you do today, before you switch anything.
13. **Learns your traffic.** Outcomes update success odds per task, model, language and difficulty.
14. **Tamper-evident audit.** Each decision is hash-chained and stores hashes, not prompts.
15. **PII stays home.** Phones, cards (Luhn-checked), emails and IBANs become tokens like `[PHONE_1]` before any untrusted provider sees them.

## Quick start

```bash
npm install github:walak-dev/ruta
```

```ts
import { createRuta, catalogFromRows } from "@walak-dev/ruta";

const ruta = createRuta({
  catalog: catalogFromRows(myRoutes), // exact model ids + USD per 1M tokens
  policy: { allowTiers: ["rapida", "pro"], shadow: true },
  faq: [{ id: "horario", q: ["a que hora abren"], a: { es: "De 8 a 20." } }],
});

const d = await ruta.decide({ message, channel: "whatsapp", sessionId, budget: { remainingUsd } });

switch (d.path) {
  case "instant": reply(d.instant!.answer.es); break;        // 0 credits
  case "cache":   reply(d.cached!); break;                   // 0 credits
  case "refuse":  reply(d.explain.customer.es); break;       // plain reason
  case "model":   await callYourProvider(d.model!, d.maxOutputTokens); break;
}
ruta.record(d, { ok: true, inTok, outTok, sessionId });      // this is how it learns
```

Or let Ruta call, verify and climb:

```ts
import { openrouter, anthropic, bedrock, ollama } from "@walak-dev/ruta/adapters";

const r = await ruta.run(req, {
  adapters: { openrouter: openrouter(KEY), local: ollama() },
  verify: (text) => schema.safeParse(JSON.parse(text)).success,
});
```

Agent swarms:

```ts
import { createSwarm } from "@walak-dev/ruta";
const swarm = createSwarm(ruta, { budgetUsd: 0.5, roles: { worker: { max: "rapida" } } });
const d = await swarm.decide("w1", "worker", { message: "Clasifica estos logs" });
swarm.record("w1", d, { ok: true });
swarm.report(); // spend and savings per agent
```

CLI:

```bash
npx ruta "diseña la arquitectura multi-tenant para bodegas" --channel studio --admin
```

## Use it in Claude

- **MCP server** (Claude Desktop, Claude Code, any MCP client): `mcp/dist/ruta-mcp-server.mjs` is a single file with no install step. Tools: `ruta_decide`, `ruta_estimate`, `ruta_catalog`. Setup in [integrations/claude-code](integrations/claude-code/README.md).
- **Claude skill**: upload `claude/skills/ruta` as a skill. It carries the engine as `scripts/ruta.mjs`, so Claude can run the decision itself.

## Use it in Lovable

See [integrations/lovable](integrations/lovable/README.md): install from GitHub, wire `decide()` in front of your server-side AI call, start in shadow mode, show tier-only reasons to customers.

## Catalog and prices

The built-in catalog is **illustrative** so the engine runs out of the box. Load real routes with `catalogFromRows()` (for example, your own routes table with exact ids and prices) or `catalogFromOpenRouter(await (await fetch("https://openrouter.ai/api/v1/models")).json(), pick)`. Ruta never resolves aliases or third-party auto-routers: you choose the exact models, Ruta chooses among them.

## Policy knobs

| Knob | Default | What it does |
|---|---|---|
| `allowTiers` | all | Tiers a plan may use |
| `riskMinTier` | money, auth, identity, legal → `pro` | Risk beats complexity |
| `riskFloor` | 0.55 … 0.9 | Minimum predicted success per risk class |
| `confirmFor` | money, auth, identity | Human confirmation gate |
| `aiNeverExecutes` | money, identity | AI drafts, deterministic code executes |
| `roleBounds` | orchestrator/reviewer ≥ pro, worker ≤ pro | Swarm roles |
| `shortChannels` / `shortChannelCap` | whatsapp, sms / 300 | Brevity where it matters |
| `keepTurns` | 4 | Context diet |
| `maxEscalations` / `loopBreaker` | 1 / 2 | Climb once, then stop |
| `promptCacheTtlMs` | 5 min | Warm-cache window for stickiness |
| `offline` / `preferLocal` | false | Local-first |
| `shadow` | false | Decide and log only |
| `customerWording` | `tier` | Customers never see vendor or model names |
| `creditUsd` | 0.01 | Display unit for "créditos" |

## Status

v0.1: engine, adapters (OpenRouter and any OpenAI-compatible API, Anthropic, Bedrock, Hugging Face, Ollama), swarm budgets, MCP server, Claude skill, 21 tests. Rules are strongest in Spanish and English. Success odds start as priors and get good once your outcomes flow back through `record()`. Contributions welcome, especially intent rules for more countries and languages.

## License

Apache-2.0
