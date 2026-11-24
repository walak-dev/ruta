---
name: ruta
description: Think-first model routing and AI cost control. Use this whenever someone wants to choose which AI model should handle a request, cut token or AI spend, set budgets or credits for AI features, plan an agent swarm or subagents (which agent gets which model), choose between Haiku, Sonnet and Opus or cheap versus frontier models, build an app feature that calls LLMs (Lovable, WhatsApp bots, SaaS), or stop retry loops that burn tokens, even if they never say "router".
---

# Ruta: decide before you spend

Ruta picks the cheapest path that will actually work for one request: no model at all, a saved answer, a quick model, or a strong one. It routes on risk before complexity, explains every pick, and stays inside a budget. The decision itself costs almost nothing, so thinking first is always worth it.

## The six stops (usually under 5 ms)

1. **Instant**: greetings, FAQs, status or balance lookups and structured intents (a top-up with amount and number) need no model. Money is never moved here; the intent goes to deterministic code with a confirmation.
2. **Memory**: reuse a recent answer only if it is not personal and not risky.
3. **Read**: task, difficulty, risk, language and context size from cheap signals.
4. **Ask**: only when unsure, a tiny model classifies the request. It may change the task or difficulty, never the risk. With no tiny model, round up one level.
5. **Select**: the lowest expected cost to a usable answer, `attempt + (1 − p) × (next tier + cost of a wrong answer)`, inside plan and risk rules. A cheap model that fails often loses.
6. **Budget**: shorten the answer, then step down a tier (only if nothing sensitive), then refuse. Never overspend.

## How to use it here

- If scripts can run, call the bundled engine: `node scripts/ruta.mjs "<request>" --channel studio --admin`. Options: `--stage plan|build|review`, `--role orchestrator|worker|reviewer`, `--context <chars>`, `--budget <usd left>`, `--en`, `--json`.
- If the `ruta` MCP server is connected, call `ruta_decide` (and `ruta_estimate` for a cost table) instead.
- Otherwise apply the rubric below by hand.

Report the pick in one line with the reason and the cost, for example: "Sonnet: a new feature with several parts, about $0.01. Climb to Opus only if the tests fail."

## Rubric when no script is available

| Request | Tier (Claude Code alias) |
|---|---|
| Greeting, FAQ, status or balance lookup, structured intent | No model |
| Classify, extract, translate, short text, small UI edit | Rápida (`haiku`) |
| New feature, debugging, analysis, plans, long writing | Pro (`sonnet`) |
| System design, multi-part migrations, orchestration, huge context | Experta (`opus`) |

Risk overrides complexity: anything touching money, sign-in or security, identity or KYC, or legal terms gets at least Pro and a human confirmation, and AI never executes money movement. A two-line auth change is not a small change.

## Habits that save the most

- Output tokens cost the most: cap them per task, and keep chat channels like WhatsApp under about 300 tokens with plain words.
- Send a stable prefix first (system text, schemas), then the spec, then only the last 4 turns. It makes provider caches hit.
- Don't switch models mid-task while the provider has your prefix cached. Switch at task boundaries, or when switching is clearly cheaper.
- Plan on the strong model, build on the cheaper one, review on the strong one.
- Verify, climb once, stop. After two failed answers, ask the person instead of looping.
- When unsure about difficulty, round up.

## Agent swarms

Orchestrators and reviewers get at least Pro; workers at most Pro, usually Rápida. Give the swarm one shared budget and a loop breaker per agent so one stuck agent can't drain the rest. In Claude Code, map tiers to subagent models: rapida → haiku, pro → sonnet, experta → opus.

## Building it into an app

The engine is dependency-free TypeScript (Node, Deno, Bun, Workers, browser):

```ts
import { createRuta } from "@walak-dev/ruta";
const ruta = createRuta({ catalog, policy: { allowTiers: ["rapida", "pro"], shadow: true } });
const d = await ruta.decide({ message, channel: "whatsapp", sessionId, budget: { remainingUsd } });
// d.path: "instant" | "cache" | "model" | "refuse"; d.model, d.maxOutputTokens, d.explain.customer.es
ruta.record(d, { ok, inTok, outTok, sessionId });
```

Start in shadow mode: log what Ruta would pick beside what runs today, compare for two weeks, then switch. Customers see tier names only ("Rápida", "Pro"), never vendors or model names.

## Honest limits

The default catalog's prices are illustrative, so load real ones. The rules are strongest in Spanish and English. Success odds start as priors and only get good once real outcomes flow back through `record()`.
