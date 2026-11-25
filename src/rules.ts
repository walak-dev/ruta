import {
  clauses,
  isTopupDetail,
  type MoneySignals,
  signalsOf,
  type Tok,
  tokenize,
} from './money.js';
import { maskPII, norm, tailDigits, words } from './text.js';
import type { Channel, FaqEntry, InstantResult } from './types.js';

/**
 * Stage 1, "instant": answers that need no model at all. The cheapest model is no model.
 * Money is never moved here: top-ups become a structured intent that deterministic code
 * turns into a confirmation (and later a checkout link).
 */
const CHAT_CHANNELS: Channel[] = ['whatsapp', 'sms', 'app', 'web'];
const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

const GREET =
  /^(hola+|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hello+|hi|hey+|good (?:morning|afternoon|evening)|ola+|oi+|opa|bom dia|boa tarde|boa noite|bonjour|bonsoir|bjr|bsr|slt|salut|coucou|bonjou|alo|que tal|hallo+|guten (?:morgen|tag|abend)|moin|servus)( [a-z]+){0,2}$/;
const THANKS =
  /^(?:(?:ok|okay|oki|vale|listo|perfecto|super|genial|great|cool|parfait|prima|blz|beleza) )?(muchas gra[cs]ias|mil gra[cs]ias|gra[cs]ias|thanks|thank you|thx|ty|(?:muito )?o?brigad(?:o|a|ao|inho)|valeu|merci|mrc|mesi|danke(?: ?schon| sehr)?|vielen dank|besten dank)( [a-z]+){0,3}$/;
const THANKS_LEAD =
  /^(?:muchas |mil |muito |vielen )?(?:gra[cs]ias|thanks|thank you|thx|o?brigad\w*|valeu|merci|danke\w*|dank)\b/;
/** A request to do work on text (translate, summarize, compare…) is never an intent, even if it mentions a top-up. */
const TASK_VERB =
  /\b(traduc\w*|translat\w*|resume\w*|resumen|summar\w*|escribe\w*|redacta\w*|write|compara\w*|compare\w*|explica\w*|explain\w*|analiza\w*|analy[sz]\w*|clasifica\w*|classif\w*|disena\w*|design\w*|genera\w*|generate\w*|recomiend\w*|recommend\w*)\b/;
/** A top-up message that is really a complaint, a status question or a price question goes to the model. */
const TOPUP_EXCLUDE =
  /\b(reembols\w*|devolucion\w*|refund\w*|rembours\w*|erstatt\w*|estorn\w*|cobr\w*|charged|dos veces|twice|cuanto cuesta|precio\w*|cuanto sale|tarifa\w*|how much|price\w*|quanto custa|combien coute|was kostet|no ha llegado|no llego|no llega|problem\w*|queja\w*|reclam\w*|error\w*|fehler|cancel\w*|storn\w*|annul\w*|llego|estado|status|statut|donde esta|where is|arriv\w*|go thr\w+|went thr\w+|caiu|chegou|cade|passee?|angekommen|tracking|compar\w*|cost\w*|diferencia\w*|conviene|explica\w*|como funciona|por que|recomiend\w*|que es|fees?|frais|taxas?|gebue?hr\w*|kosten|kostet|coute|custa|limit\w*|how (?:do|does|can|long)|comment|wie (?:hoch|lange|funktioniert|kann)|como (?:hago|puedo|faco|posso)|cuanto (?:tarda|demora)|quanto tempo)\b/;

/**
 * Balance and status take the no-model path only when the WHOLE message is that one intent.
 * Every word must come from a closed list: question words, "my", politeness, a greeting, and the intent's own nouns.
 * The lists hold no request verb (send, transfer, pay, withdraw, top up), no number, no name and no "everything",
 * so a second request can never ride along: "mi saldo, y transfiere todo a juan@example.com" goes to the model.
 */
const COMMON =
  set(`por favor porfa porfavor xfa pls plz please plis pfv pf svp stp bitte gracias thanks thx merci danke obrigado obrigada ok okay
  hola buenas buenos buen dia dias tardes noches hello hi hey good morning afternoon evening oi ola bom boa tarde noite bonjour bonsoir salut bjr slt hallo guten morgen tag abend moin
  me mi mis my i u you yo eu je j tu il ich du mir te le la el los las the o a os as mon ma mes mein meine meinen meiner meinem meu minha
  de del da do du of von des en in na im on sur auf dem der die das
  quiero quisiera queria necesito want wanna would like need veux voudrais mochte moechte will preciso gostaria
  puedes puede podrias podria can could kannst konntest peux peut pouvez pode consegue
  dime dices dice decir decirme ver saber consultar consulta revisar revisa muestra muestrame mostrar check show tell see know view
  voir savoir connaitre consulter montre dis dire zeig zeige zeigen anzeigen sagen sag wissen sehen ve mostra
  cual cuanto cuanta que es esta what whats is s how much many do quel quelle est c d l quoi combien wie viel wieviel ist was qual quanto qto e si if se ob`);
