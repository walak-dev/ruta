import type { ModelSpec, Policy, TaskType, Tier } from "./types.js";

export const DEFAULT_TIERS: Tier[] = [
  { id: "local", rank: 0, label: { es: "Local", en: "Local" } },
  { id: "rapida", rank: 1, label: { es: "Rápida", en: "Quick" } },
  { id: "pro", rank: 2, label: { es: "Pro", en: "Pro" } },
  { id: "experta", rank: 3, label: { es: "Experta", en: "Expert" } },
];

export const INSTANT_LABEL = { es: "Instantánea", en: "Instant" };

/**
 * ILLUSTRATIVE catalog so the engine runs out of the box. Model ids and prices are
 * placeholders: load your real routes with catalogFromRows() or catalogFromOpenRouter().
 */
export const EXAMPLE_CATALOG: ModelSpec[] = [
  { id: "example/local-small", provider: "local", tier: "local", inputPerM: 0, outputPerM: 0, local: true, contextTokens: 32_000, strengths: { spanish: -0.2, code: -0.3 } },
  { id: "example/quick", provider: "openrouter", tier: "rapida", inputPerM: 0.1, outputPerM: 0.4, cacheReadPerM: 0.025, contextTokens: 128_000, strengths: { json: 0.2, spanish: 0.1 } },
  { id: "example/pro", provider: "openrouter", tier: "pro", inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1, contextTokens: 200_000, strengths: { code: 0.3, reasoning: 0.2, spanish: 0.2, vision: 0.5 } },
  { id: "example/expert", provider: "openrouter", tier: "experta", inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, contextTokens: 200_000, strengths: { code: 0.4, reasoning: 0.4, spanish: 0.2, vision: 0.5 } },
];

export const DEFAULT_CAPS: Record<TaskType, number> = {
  greeting: 60, thanks: 40, faq: 150, intent_topup: 80, status_check: 80, balance_check: 60,
  chat: 500, extract: 800, classify: 60, summarize: 500, translate: 1500, write_short: 300, write_long: 2200,
  code_small: 900, code_feature: 4000, code_debug: 2500, architecture: 3200, plan: 1400, analysis: 1600,
  vision: 700, agent_orchestrate: 1600,
};

export const DEFAULT_POLICY: Policy = {
  tiers: DEFAULT_TIERS,
  riskMinTier: { money: "pro", auth_security: "pro", identity_kyc: "pro", legal_compliance: "pro" },
  riskFloor: { none: 0.55, pii: 0.7, legal_compliance: 0.8, identity_kyc: 0.85, auth_security: 0.85, money: 0.85 },
  failureCostUsd: { none: 0.002, pii: 0.01, legal_compliance: 0.03, identity_kyc: 0.05, auth_security: 0.05, money: 0.1 },
  confirmFor: ["money", "auth_security", "identity_kyc"],
  aiNeverExecutes: ["money", "identity_kyc"],
  roleBounds: { orchestrator: { min: "pro" }, reviewer: { min: "pro" }, worker: { max: "pro" } },
  instant: true,
  cacheTtlMs: 10 * 60 * 1000,
  outputCaps: {},
  shortChannels: ["whatsapp", "sms"],
  shortChannelCap: 300,
  maxEscalations: 1,
  loopBreaker: 2,
  promptCacheTtlMs: 5 * 60 * 1000,
  preferLocal: false,
  offline: false,
  askBelowConfidence: 0.45,
  askTimeoutMs: 1500,
  shadow: false,
  learning: true,
  customerWording: "tier",
  maskPii: "untrusted",
  keepTurns: 4,
  creditUsd: 0.01,
  defaultLang: "es",
};

export function mergePolicy(base: Policy, over?: Partial<Policy>): Policy {
  if (!over) return base;
  return {
    ...base,
    ...over,
    riskMinTier: { ...base.riskMinTier, ...(over.riskMinTier ?? {}) },
    riskFloor: { ...base.riskFloor, ...(over.riskFloor ?? {}) },
    failureCostUsd: { ...base.failureCostUsd, ...(over.failureCostUsd ?? {}) },
    roleBounds: { ...base.roleBounds, ...(over.roleBounds ?? {}) },
    outputCaps: { ...base.outputCaps, ...(over.outputCaps ?? {}) },
  };
}

/** Rows like SendLatam's ai_routes + ai_model_prices: exact ids only. */
export function catalogFromRows(rows: Array<{ tier: string; provider: string; model: string; input_per_m_usd: number; output_per_m_usd: number; cache_read_per_m_usd?: number | null; context_tokens?: number | null }>): ModelSpec[] {
  return rows.map((r) => ({
    id: r.model,
    provider: r.provider,
    tier: r.tier,
    inputPerM: Number(r.input_per_m_usd),
    outputPerM: Number(r.output_per_m_usd),
    ...(r.cache_read_per_m_usd != null ? { cacheReadPerM: Number(r.cache_read_per_m_usd) } : {}),
    ...(r.context_tokens != null ? { contextTokens: Number(r.context_tokens) } : {}),
  }));
}

/**
 * Builds specs from OpenRouter's public model list (GET /api/v1/models): per-token USD
 * strings become per-million numbers. `pick` maps exact model ids to your tiers.
 */
export function catalogFromOpenRouter(json: unknown, pick: Record<string, string>): ModelSpec[] {
  const data = ((json as { data?: unknown[] })?.data ?? []) as Array<{ id?: string; context_length?: number; pricing?: Record<string, string> }>;
  const out: ModelSpec[] = [];
  for (const m of data) {
    const id = m.id ?? "";
    const tier = pick[id];
    if (!tier || !m.pricing) continue;
    const perM = (v?: string) => (v ? Number(v) * 1_000_000 : NaN);
    const inputPerM = perM(m.pricing["prompt"]);
    const outputPerM = perM(m.pricing["completion"]);
    if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) continue;
    const cache = perM(m.pricing["input_cache_read"]);
    out.push({ id, provider: "openrouter", tier, inputPerM, outputPerM, ...(Number.isFinite(cache) ? { cacheReadPerM: cache } : {}), ...(m.context_length ? { contextTokens: m.context_length } : {}) });
  }
  return out;
}
