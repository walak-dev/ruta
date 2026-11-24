/**
 * Every pick is explained twice: plain, short, tier-only words for customers
 * ("Lectura fácil"), and the full numbers for admins.
 */
const TASK = {
    greeting: { es: "un saludo", en: "a greeting" }, thanks: { es: "un agradecimiento", en: "a thank-you" },
    faq: { es: "una pregunta frecuente", en: "a common question" }, intent_topup: { es: "una recarga", en: "a top-up" },
    status_check: { es: "una consulta de estado", en: "a status check" }, balance_check: { es: "una consulta de saldo", en: "a balance check" },
    chat: { es: "una pregunta", en: "a question" }, extract: { es: "sacar datos", en: "pulling out data" },
    classify: { es: "clasificar", en: "sorting" }, summarize: { es: "un resumen", en: "a summary" },
    translate: { es: "una traducción", en: "a translation" }, write_short: { es: "un texto corto", en: "a short text" },
    write_long: { es: "un texto largo", en: "a long text" }, code_small: { es: "un cambio pequeño", en: "a small change" },
    code_feature: { es: "una función nueva", en: "a new feature" }, code_debug: { es: "arreglar un error", en: "fixing an error" },
    architecture: { es: "diseñar un sistema", en: "designing a system" }, plan: { es: "un plan", en: "a plan" },
    analysis: { es: "un análisis", en: "an analysis" }, vision: { es: "leer una imagen", en: "reading an image" },
    agent_orchestrate: { es: "coordinar agentes", en: "coordinating agents" },
};
const RISK = {
    money: { es: "dinero", en: "money" }, auth_security: { es: "seguridad o acceso", en: "security or sign-in" },
    identity_kyc: { es: "identidad", en: "identity" }, legal_compliance: { es: "temas legales", en: "legal matters" },
    pii: { es: "datos personales", en: "personal data" }, none: { es: "nada sensible", en: "nothing sensitive" },
};
export function taskName(t, lang) { return TASK[t][lang]; }
export function riskName(r, lang) { return RISK[r][lang]; }
export function fmtNum(n, lang, digits = 2) {
    const v = n === 0 ? 0 : n < 0.01 ? Number(n.toPrecision(1)) : Number(n.toFixed(digits));
    return v.toLocaleString(lang === "es" ? "es-ES" : "en-US", { maximumFractionDigits: v < 0.01 && v > 0 ? 4 : digits });
}
function has(d, code) { return d.reasons.find((r) => r.code === code); }
function mainReason(d, L) {
    const t = d.triage;
    const task = taskName(t.task, L);
    const es = L === "es";
    if (d.path === "refuse") {
        if (has(d, "loop_breaker"))
            return es ? "dos intentos no sirvieron, así que paro para no gastar más. Cuéntame qué esperabas" : "two tries didn't work, so I'm stopping to avoid spending more. Tell me what you expected";
        if (has(d, "budget_refuse"))
            return es ? "esta tarea necesita más créditos de los que tienes hoy" : "this task needs more credits than you have today";
        return es ? "no hay un nivel disponible para esto en tu plan" : "no level on your plan can do this";
    }
    if (d.path === "instant") {
        const k = d.instant?.kind;
        if (k === "topup")
            return es ? "es una recarga: la preparo sin IA y te pido confirmar" : "it's a top-up: prepared without AI, waiting for your confirmation";
        if (k === "slot")
            return es ? "me falta un dato y lo pido sin gastar IA" : "one detail is missing and I ask for it without AI";
        if (k === "status" || k === "balance")
            return es ? "lo busco directo en el sistema, sin IA" : "looked up directly in the system, no AI";
        return es ? `es ${task}, respondí sin IA` : `it's ${task}, answered without AI`;
    }
    if (d.path === "cache")
        return es ? "ya respondimos esto hace poco" : "we answered this a moment ago";
    if (has(d, "risk_pin"))
        return es ? `toca ${riskName(t.risk, L)}, así que uso un nivel más fuerte` : `it touches ${riskName(t.risk, L)}, so I use a stronger level`;
    if (has(d, "budget_downgrade"))
        return es ? "te quedan pocos créditos hoy, así que uso un nivel más barato" : "you have few credits left today, so I use a cheaper level";
    if (has(d, "budget_short"))
        return es ? "te quedan pocos créditos hoy, así que la respuesta será más corta" : "you have few credits left today, so the answer will be shorter";
    if (d.sticky)
        return es ? "sigo con el mismo nivel porque ya leyó tu proyecto y cambiar costaría más" : "staying on the same level because it already read your project and switching would cost more";
    if (has(d, "local_first") || has(d, "offline"))
        return es ? "uso el modelo del equipo: gratis y sin internet" : "using the on-device model: free and offline";
    if (has(d, "task_complex"))
        return es ? `es ${task} con varias partes` : `it's ${task} with several parts`;
    if (has(d, "task_simple"))
        return es ? `es ${task} y es simple` : `it's ${task} and simple`;
    return es ? `es ${task}` : `it's ${task}`;
}
export function explain(d, policy) {
    const out = { customer: { es: "", en: "" }, admin: { es: "", en: "" } };
    for (const L of ["es", "en"]) {
        const es = L === "es";
        const label = d.tierLabel[L];
        const cost = d.path === "model" ? fmtNum(d.estimate.credits, L) : "0";
        const one = cost === "1";
        const unit = es ? (one ? "crédito" : "créditos") : one ? "credit" : "credits";
        const parts = [`${label}: ${mainReason(d, L)}.`];
        if (d.path === "model")
            parts.push(es ? `Costo estimado: ${cost} ${unit}.` : `Estimated cost: ${cost} ${unit}.`);
        else if (d.path !== "refuse")
            parts.push(es ? "Costo: 0 créditos." : "Cost: 0 credits.");
        if (d.confirmRequired)
            parts.push(es ? "Nada se ejecuta sin tu confirmación." : "Nothing runs without your confirmation.");
        out.customer[L] = parts.join(" ");
        const t = d.triage;
        const chosen = d.candidates.find((c) => c.model === d.model);
        const a = [];
        if (d.path === "model" && d.model) {
            a.push(`${d.model} (${d.provider}, ${label}) p=${chosen ? chosen.pSuccess.toFixed(2) : "?"}`);
            a.push(`${es ? "intento" : "attempt"} ≈ US$${fmtNum(d.estimate.usd, L, 4)}, ${es ? "reserva" : "reserve"} US$${fmtNum(d.estimate.reserveUsd, L, 4)}, ${es ? "siempre-máximo" : "always-max"} US$${fmtNum(d.estimate.baselineUsd, L, 4)} (${d.estimate.savingsPct}% ${es ? "menos" : "less"})`);
            a.push(`max_out ${d.maxOutputTokens}`);
        }
        else {
            a.push(`${d.path}${d.instant ? `:${d.instant.kind}` : ""}`);
        }
        a.push(`${es ? "tarea" : "task"} ${t.task} d=${t.difficulty.toFixed(2)} ${es ? "riesgo" : "risk"} ${t.risk} ${es ? "idioma" : "lang"} ${t.lang} conf=${t.confidence.toFixed(2)}`);
        a.push(`${es ? "razones" : "reasons"}: ${d.reasons.map((r) => r.code).join(", ") || "-"}`);
        if (d.escalation.length)
            a.push(`${es ? "si falla" : "if it fails"}: ${d.escalation.map((e) => `${e.model} (${e.tier})`).join(" > ")}`);
        if (d.contextPlan.droppedTurns)
            a.push(`${es ? "contexto" : "context"}: -${d.contextPlan.droppedTurns} ${es ? "turnos" : "turns"}, -${d.contextPlan.savedTokens} tok`);
        a.push(`${es ? "pensar" : "think"} ${d.thinkMs.toFixed(1)} ms${d.shadow ? (es ? " (modo sombra)" : " (shadow mode)") : ""}`);
        out.admin[L] = a.join(". ") + ".";
    }
    if (policy.customerWording === "tier" && d.model) {
        // Guarantee: customer text never names a model or provider.
        for (const L of ["es", "en"]) {
            out.customer[L] = out.customer[L].split(d.model).join(d.tierLabel[L]);
            if (d.provider)
                out.customer[L] = out.customer[L].split(d.provider).join("");
        }
    }
    return out;
}
export function langKey(l) { return l === "en" ? "en" : "es"; }