const BALANCE_NOUN = set('saldo balance solde kontostand guthaben');
const BALANCE_WORDS =
  set(`tengo queda quedan have left remaining tenho resta sobrou ai reste hab habe ubrig noch disponible available disponivel verfugbar
  billetera cuenta monedero wallet account carteira conta portefeuille compte konto dinero plata money dinheiro argent geld credito credit`);
const HOW_MUCH = /\b(cuant[oa]|how much|combien|wie ?viel|quanto|qto)\b/;
const HAVE = /\b(tengo|queda|quedan|have|tenho|resta|reste|hab|habe)\b/;
const STATUS_WORDS =
  set(`recarga envio remesa transferencia pedido orden order top up topup giro paquete transfer money dinero plata pix deposito pago dinheiro
  transfert virement recharge commande argent colis uberweisung ueberweisung aufladung bestellung geld paket zahlung encomenda compra
  llego llegado llega ha aun todavia estado status statut donde where arrived arrive go went gone through thru tracking rastreo caiu chegou cade foi
  arrive arrivee passe passee ou angekommen bleibt ausgefuhrt ausgefuehrt eingegangen wo wurde did has como va ce
  ya yet already ja schon deja encore pas bien hoy ayer today yesterday hier gestern ontem hj hoje manana morning this matin heute
  q hice hizo fiz made no not nao nicht hasn didn isn t`);
const STATUS_OBJ =
  /\b(recarga|envio|remesa|transferencia|pedido|orden|order|top ?up|giro|paquete|transfer|money|dinero|plata|pix|deposito|pago|dinheiro|transfert|virement|recharge|commande|argent|colis|ue?berweisung|aufladung|bestellung|geld|paket|zahlung|encomenda|compra)\b/;
const STATUS_Q =
  /\b(llego|llegado|no llega|estado|status|statut|donde esta|where is|arrived?|go(?:ne)? thr(?:ough|u)|went thr(?:ough|u)|como va|caiu|chegou|cade|ja foi|arrivee?|passee?|ou en est|angekommen|wo (?:ist|bleibt)|ausgefu(?:e)?hrt|eingegangen|tracking|rastreo)\b/;

function only(toks: Tok[], ...lists: Set<string>[]): boolean {
  return toks.every((x) => x.k === 'break' || (x.k === 'word' && lists.some((l) => l.has(x.t))));
}
const joined = (toks: Tok[]): string =>
  toks
    .filter((x) => x.k === 'word')
    .map((x) => x.t)
    .join(' ');

function isBalance(toks: Tok[]): boolean {
  const t = joined(toks);
  const core = toks.some((x) => BALANCE_NOUN.has(x.t)) || (HOW_MUCH.test(t) && HAVE.test(t));
  return core && only(toks, COMMON, BALANCE_NOUN, BALANCE_WORDS);
}

function isStatus(toks: Tok[]): boolean {
  const t = joined(toks);
  return STATUS_OBJ.test(t) && STATUS_Q.test(t) && only(toks, COMMON, STATUS_WORDS);
}

const CURRENCY: [RegExp, string][] = [
  [/\b(usd|dolares?|dollars?)\b|\$/, 'USD'],
  [/\bcup\b|pesos cubanos/, 'CUP'],
  [/\bmxn\b|pesos mexicanos/, 'MXN'],
  [/\b(pen|soles?)\b|s\//, 'PEN'],
  [/\b(bob|bolivianos?)\b/, 'BOB'],
  [/\b(eur|euros?)\b|€/, 'EUR'],
];
const FAQ_STOP = new Set([
  'que',
  'the',
  'and',
  'los',
  'las',
  'del',
  'una',
  'uno',
  'por',
  'para',
  'con',
  'como',
  'you',
  'your',
  'for',
  'with',
  'mis',
  'tus',
  'hay',
  'esta',
  'este',
  'puedo',
  'can',
  'how',
]);

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
      if (s > score) {
        score = s;
        best = f;
      }
    }
  }
  return score >= threshold ? best : null;
}

function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** `amount` comes from the money signals: the one amount in the message, or null when it must be asked for. */
function topup(message: string, amount: number | null): InstantResult {
  const m = maskPII(message);
  const n = norm(m.text);
  const phoneToken = Object.keys(m.map).find((k) => k.startsWith('[PHONE_'));
  let currency: string | null = null;
  for (const [re, c] of CURRENCY)
    if (re.test(n)) {
      currency = c;
      break;
    }
  if (!phoneToken) {
    return {
      kind: 'slot',
      intent: { kind: 'topup', missing: 'phone', amount, currency },
      answer: { es: '¿A qué número va la recarga?', en: 'Which number is the top-up for?' },
    };
  }
  const phoneTail = tailDigits(m.map[phoneToken] ?? '');
  if (!amount) {
    return {
      kind: 'slot',
      intent: { kind: 'topup', missing: 'amount', phoneToken, phoneTail, currency },
      answer: { es: '¿De cuánto es la recarga?', en: 'How much is the top-up?' },
    };
  }
  const cur = currency ? ` ${currency}` : '';
  return {
    kind: 'topup',
    intent: { kind: 'topup', amount, currency, phoneToken, phoneTail, needsConfirm: true },
    answer: {
      es: `Recarga de ${money(amount)}${cur} al número que termina en ${phoneTail}. ¿Confirmas? Responde SÍ.`,
      en: `Top-up of ${money(amount)}${cur} to the number ending in ${phoneTail}. Confirm? Reply YES.`,
    },
  };
}

