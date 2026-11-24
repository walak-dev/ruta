import type { ModelSpec, Policy, TaskType, Tier } from "./types.js";
export declare const DEFAULT_TIERS: Tier[];
export declare const INSTANT_LABEL: {
    es: string;
    en: string;
};
/**
 * ILLUSTRATIVE catalog so the engine runs out of the box. Model ids and prices are
 * placeholders: load your real routes with catalogFromRows() or catalogFromOpenRouter().
 */
export declare const EXAMPLE_CATALOG: ModelSpec[];
export declare const DEFAULT_CAPS: Record<TaskType, number>;
export declare const DEFAULT_POLICY: Policy;
export declare function mergePolicy(base: Policy, over?: Partial<Policy>): Policy;
/** Rows like SendLatam's ai_routes + ai_model_prices: exact ids only. */
export declare function catalogFromRows(rows: Array<{
    tier: string;
    provider: string;
    model: string;
    input_per_m_usd: number;
    output_per_m_usd: number;
    cache_read_per_m_usd?: number | null;
    context_tokens?: number | null;
}>): ModelSpec[];
/**
 * Builds specs from OpenRouter's public model list (GET /api/v1/models): per-token USD
 * strings become per-million numbers. `pick` maps exact model ids to your tiers.
 */
export declare function catalogFromOpenRouter(json: unknown, pick: Record<string, string>): ModelSpec[];
