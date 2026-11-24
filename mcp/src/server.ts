import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRuta, attemptUsd, estTokens, detectLang, DEFAULT_CAPS, type ModelSpec, type Policy, type RouteRequest } from "../../src/index.js";

// Config via env: RUTA_CATALOG (JSON array of ModelSpec), RUTA_POLICY (partial Policy JSON),
// RUTA_CLAUDE_MAP (tier -> Claude Code model alias).
const readJson = <T>(file?: string): T | undefined => (file ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined);
const catalog = readJson<ModelSpec[]>(process.env["RUTA_CATALOG"]);
const policy = readJson<Partial<Policy>>(process.env["RUTA_POLICY"]);
const claudeMap: Record<string, string> = JSON.parse(process.env["RUTA_CLAUDE_MAP"] ?? '{"local":"haiku","rapida":"haiku","pro":"sonnet","experta":"opus"}');
const ruta = createRuta({ ...(catalog ? { catalog } : {}), ...(policy ? { policy } : {}) });
const usingExample = !catalog;

const server = new McpServer({ name: "ruta-mcp-server", version: "0.1.0" });

const Channel = z.enum(["whatsapp", "sms", "web", "app", "studio", "agent", "api", "cli"]);

server.registerTool(
  "ruta_decide",
  {
    title: "Decide the model for a request",
    description: `Think before spending: decide the cheapest path that will work for ONE request (no AI, cached, or a model tier), with the risk class, output cap, cost estimate, escalation ladder and a plain explanation.

Use before starting a task to pick a model or Claude Code alias (/model haiku|sonnet|opus), before dispatching subagents, or to check what a message would cost. Read-only: it never calls a model.

Args:
  - message (string): the request text
  - channel: whatsapp|sms|web|app|studio|agent|api|cli (default cli)
  - stage: plan|build|review (optional; plans deserve stronger reasoning)
  - role: user|orchestrator|worker|reviewer (optional, for agent swarms)
  - context_chars (number): size of files/spec you will send with it
  - budget_usd (number): money left; Ruta shortens, steps down, or refuses to stay inside it
  - lang: es|en for the explanation (default: detected)

Returns JSON: { path, tier, model, claude_code_model, max_output_tokens, risk, task, difficulty, confirm_required, ai_may_execute, estimate_usd, baseline_usd, savings_pct, escalation, explanation, admin }`,
    inputSchema: {
      message: z.string().min(1).max(50_000).describe("The request text, e.g. 'add a dark mode toggle to settings'"),
      channel: Channel.optional(),
      stage: z.enum(["plan", "build", "review"]).optional(),
      role: z.enum(["user", "orchestrator", "worker", "reviewer"]).optional(),
      context_chars: z.number().int().min(0).max(5_000_000).optional().describe("Characters of extra context (files, spec) you will send"),
      budget_usd: z.number().min(0).optional().describe("USD left for this request or session"),
      lang: z.enum(["es", "en"]).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (a) => {
    const req: RouteRequest = { message: a.message, channel: a.channel ?? "cli" };
    if (a.stage) req.stage = a.stage;
    if (a.role) req.role = a.role;
    if (a.context_chars) req.contextChars = a.context_chars;
    if (a.budget_usd !== undefined) req.budget = { remainingUsd: a.budget_usd };
    const d = await ruta.decide(req);
    const L = a.lang ?? (d.triage.lang === "en" ? "en" : "es");
    const out = {
      path: d.path,
      tier: d.tier ?? null,
      model: d.model ?? null,
      claude_code_model: d.tier ? claudeMap[d.tier] ?? null : null,
      max_output_tokens: d.maxOutputTokens,
      risk: d.triage.risk,
      task: d.triage.task,
      difficulty: Number(d.triage.difficulty.toFixed(2)),
      confirm_required: d.confirmRequired,
      ai_may_execute: d.aiMayExecute,
      estimate_usd: Number(d.estimate.usd.toFixed(6)),
      baseline_usd: Number(d.estimate.baselineUsd.toFixed(6)),
      savings_pct: d.estimate.savingsPct,
      escalation: d.escalation.map((e) => e.tier),
      explanation: d.explain.customer[L],
      admin: d.explain.admin[L],
      note: usingExample ? "Illustrative catalog: set RUTA_CATALOG to your models and prices." : undefined,
    };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
  },
);

server.registerTool(
  "ruta_estimate",
  {
    title: "Estimate a request's cost on every model",
    description: `Cost preview for one request across every model in the catalog (input from the message plus context, output from the task's usual cap). Read-only.

Args:
  - message (string)
  - context_chars (number, optional)
  - output_tokens (number, optional): override the expected output length

Returns JSON: { input_tokens, output_tokens, rows: [{ tier, model, usd }] } sorted cheapest first.`,
    inputSchema: {
      message: z.string().min(1).max(50_000),
      context_chars: z.number().int().min(0).max(5_000_000).optional(),
      output_tokens: z.number().int().min(1).max(200_000).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (a) => {
    const d = await ruta.decide({ message: a.message, channel: "cli", ...(a.context_chars ? { contextChars: a.context_chars } : {}) });
    const lang = detectLang(a.message);
    const chars = a.message.length + (a.context_chars ?? 0);
    const inTok = estTokens(chars, lang);
    const outTok = a.output_tokens ?? Math.round((DEFAULT_CAPS[d.triage.task] ?? 500) * 0.5);
    const rows = ruta.catalog
      .map((m) => ({ tier: m.tier, model: m.id, usd: Number(attemptUsd(m, inTok, outTok).toFixed(6)) }))
      .sort((x, y) => x.usd - y.usd);
    const out = { input_tokens: inTok, output_tokens: outTok, rows };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
  },
);

server.registerTool(
  "ruta_catalog",
  {
    title: "List tiers, models and prices",
    description: "Shows the tiers, models and USD-per-million-token prices Ruta is deciding with, and whether they are the illustrative defaults. Read-only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const out = {
      illustrative: usingExample,
      tiers: ruta.policy.tiers.map((t) => ({ id: t.id, rank: t.rank, label: t.label.en, claude_code_model: claudeMap[t.id] ?? null })),
      models: ruta.catalog.map((m) => ({ id: m.id, provider: m.provider, tier: m.tier, input_per_m: m.inputPerM, output_per_m: m.outputPerM, cache_read_per_m: m.cacheReadPerM ?? null })),
    };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out };
  },
);

await server.connect(new StdioServerTransport());
