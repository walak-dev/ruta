import type { Decision, Lang, Path, ReasonCode, RiskClass, TaskType } from "./types.js";
/** What is safe to log about a decision: routing facts only, no text the person wrote. */
export interface LogRecord {
    id: string;
    path: Path;
    tier?: string;
    model?: string;
    provider?: string;
    task: TaskType;
    risk: RiskClass;
    riskHits: RiskClass[];
    lang: Lang;
    confirmRequired: boolean;
    aiMayExecute: boolean;
    maxOutputTokens: number;
    estimate: {
        usd: number;
        reserveUsd: number;
        baselineUsd: number;
        savingsPct: number;
        credits: number;
        baselineCredits: number;
    };
    thinkMs: number;
    shadow: boolean;
    reasons: ReasonCode[];
}
/**
 * A PII-safe view of a Decision for logs and metrics. It copies an allow-list of fields and nothing else:
 * never the message, the masked text, `masked.map` (which holds the original emails, phones, cards and IBANs),
 * instant answers or intents, cached answers, cache keys or explanations. Log this, never the Decision itself.
 */
export declare function toLogRecord(d: Decision): LogRecord;
