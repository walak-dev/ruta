/**
 * A PII-safe view of a Decision for logs and metrics. It copies an allow-list of fields and nothing else:
 * never the message, the masked text, `masked.map` (which holds the original emails, phones, cards and IBANs),
 * instant answers or intents, cached answers, cache keys or explanations. Log this, never the Decision itself.
 */
export function toLogRecord(d) {
    const e = d.estimate;
    return {
        id: d.id,
        path: d.path,
        ...(d.tier ? { tier: d.tier } : {}),
        ...(d.model ? { model: d.model } : {}),
        ...(d.provider ? { provider: d.provider } : {}),
        task: d.triage.task,
        risk: d.triage.risk,
        riskHits: [...d.triage.riskHits],
        lang: d.triage.lang,
        confirmRequired: d.confirmRequired,
        aiMayExecute: d.aiMayExecute,
        maxOutputTokens: d.maxOutputTokens,
        estimate: {
            usd: e.usd,
            reserveUsd: e.reserveUsd,
            baselineUsd: e.baselineUsd,
            savingsPct: e.savingsPct,
            credits: e.credits,
            baselineCredits: e.baselineCredits,
        },
        thinkMs: d.thinkMs,
        shadow: d.shadow,
        reasons: d.reasons.map((r) => r.code),
    };
}
