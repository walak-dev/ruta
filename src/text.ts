import type { Lang } from "./types.js";

/** Lowercase, strip accents, collapse spaces. All rules match against this. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function words(s: string): string[] {
  return norm(s).match(/[a-z0-9$']+/g) ?? [];
}

type VoteLang = Exclude<Lang, "other">;

/**
 * Small per-language lexicons for the language vote: function words plus the everyday chat and
 * payments vocabulary Ruta routes (send, pay, top up, balance). Accent-free lowercase, as norm() leaves them.
 * A word that exists in several languages is listed in each of them, so it cancels out.
 */
const LEX: Record<VoteLang, string> = {
  es: `el la los las un una unos unas de del al y o que q en por para pa con sin sobre desde hasta entre pero porque pq si no ni
    yo tu mi mis tus su sus me te se lo le les nos mes usted ustedes ese esa eso este esta esto estos estas
    es son soy eres estan estoy hay ser tiene tienen tengo tienes puede puedo puedes pueden hacer hago hace hice
    quiero quieres quisiera kiero necesito necesita dime dame hazme hazle sabe saber dice dices voy va
    ya muy mas como cuando donde cuanto cuanta cual quien ahora hoy ayer manana tambien tb todo todos toda nada algo aqui bien mucho muchas nadie dos
    hola buenas buenos buen dia dias tarde tardes noche noches gracias favor porfa xfa
    enviar envia envio enviale enviame mandar manda mando mandale mandame transferir transfiere transferencia pasale pasame
    pagar paga pago pagale recarga recargar recargame saldo cuenta dinero plata pesos dolares dolar numero celular telefono
    billetera tarjeta retirar retiro sacar depositar credito cuesta llego llegar pedido correo tienda ayuda pantalla`,
  en: `the and to of is are am was were be been you u your ur i me my we our us they them their he she his her him it its
    this that these those there here for with from into on in at by about if or not no yes do does did dont
    have has had will would should could can cant please pls plz hello hi hey thanks thank thx want wanna need
    how what whats when where who why which much many some any all everything now today yesterday tomorrow also too so but
    just still yet already out up make give get got go tell check show good morning afternoon evening night an as im
    send pay transfer money dollars dollar bucks bill wallet balance account phone number top topup recharge portable
    telephone withdraw deposit cash card credit fee order help add screen`,
  pt: `o os as um uma uns umas de do da dos das no na nas em e ou que q para pra pro pras pros por pelo pela com sem sobre desde ate entre
    mas porque pq se nao sim nem mes dois eu tu voce voces vc vcs ele ela eles elas nos me te lhe meu minha meus minhas seu sua seus suas
    dele dela isso isto esse essa este esta aquele aquela sao sou estao estou to ta tem tenho temos ter ser foi fiz faz fazer faco vou vai
    quero queria quer preciso precisa posso pode podem consegue consigo sabe saber diz
    ja ainda agora hoje hj ontem amanha depois tambem tb tbm tudo todo toda todos nada algo aqui ai bem bom boa muito muita mto mais
    como quando onde quanto quanta qto qual quais quem cade so oi ola opa obrigado obrigada brigado valeu favor pfv pf dia dias tarde noite
    enviar envia envio mandar manda mando transferir transfere transferencia passa pagar paga pago pix boleto conta saldo recarga recarregar recarrega
    celular numero telefone dinheiro reais carteira cartao retirar sacar saque depositar credito taxa pedido loja ajuda dolares dolar`,
  fr: `le la les un une des du de au aux et ou est sont suis ai ont avez avons etes je tu il elle on nous vous ils elles me te se moi toi lui
    mon ma mes ton ta tes son sa ses notre votre vos nos leur ce cette ces ca cela que qui quoi quel quelle quand comment combien pourquoi
    pour par avec sans dans sur sous vers chez en y ne pas tres bien aussi encore toujours deja maintenant aujourd hui hier demain
    oui non si mais donc alors tout tous toute rien bon bonne bonjour bonsoir nuit salut slt bjr merci mrc bcp beaucoup svp stp plait
    veux voudrais veut peux peut pouvez dois faut fais fait faire va vais besoin reste
    envoyer envoie envoi envoyez transferer transfere transfert virement virer vire payer paye paie facture recharge recharger solde compte
    argent francs dollars numero telephone portable portefeuille retirer retrait deposer carte credit frais commande appli aide`,
  de: `der die das den dem des ein eine einen einem einer und oder aber ich du er sie es wir ihr mich mir dich dir uns euch
    mein meine meinen meinem meiner dein deine sein seine unser euer eure ist sind bin bist war hat habe hab hast haben habt
    kann kannst konnen konnt will willst wollen mochte moechte muss musst soll wird werden wurde nicht kein keine ja nein doch auch noch schon nur
    jetzt heute gestern morgen dann an am auf aus bei mit nach von vom zu zum zur fur fuer uber ueber unter in im um bis seit pro
    wie was wo wer wann warum welche wieviel viel viele vielen dass wenn weil bitte danke dank dankeschon hallo guten gute tag abend nacht moin
    alles etwas hier da so also sehr gut gibt senden sende schicken schick schicke uberweisen uberweise uberweisung ueberweisen ueberweise ueberweisung
    bezahlen bezahle zahlen zahle aufladen lade aufladung guthaben kontostand konto geld dollar nummer handy rechnung abheben auszahlen einzahlen
    bestellung gebuhren karte hilfe`,
  ht: `mwen ou li nou yo pa se ak pou sa ap nan yon ki ye gen wi bonjou mesi tanpri anpil vle bezwen kijan konbyen kisa kote eske
    voye lajan kob`,
};
const VOTES = new Map<string, VoteLang[]>();
for (const [lang, list] of Object.entries(LEX) as [VoteLang, string][]) {
  for (const w of new Set(list.split(/\s+/))) VOTES.set(w, [...(VOTES.get(w) ?? []), lang]);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Not language, removed before the vote: [EMAIL_1] placeholders, emails, URLs and bare domains, @handles, numbers. */
const NOT_LANGUAGE: RegExp[] = [
  /\[[A-Z]+_\d+\]/g,
  EMAIL,
  /(?:https?:\/\/|www\.)\S+/gi,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|app|dev|info)(?:\.[a-z]{2})?\b(?:\/\S*)?/gi,
  /(^|\s)@[\w.]+/g,
  /\d+/g,
];

