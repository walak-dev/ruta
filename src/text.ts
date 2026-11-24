import type { Lang } from "./types.js";

/** Lowercase, strip accents, collapse spaces. All rules match against this. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function words(s: string): string[] {
  return norm(s).match(/[a-z0-9$']+/g) ?? [];
}

const STOP: Record<Exclude<Lang, "other">, string[]> = {
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "por", "para", "con", "una", "un", "es", "mi", "tu", "hola", "gracias", "quiero", "como", "cuanto", "recarga", "necesito", "pero", "muy", "esta", "este", "ya", "del", "al", "se", "lo", "le", "hazme", "dame", "puedes", "estos", "estas", "desde", "sobre", "cuando", "donde", "hay", "son", "tiene", "tengo", "hacer", "puede", "mas", "sin", "todo", "todos", "nos", "su", "sus", "pantalla", "ahora"],
  en: ["the", "and", "to", "of", "is", "you", "for", "with", "my", "i", "please", "hello", "hi", "thanks", "want", "need", "how", "what", "this", "that", "can", "it", "make", "give", "your", "are", "these", "those", "into", "from", "on", "in", "be", "do", "does", "we", "our", "they", "about", "if", "or", "not", "was", "were", "have", "has", "will", "would", "should", "could", "add", "screen", "now"],
  pt: ["o", "os", "as", "do", "da", "em", "um", "uma", "com", "nao", "obrigado", "obrigada", "voce", "ola", "quero", "preciso", "isso", "meu", "minha", "tudo", "bem"],
  fr: ["le", "les", "des", "est", "et", "pour", "avec", "je", "vous", "merci", "bonjour", "veux", "besoin", "ce", "cette", "une", "pas", "mon", "ma"],
  ht: ["mwen", "ou", "li", "nou", "yo", "pa", "se", "ak", "pou", "sa", "bonjou", "mesi", "vle", "bezwen", "kijan", "konbyen"],
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v)])) as Record<Exclude<Lang, "other">, Set<string>>;

/** Cheap stopword vote. Unknown or empty input falls back to the tenant's language. */
export function detectLang(s: string, fallback: Lang = "es"): Lang {
  const w = words(s);
  let best: Lang = fallback;
  let bestScore = 0;
  for (const [lang, set] of Object.entries(STOP_SETS) as [Exclude<Lang, "other">, Set<string>][]) {
    let score = 0;
    for (const x of w) if (set.has(x)) score++;
    if (score > bestScore) { best = lang; bestScore = score; }
  }
  return bestScore === 0 ? fallback : best;
}

/**
 * Starting guesses for characters per token. Ruta replaces them with ratios measured
 * from real provider usage per (model, language): the "language tax" is measured, not assumed.
 */
export const CHARS_PER_TOKEN: Record<Lang, number> = { en: 4, es: 3.6, pt: 3.6, fr: 3.6, ht: 3.4, other: 3 };

export function estTokens(chars: number, lang: Lang, measured?: number): number {
  const r = measured && measured > 0.5 ? measured : CHARS_PER_TOKEN[lang];
  return Math.ceil(chars / r);
}

/** Worst case for reservations: characters ÷ 3 (safe for Spanish and JSON). */
export function reserveTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

export function luhn(d: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const DIGITS = /\+?\d[\d ().-]{6,24}\d/g;
const DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;
const AMOUNT_LEAD = /(recarga\w*|top ?up|reload|de|por|con|send|manda\w*)\s*$/i;

export interface Masked { text: string; map: Record<string, string>; kinds: string[] }

/**
 * Replaces phones, cards (Luhn-checked), emails and IBANs with tokens like [PHONE_1].
 * The map stays server-side; models only ever see tokens.
 */
export function maskPII(input: string): Masked {
  const map: Record<string, string> = {};
  const kinds = new Set<string>();
  const count: Record<string, number> = {};
  const put = (kind: string, value: string): string => {
    count[kind] = (count[kind] ?? 0) + 1;
    const token = `[${kind}_${count[kind]}]`;
    map[token] = value;
    kinds.add(kind);
    return token;
  };
  let text = input.replace(EMAIL, (m) => put("EMAIL", m));
  text = text.replace(IBAN, (m) => put("IBAN", m));
  text = text.replace(DIGITS, (m: string, offset: number, whole: string) => {
    const trimmed = m.trim();
    if (DATE.test(trimmed)) return m;
    const parts = trimmed.split(/\s+/);
    const first = parts[0] ?? "";
    // "recarga 10 5355551234": the short first group is an amount, not part of the phone.
    if (!trimmed.startsWith("+") && parts.length > 1 && first.replace(/\D/g, "").length <= 3 &&
        trimmed.slice(first.length).replace(/\D/g, "").length >= 7 && AMOUNT_LEAD.test(whole.slice(Math.max(0, offset - 25), offset))) {
      return `${first} ${put("PHONE", trimmed.slice(first.length).trim())}`;
    }
    const d = trimmed.replace(/\D/g, "");
    if (d.length >= 13 && d.length <= 19 && luhn(d)) return put("CARD", trimmed);
    if (d.length >= 7 && d.length <= 15) return put("PHONE", trimmed);
    return m;
  });
  return { text, map, kinds: [...kinds] };
}

export function unmask(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

export function tailDigits(value: string, n = 4): string {
  return value.replace(/\D/g, "").slice(-n);
}

export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, x));
}

export function clock(): number {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? p.now() : Date.now();
}