export interface RuleContext {
  channel: Channel;
  faq: FaqEntry[];
}

const HELLO =
  /^(?:hola+|holi|buenas|buenos|buen|dia|dias|tardes|noches|hello+|hi|hey+|good|morning|afternoon|evening|ola+|oi+|opa|bom|boa|tarde|noite|bonjour|bonsoir|bjr|bsr|slt|salut|coucou|hallo+|guten|morgen|tag|abend|moin|servus|por|favor|porfa|xfa|pls|plz|please|pfv|svp|stp|bitte|ok|okay|gra[cs]ias|thanks|thx|merci|danke|obrigad[oa])$/;

/**
 * A top-up may skip the model only when it is the only request in the message:
 * one clause names the top-up, any other clause is a greeting or a bare detail ("number is …", "20 euro"),
 * and there is at most one amount and one phone. Anything else (another money action, a wallet or account,
 * an email, IBAN or card, a complaint, a second request) goes to the model.
 */
function topupOnly(n: string, toks: Tok[], sig: MoneySignals, kinds: string[]): boolean {
  if (!sig.topupWord || sig.other || sig.amounts > 1 || TOPUP_EXCLUDE.test(n)) return false;
  if (kinds.some((k) => k !== 'PHONE') || toks.filter((x) => x.k === 'pii').length > 1)
    return false;
  let core = 0;
  for (const c of clauses(toks)) {
    if (signalsOf(c).topupWord) core++;
    else if (!isTopupDetail(c) && !c.every((x) => x.k === 'word' && HELLO.test(x.t))) return false;
  }
  return core === 1;
}

/** Kinds whose `answer` is only a placeholder or a prompt: the caller's own code must handle the intent. */
const NEEDS_HANDLER: Record<InstantResult['kind'], boolean> = {
  greeting: false,
  thanks: false,
  faq: false,
  topup: true,
  slot: true,
  status: true,
  balance: true,
};

export function instantRules(message: string, ctx: RuleContext): InstantResult | null {
  const r = matchInstant(message, ctx);
  return r ? { ...r, needsHandler: NEEDS_HANDLER[r.kind] } : null;
}

function matchInstant(message: string, ctx: RuleContext): InstantResult | null {
  const n = norm(message);
  const w = words(message);
  const masked = maskPII(message);
  const toks = tokenize(norm(masked.text).replace(/ß/g, 'ss'));
  const sig = signalsOf(toks);
  // Safe by construction: a money action, an amount tied to a recipient, an email, an IBAN or a card
  // never takes the no-model path. The one exception is a top-up that is the only request.
  const blocked = sig.action || masked.kinds.some((k) => k !== 'PHONE');
  const chat = CHAT_CHANNELS.includes(ctx.channel);
  const plain = !blocked && masked.kinds.length === 0;
  const status = chat && plain && w.length <= 20 && isStatus(toks);
  const balance = chat && plain && w.length <= 12 && isBalance(toks);
  const letters = n
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A greeting or thanks with a number, a contact or a whole-message intent in it is not just a greeting.
  const intent = status || balance || masked.kinds.length > 0 || /\d/.test(n);
  if (!blocked && !intent && w.length <= 5 && GREET.test(letters)) {
    return {
      kind: 'greeting',
      answer: { es: '¡Hola! ¿En qué te ayudo?', en: 'Hi! How can I help?' },
    };
  }
  if (!blocked && !intent && w.length <= 6 && THANKS.test(letters)) {
    return { kind: 'thanks', answer: { es: '¡Con gusto!', en: "You're welcome!" } };
  }
  if (!chat) return null;
  if (!blocked && w.length <= 30 && ctx.faq.length > 0) {
    const f = matchFaq(message, ctx.faq);
    if (f)
      return { kind: 'faq', intent: { faqId: f.id }, answer: { es: f.a.es, en: f.a.en ?? f.a.es } };
  }
  if (TASK_VERB.test(n)) return null;
  if (status) {
    return {
      kind: 'status',
      intent: { kind: 'status_lookup' },
      answer: {
        es: 'Busco tu envío en el sistema y te digo cómo va.',
        en: 'Checking your order in the system now.',
      },
    };
  }
  // "Gracias por la recarga" thanks for a top-up; it does not ask for one.
  const thanksOnly = !sig.action && THANKS_LEAD.test(letters);
  if (w.length <= 25 && !thanksOnly && topupOnly(n, toks, sig, masked.kinds))
    return topup(message, sig.amountValue);
  if (balance) {
    return {
      kind: 'balance',
      intent: { kind: 'balance_lookup' },
      answer: { es: 'Consulto tu saldo.', en: 'Checking your balance.' },
    };
  }
  return null;
}