/**
 * Letters that point at a language. Read from the raw text, before norm() strips the accents.
 * Portuguese and French share ç ê â ô à ("você", "três", "être", "à").
 */
const CHAR_HINTS: [VoteLang[], RegExp][] = [
  [["pt"], /[ãõ]/],
  [["de"], /[ßäöü]/],
  [["fr"], /[èùœ]/],
  [["es"], /[ñ¿¡]/],
  [["pt", "fr"], /[çêâôà]/],
];
/** The start of a message is enough to tell its language, and it bounds the work on very long input. */
const VOTE_CHARS = 2000;
const WORD_POINTS = 2;
/**
 * Half a word, once per language: a hint breaks ties and decides when no word matched,
 * but a recipient's name ("João", "Müller") never outvotes the sentence around it.
 */
const HINT_POINTS = 1;

/**
 * Cheap language vote: lexicon words, a few telling letters, French elisions (c'est, j'ai) and English
 * contractions (don't, I'm; not 's, which German shares: "wie geht's").
 * A tie or no signal returns the fallback (the tenant's language).
 */
export function detectLang(s: string, fallback: Lang = "es"): Lang {
  let clean = s.length > VOTE_CHARS ? s.slice(0, VOTE_CHARS) : s;
  for (const re of NOT_LANGUAGE) clean = clean.replace(re, " ");
  const raw = clean.normalize("NFC").toLowerCase().replace(/[\u2019\u02bc`\u00b4]/g, "'");
  const score = new Map<VoteLang, number>();
  const add = (lang: VoteLang, points: number) => { if (points > 0) score.set(lang, (score.get(lang) ?? 0) + points); };

  // Spanish is the only one that writes "güe" and "güi"; any other "ü" reads as German.
  const hinted = new Set<VoteLang>();
  const letters = raw.replace(/gü(?=[ei])/g, () => { hinted.add("es"); return "gu"; });
  for (const [langs, re] of CHAR_HINTS) if (re.test(letters)) for (const lang of langs) hinted.add(lang);
  for (const lang of hinted) add(lang, HINT_POINTS);
  add("fr", WORD_POINTS * (raw.match(/(?:^|[^a-z])(?:qu|[cdjlmnst])'(?=[a-zàâéèêîôûh])/g)?.length ?? 0));
  add("en", WORD_POINTS * (raw.match(/(?:n't|[a-z]'(?:re|ll|ve|m|d))(?![a-z'])/g)?.length ?? 0));

  const tokens = norm(raw.replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae")).match(/[a-z]+/g) ?? [];
  for (const t of tokens) for (const lang of VOTES.get(t) ?? []) add(lang, WORD_POINTS);

  let best: Lang = fallback;
  let bestScore = 0;
  let tied = false;
  for (const [lang, points] of score) {
    if (points > bestScore) { best = lang; bestScore = points; tied = false; }
    else if (points === bestScore) tied = true;
  }
  return bestScore === 0 || tied ? fallback : best;
}

/**
 * Starting guesses for characters per token. Ruta replaces them with ratios measured
 * from real provider usage per (model, language): the "language tax" is measured, not assumed.
 */
export const CHARS_PER_TOKEN: Record<Lang, number> = { en: 4, es: 3.6, pt: 3.6, fr: 3.6, de: 3.4, ht: 3.4, other: 3 };

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
