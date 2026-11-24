import type { Channel, FaqEntry, InstantResult } from "./types.js";
import { maskPII, norm, tailDigits, words } from "./text.js";

/**
 * Stage 1, "instant": answers that need no model at all. The cheapest model is no model.
 * Money is never moved here: top-ups become a structured intent that deterministic code
 * turns into a confirmation (and later a checkout link).
 */
const CHAT_CHANNELS: Channel[] = ["whatsapp", "sms", "app", "web"];
const GREET = /^(hola|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hello|hi|hey|ola|oi|bom dia|boa tarde|boa noite|bonjour|salut|bonjou|alo|que tal)( [a-z]+){0,2}$/;
const THANKS = /^(muchas gracias|mil gracias|gracias|thanks|thank you|thx|ty|obrigad[oa]|merci|mesi|ok gracias|listo gracias|perfecto gracias)( [a-z]+){0,3}$/;
const TOPUP = /\b(recarga|recargar|recargame|recargale|recargue|recarguen|top ?up|topup|reload|recharge|recarregar|mandame saldo|manda saldo|pon saldo|ponle saldo|ponme saldo)\b/;
const TOPUP_EXCLUDE = /\b(reembols\w*|devolucion\w*|refund\w*|cobr\w*|charged|dos veces|twice|cuanto cuesta|precio\w*|cuanto sale|tarifa\w*|how much|price\w*|no ha llegado|no llego|no llega|problema\w*|queja\w*|reclamo\w*|error\w*|cancel\w*|llego|estado|status|donde esta|where is|tracking|compar\w*|cost\w*|diferencia\w*|conviene|explica\w*|como funciona|por que|recomiend\w*|que es)\b/;
/** A request to do work on text (translate, summarize, compare…) is never an intent, even if it mentions a top-up. */
const TASK_VERB = /\b(traduc\w*|translat\w*|resume\w*|resumen|summar\w*|escribe\w*|redacta\w*|write|compara\w*|compare\w*|explica\w*|explain\w*|analiza\w*|analy[sz]\w*|clasifica\w*|classif\w*|disena\w*|design\w*|genera\w*|generate\w*|recomiend\w*|recommend\w*)\b/;
const STATUS_Q = /\b(llego|ya llego|no ha llegado|no llega|estado|status|donde esta|where is|arrived|tracking|rastrea\w*|rastreo)\b/;
const STATUS_OBJ = /\b(recarga|envio|remesa|transferencia|transfer|pedido|orden|order|top ?up|giro|paquete)\b/;
const BALANCE = /\b(cuanto (saldo )?tengo|mi saldo|ver saldo|ver mi saldo|consultar saldo|my balance|check balance|how much (credit|balance) do i have|meu saldo)\b/;
const CURRENCY: [RegExp, string][] = [
  [/\b(usd|dolares?|dollars?)\b|\$/, "USD"],
  [/\bcup\b|pesos cubanos/, "CUP"],
  [/\bmxn\b|pesos mexicanos/, "MXN"],
  [/\b(pen|soles?)\b|s\//, "PEN"],
  [/\b(bob|bolivianos?)\b/, "BOB"],
  [/\b(eur|euros?)\b|€/, "EUR"],
];
const AMOUNT = /(?:^|[\s$€])(\d{1,4}(?:[.,]\d{1,2})?)(?=\s|$|[a-z$€])/;

const FAQ_STOP = new Set(["que", "the", "and", "los", "las", "del", "una", "uno", "por", "para", "con", "como", "you", "your", "for", "with", "mis", "tus", "hay", "esta", "este", "puedo", "can", "how"]);

function contentWords(n: string): Set<string> {
  return new Set((n.match(/[a-z0-9]+/g) ?? []).filter((x) => x.length > 2 && !FAQ_STOP.has(x)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function matchFaq(message: string, faq: FaqEntry[], threshold = 0.5): FaqEntry | null {
  const a = contentWords(norm(message));
  if (a.size === 0) return null;
  let best: FaqEntry | null = null;
  let score = 0;
  for (const f of faq) {
    for (const q of f.q) {
      const s = jaccard(a, contentWords(norm(q)));
      if (s > score) { score = s; best = f; }
    }
  }
  return score >= threshold ? best : null;
}

function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function topup(message: string): InstantResult {
  const m = maskPII(message);
  const n = norm(m.text);
  const phoneToken = Object.keys(m.map).find((k) => k.startsWith("[PHONE_"));
  const amtRaw = n.match(AMOUNT)?.[1];
  let currency: string | null = null;
  for (const [re, c] of CURRENCY) if (re.test(n)) { currency = c; break; }
  const amount = amtRaw ? Number(amtRaw.replace(",", ".")) : null;
  if (!phoneToken) {
    return {
      kind: "slot",
      intent: { kind: "topup", missing: "phone", amount, currency },
      answer: { es: "¿A qué número va la recarga?", en: "Which number is the top-up for?" },
    };
  }
  const phoneTail = tailDigits(m.map[phoneToken] ?? "");
  if (!amount) {
    return {
      kind: "slot",
      intent: { kind: "topup", missing: "amount", phoneToken, phoneTail, currency },
      answer: { es: "¿De cuánto es la recarga?", en: "How much is the top-up?" },
    };
  }
  const cur = currency ? ` ${currency}` : "";
  return {
    kind: "topup",
    intent: { kind: "topup", amount, currency, phoneToken, phoneTail, needsConfirm: true },
    answer: {
      es: `Recarga de ${money(amount)}${cur} al número que termina en ${phoneTail}. ¿Confirmas? Responde SÍ.`,
      en: `Top-up of ${money(amount)}${cur} to the number ending in ${phoneTail}. Confirm? Reply YES.`,
    },
  };
}

export interface RuleContext { channel: Channel; faq: FaqEntry[] }

export function instantRules(message: string, ctx: RuleContext): InstantResult | null {
  const n = norm(message);
  const w = words(message);
  const letters = n.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (w.length <= 5 && GREET.test(letters)) {
    return { kind: "greeting", answer: { es: "¡Hola! ¿En qué te ayudo?", en: "Hi! How can I help?" } };
  }
  if (w.length <= 6 && THANKS.test(letters)) {
    return { kind: "thanks", answer: { es: "¡Con gusto!", en: "You're welcome!" } };
  }
  if (!CHAT_CHANNELS.includes(ctx.channel)) return null;
  if (w.length <= 30 && ctx.faq.length > 0) {
    const f = matchFaq(message, ctx.faq);
    if (f) return { kind: "faq", intent: { faqId: f.id }, answer: { es: f.a.es, en: f.a.en ?? f.a.es } };
  }
  if (TASK_VERB.test(n)) return null;
  if (w.length <= 20 && STATUS_Q.test(n) && STATUS_OBJ.test(n)) {
    return {
      kind: "status",
      intent: { kind: "status_lookup" },
      answer: { es: "Busco tu envío en el sistema y te digo cómo va.", en: "Checking your order in the system now." },
    };
  }
  if (w.length <= 25 && TOPUP.test(n) && !TOPUP_EXCLUDE.test(n)) return topup(message);
  if (w.length <= 12 && BALANCE.test(n)) {
    return { kind: "balance", intent: { kind: "balance_lookup" }, answer: { es: "Consulto tu saldo.", en: "Checking your balance." } };
  }
  return null;
}
