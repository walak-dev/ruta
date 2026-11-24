import { clamp, estTokens, norm, reserveTokens, words } from "./text.js";
import { clauses, moneyView, signalsOf, tokenize } from "./money.js";
const TASK_RULES = [
    ["architecture", /\b(arquitectura|architecture|system design|disen\w* (?:el |la |un |una )?(?:sistema|plataforma|backend|arquitectura|base de datos|modelo de datos)|design (?:a |the |our )?(?:system|platform|backend|database|data model)|escalab\w*|scalab\w*|multi-?tenant\w*|microservic\w*|modelo de datos|data model|esquema de (?:la )?base|database schema|infraestructura|infrastructure)\b/g, 3],
    ["code_debug", /\b(error\w*|bug\w*|falla\w*|fallo|no funciona|no anda|doesn'?t work|not working|crash\w*|exception|stack ?trace|typeerror|referenceerror|undefined|arregla\w*|fix\w*|debug\w*|se rompio|broken)\b/g, 2.4],
    ["code_small", /\b(cambia\w* (?:el |la |los |las )?(?:color|texto|titulo|boton|botones|fuente|tamano|icono|margen|logo|imagen)|change (?:the )?(?:color|text|title|button|font|size|icon|margin|logo|image)|renombra\w*|rename\w*|typo|padding|margin|alinea\w*|align\w*|centra\w*)\b/g, 2.6],
    ["code_feature", /\b(agrega\w*|anade\w*|crea|crear|creame|construye\w*|build\w*|implement\w*|add (?:a|an|the|new)|nueva? (?:pantalla|pagina|seccion|funcion|vista|tabla)|new (?:screen|page|feature|section|view|table)|integra\w*|conecta\w*|endpoint\w*|webhook\w*|dashboard\w*|formulario\w*|componente\w*|component\w*|pantalla\w*|screen\w*)\b/g, 1.8],
    ["plan", /\b(planea\w*|planifica\w*|plan de|a plan|pasos para|steps to|roadmap|cronograma|timeline|estrategia|strategy|prioriza\w*|prioriti[sz]\w*)\b/g, 1.6],
    ["analysis", /\b(analiza\w*|analy[sz]\w*|calcula\w*|calculat\w*|compara\w*|compare\w*|por que|why|evalua\w*|evaluat\w*|proyecci\w*|projection\w*|forecast\w*|pronostic\w*|demuestra|prove|revisa\w*|review\w*|audita\w*|audit\w*|verifica\w*|verify)\b/g, 1.5],
    ["summarize", /\b(resume\w*|resumen\w*|resumir|summar\w*|tl;?dr|sintetiza\w*|puntos clave|key points)\b/g, 2.6],
    ["translate", /\b(traduc\w*|translat\w*|al ingles|al espanol|al portugues|in english|in spanish|into english|into spanish|en ingles|en espanol)\b/g, 3],
    ["extract", /\b(extrae\w*|extract\w*|saca (?:los |las )?datos|parse\w*|json|campos|fields|factura\w*|invoice\w*|recibo\w*|receipt\w*|ocr)\b/g, 2.2],
    ["classify", /\b(clasifica\w*|classif\w*|categoriza\w*|categori[sz]\w*|etiqueta\w*|spam|sentimiento|sentiment|triage)\b/g, 2.4],
    ["write_long", /\b(articulo\w*|article\w*|ensayo\w*|essay\w*|blog\w*|documento\w*|propuesta\w*|proposal\w*|landing\w*|informe\w*|report\w*|guion\w*|newsletter\w*|manual\w*)\b/g, 2],
    ["write_short", /\b(mensaje\w*|message\w*|correo\w*|email\w*|redacta\w*|responde\w*|reply|tweet\w*|caption\w*|eslogan\w*|slogan\w*)\b/g, 1.4],
    ["agent_orchestrate", /\b(coordina\w*|orquesta\w*|orchestrat\w*|delega\w*|delegat\w*|subagent\w*|enjambre\w*|swarm\w*|agentes)\b/g, 2.6],
];
const CODE_TASKS = new Set(["code_small", "code_feature", "code_debug", "architecture"]);
const CHAT_CHANNELS = ["whatsapp", "sms", "app", "web"];
const CODE_SIGNAL = /```|\b(const|let|function|import|export|return|class|def|async|await|select \*|insert into|create table|npm|bun|tsx|jsx|typescript|react|supabase|sql)\b|[{};]\s*$|=>/m;
const BASE = {
    greeting: 0, thanks: 0, faq: 0.05, intent_topup: 0.05, status_check: 0.05, balance_check: 0.05,
    chat: 0.2, extract: 0.3, classify: 0.15, summarize: 0.3, translate: 0.25, write_short: 0.2, write_long: 0.45,
    code_small: 0.2, code_feature: 0.5, code_debug: 0.5, architecture: 0.8, plan: 0.5, analysis: 0.5,
    vision: 0.35, agent_orchestrate: 0.65,
};
const RISK_RULES = [
    ["auth_security", /\b(auth\w*|login\w*|inicio de sesion|iniciar sesion|cerrar sesion|contrasena\w*|password\w*|jwt|oauth\w*|access token|refresh token|api ?key\w*|bearer|permisos?|permission\w*|rls|rbac|seguridad|security|cifr\w*|encrypt\w*|secret\w*|2fa|mfa|otp|passkey\w*)\b/g],
    ["identity_kyc", /\b(kyc|kyb|identidad|identity|pasaporte\w*|passport\w*|cedula\w*|dni|selfie\w*|documento de identidad|aml|sancion\w*|sanction\w*|pep)\b/g],
    ["legal_compliance", /\b(contrato\w*|contract\w*|terminos y condiciones|terms of service|terms and conditions|privacidad|privacy polic\w*|gdpr|rgpd|legal\w*|ley|leyes|law|laws|compliance|cumplimiento|regulaci\w*|regulat\w*|licencia\w*|licen[cs]e\w*)\b/g],
];
const MONEY = /\b(pagos?|pagar|cobr\w*|transferencia\w*|transfer\w*|remesa\w*|ledger|libro mayor|contabilidad|reembols\w*|refund\w*|devolucion\w*|payout\w*|retiro\w*|retirar|withdraw\w*|stripe|checkout|billetera\w*|wallet\w*|comision\w*|commission\w*|nota de credito|credit memo|liquidacion\w*|settlement\w*|contracargo\w*|chargeback\w*|saldo\w*|payment\w*|monedero)\b/;
const DISPUTE = /\b(reembols\w*|refund\w*|devolucion\w*|cobraron|me cobr\w*|charged|dos veces|twice|fraude|fraud|robo|robaron|stolen|no llego|no ha llegado|disputa\w*|dispute\w*|contracargo\w*|chargeback\w*)\b/;
/** Asking how something works or what it costs, in es, en, pt, fr and de. Scoped to its own clause (see isMoney). */
const INFO = /\b(compara\w*|compare\w*|explica\w*|explain\w*|como funciona|how does|que es|what is|diferencia\w*|difference|cuanto cuesta|cuanto sale|how much|recomiend\w*|recommend\w*|conviene|mejor forma|best way|paso a paso|step by step|quanto custa|quanto sai|combien coute|coute combien|comment ca marche|comment fonctionne|was kostet|wie ?viel kostet|wie funktioniert)\b/;
const LEAD = [
    [/^(traduc\w*|translat\w*)$/, "translate"],
    [/^(resume\w*|resumir|summar\w*)$/, "summarize"],
    [/^(clasifica\w*|classif\w*|categoriza\w*|etiqueta\w*)$/, "classify"],
    [/^(extrae\w*|extract\w*)$/, "extract"],
    [/^(compara\w*|compare\w*|analiza\w*|analy[sz]\w*|calcula\w*|calculat\w*|evalua\w*|evaluat\w*|revisa\w*|review\w*|audita\w*|audit\w*)$/, "analysis"],
    [/^(arregla\w*|fix\w*|debug\w*)$/, "code_debug"],
    [/^(planea\w*|planifica\w*|plan)$/, "plan"],
    [/^(coordina\w*|orquesta\w*|orchestrat\w*)$/, "agent_orchestrate"],
];
const RISK_ORDER = ["money", "auth_security", "identity_kyc", "legal_compliance", "pii", "none"];
const text = (toks) => toks.map((x) => x.t).join(" ");
/**
 * Does the text ask to move or spend money, or (outside chat) touch money at all?
 * - Studio, agents and APIs: any money word counts, because that code moves real money.
 * - Chat: a money action counts (see money.ts), and so does a money word, unless it sits in a clause that only
 *   asks how something works or what it costs. "¿Cuánto cuesta enviar dinero?" is a question;
 *   "¿cuánto cuesta? manda 10 a Ana" and "¿puedes mandar 10 a Ana?" are requests.
 * - "Transfer me to a human" is a hand-over, not money.
 */
function isMoney(normalized, channel) {
    const toks = tokenize(moneyView(normalized));
    const whole = signalsOf(toks);
    const word = (t, excused) => MONEY.test(excused.length ? t.split(" ").filter((x) => !excused.includes(x)).join(" ") : t);
    if (!CHAT_CHANNELS.includes(channel))
        return whole.action || MONEY.test(normalized);
    if (DISPUTE.test(normalized) && (whole.action || word(text(toks), whole.excused)))
        return true;
    const asked = [];
    for (const c of clauses(toks))
        if (!INFO.test(text(c)))
            asked.push(...c, { t: ".", k: "break" });
    const sig = signalsOf(asked);
    return sig.action || word(text(asked), sig.excused);
}
/**
 * Deterministic risk. The thinking step can never be talked out of it.
 * A routing hint, never a security control: callers must still gate money in their own code.
 */
export function riskOf(normalized, piiKinds = [], channel = "app") {
    const hits = [];
    if (isMoney(normalized, channel))
        hits.push("money");
    for (const [risk, re] of RISK_RULES) {
        re.lastIndex = 0;
        if (re.test(normalized))
            hits.push(risk);
    }
    if (piiKinds.length > 0)
        hits.push("pii");
    const risk = RISK_ORDER.find((r) => hits.includes(r)) ?? "none";
    return { risk, hits };
}
function count(re, text) {
    re.lastIndex = 0;
    return (text.match(re) ?? []).length;
}
export function isCodeTask(t) { return CODE_TASKS.has(t); }
export function classify(req, lang, masked) {
    const text = norm(req.message);
    const channel = req.channel ?? "app";
    const signals = [];
    const scores = new Map();
    const hasCode = CODE_SIGNAL.test(req.message);
    if (hasCode)
        signals.push("code");
    const chatNoCode = CHAT_CHANNELS.includes(channel) && !hasCode;
    for (const [task, re, weight] of TASK_RULES) {
        const c = Math.min(3, count(re, text));
        if (c === 0)
            continue;
        const damp = chatNoCode && CODE_TASKS.has(task) ? 0.4 : 1;
        scores.set(task, (scores.get(task) ?? 0) + weight * c * damp);
    }
    if (hasCode) {
        if ((scores.get("code_debug") ?? 0) > 0)
            scores.set("code_debug", (scores.get("code_debug") ?? 0) + 1);
        else
            scores.set("code_feature", (scores.get("code_feature") ?? 0) + 0.8);
    }
    const first = words(req.message)[0] ?? "";
    for (const [re, t] of LEAD)
        if (re.test(first)) {
            scores.set(t, (scores.get(t) ?? 0) + 1.5);
            break;
        }
    if (req.role === "orchestrator")
        scores.set("agent_orchestrate", (scores.get("agent_orchestrate") ?? 0) + 2);
    if ((req.images ?? 0) > 0)
        scores.set("vision", (scores.get("vision") ?? 0) + 2.5);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const second = ranked[1]?.[1] ?? 0;
    let task = top ? top[0] : channel === "studio" ? "code_feature" : "chat";
    let confidence = top ? clamp(0.5 + 0.12 * top[1] - 0.15 * second, 0.2, 0.97) : channel === "studio" ? 0.55 : 0.5;
    if (req.taskHint) {
        task = req.taskHint;
        confidence = 0.97;
        signals.push("hint");
    }
    // Difficulty: task baseline plus cheap structural signals.
    const w = words(req.message).length;
    let d = BASE[task];
    if (w > 400)
        d += 0.2;
    else if (w > 150)
        d += 0.15;
    else if (w > 60)
        d += 0.1;
    const steps = count(/\b(luego|despues|then|after that|ademas|also|y tambien|and also)\b/g, text) + (req.message.match(/^\s*\d+[.)]\s/gm) ?? []).length;
    d += Math.min(0.15, steps * 0.04);
    // Several asks in one message ("a screen with filters, and CSV export") = more parts to get right.
    const parts = (req.message.match(/,/g) ?? []).length + count(/ (y|and|e|et) /g, ` ${text} `);
    if (parts >= 2)
        d += Math.min(0.12, parts * 0.04);
    const constraints = count(/\b(debe|deben|must|should|sin|without|no uses|dont use|solo|only|exactamente|exactly|obligatorio|required)\b/g, text);
    d += Math.min(0.12, constraints * 0.03);
    const ctx = req.contextChars ?? 0;
    if (ctx > 80_000) {
        d += 0.15;
        signals.push("big_context");
    }
    else if (ctx > 20_000) {
        d += 0.1;
        signals.push("context");
    }
    if ((req.files ?? 0) > 3) {
        d += 0.1;
        signals.push("many_files");
    }
    d += Math.min(0.16, count(/\b(complej\w*|complex|avanzad\w*|advanced|produccion|production|escala|scale|segur[oa]|secure|robust\w*|optimi[sz]\w*|concurren\w*|migraci\w*|migrat\w*)\b/g, text) * 0.08);
    d -= Math.min(0.12, count(/\b(simple|sencill\w*|rapido|quick|just|basico|basic|corto|short)\b/g, text) * 0.06);
    if (req.stage === "plan")
        d += 0.1;
    if (req.stage === "build")
        d -= 0.05;
    if (req.stage === "review")
        d += 0.05;
    if (req.role === "orchestrator")
        d += 0.15;
    if (req.role === "reviewer")
        d += 0.1;
    if (req.role === "worker")
        d -= 0.05;
    const { risk, hits } = riskOf(text, masked.kinds, channel);
    const historyChars = (req.history ?? []).reduce((a, t) => a + t.content.length, 0);
    const inputChars = req.message.length + (req.system?.length ?? 0) + historyChars + ctx;
    return {
        task,
        difficulty: clamp(d),
        risk,
        riskHits: hits,
        confidence,
        lang,
        inputChars,
        estInputTokens: estTokens(inputChars, lang),
        reserveInputTokens: reserveTokens(inputChars),
        signals,
        asked: false,
    };
}
