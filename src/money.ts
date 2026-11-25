import { maskPII, norm } from './text.js';

/**
 * Money-action signals for es, en, pt, fr and de: "the customer asks to move or spend money now".
 * Works on tokens of accent-free lowercase text (see norm()) with emails, phones, cards and IBANs
 * replaced by placeholders, so a phone number is never read as an amount.
 *
 * Biased toward recall: a wrong "money" on a harmless message only costs a stronger tier and a
 * confirmation; a missed money action is the expensive error. It is a routing hint, never a
 * security control: callers must still gate money in their own code.
 */
export type TokKind = 'num' | 'word' | 'cur' | 'pii' | 'break';
export interface Tok {
  t: string;
  k: TokKind;
}

const TOKEN = /\[(?:email|phone|card|iban|cvv)_\d+\]|\d+(?:[.,:]\d+)*|[a-z]+|[$€£]|[?!.;,\n]/g;

/** Accent-free lowercase text with PII placeholders. Safe to call on text that is already masked. */
export function moneyView(normalized: string): string {
  return norm(maskPII(normalized).text).replace(/ß/g, 'ss');
}

export function tokenize(view: string): Tok[] {
  const out: Tok[] = [];
  for (const t of view.match(TOKEN) ?? []) {
    const c = t.charCodeAt(0);
    const k: TokKind = t.startsWith('[')
      ? 'pii'
      : c >= 48 && c <= 57
        ? 'num'
        : /^[$€£]$/.test(t)
          ? 'cur'
          : /^[a-z]/.test(t)
            ? 'word'
            : 'break';
    out.push({ t, k });
  }
  return out;
}

const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));
const rx = (s: string): RegExp => new RegExp(`^(?:${s.trim().split(/\s+/).join('|')})$`);

/** Send and give: money with an amount, a currency, a funds noun or "everything"; in chat also see sendLoose. */
const SEND = rx(
  String.raw`mand[aeo]\w* envi[aeo]\w* reenvi\w* pas[ae](?:le|les|me|melo|selo|sela|nos)\w* pass[ae] passar send\w* resend\w* sent schick\w* envo[iy]\w* renvo[iy]\w*`,
);
/** Past forms of send: they report a send ("o pix que eu mandei"), so they never take the loose chat rule. */
const SEND_PAST = rx(
  String.raw`sent mand(?:e|ei|o|ou|aste|aron|ado|ada|ados|adas) envi(?:e|ei|o|ou|aste|aron|ado|ada|ados|adas) envoye\w* geschickt gesendet passei passou`,
);
/** A send verb with a third-person object pronoun attached: "mándalo", "envíale", "pásaselo", "reenvíalo". */
const SEND_CLITIC = /(?:lo|la|los|las|le|les|selo|sela|selos|selas|melo|mela)$/;
/** Object pronouns written as their own word: "send it", "envoie-le", "schick es". Only when nothing but a recipient follows. */
const PRONOUN = set(
  'it them that this lo la le les los las ele ela eles elas o a es das ihn ihm ihr sie ca cela',
);
/** Things people send that are not money. A send verb whose object is one of these is never money by the loose rule. */
const NOT_MONEY_OBJ =
  set(`saludos saludo saludito besos beso abrazo abrazos foto fotos imagen captura pantallazo video audio nota mensaje mensajes
  catalogo menu carta ubicacion direccion link enlace info informacion detalles datos documento documentos archivo pdf lista precios
  factura recibo comprobante ticket codigo pedido paquete encomienda tarea correo email mail contrasena clave
  greetings regards love hug hugs photo photos picture pic pics image screenshot message messages text catalog catalogue
  location address directions details data document file files list prices invoice receipt code order package parcel homework password
  cardapio endereco localizacao mensagem imagem arquivo recibo boleto beijos abraco abracos recado recados aviso comprovante comprovantes
  bonjour bises bisous salutations amities photo photos adresse localisation lien liste prix facture recu commande colis
  grusse gruesse gruss foto bild bilder adresse standort nachricht datei liste preise rechnung beleg bestellung paket katalog`);
/** Words that ask to repeat the last send or transfer: "otro igual", "lo mismo", "nochmal dasselbe", "send it again". */
const REPEAT_STRONG =
  /\b(?:otr[oa] (?:igual|mas)|outr[oa] (?:igual|mais)|mais uma?|lo mismo|la misma|o mesmo|a mesma|same again|another one|one more|une? autre|la meme chose|pareil|nochmal|noch ?einmal|nochmals|dasselbe|das ?selbe|das gleiche)\b/;
const REPEAT_WEAK =
  /\b(?:again|de nuevo|otra vez|de novo|outra vez|encore|the same|wieder|ultim[oa]|last one|dernier|letzte\w*)\b/;
/** Move: money with an amount, a funds or account noun, or "everything": "move it all to savings", "mueve todo a ahorros". */
const MOVE = rx(String.raw`move[sd]? moving mueve\w* mover\w* muev\w*`);
const GIVE = rx('da(?:le|les|me|selo|rle|rles) dele denle give giving gib gebe geben donne[zr]?');
const MINE = set('mi mis my meu minha mon ma mes mein meine meinen');
/** Transfer: a financial verb on its own, unless it hands the customer over to a person ("transfer me to a human"). */
const XFER = rx(
  String.raw`tra(?:n)?sfier\w* tra(?:n)?sferi\w* transfere[sm]? transfer[ae] transfira\w* transfer(?:er|ez|ons|ing|ring|red|ed)? tranfer\w* trasnfer\w* ue?berweis(?!ung)\w* ue?berwiesen vire[rz]? wire[ds]? wiring`,
);
/** Pay: on its own, except English idioms ("pay attention"). */
const PAY = rx(
  String.raw`pag[aou]\w* paye[rz]? payons payent paie paies pay paying payin paid zahl(?:e|en|t|st)? bezahl\w*`,
);
const PAY_IDIOM = set('attention heed respect respects homage tribute mind');
/** French "régler" (settle): pay only with an amount, money, an account or a bill ("règle ma facture"). */
const PAY_WEAK = rx('regl(?:e|es|ez|er|ons|ent)');
const BILL = set(
  'facture factures factura facturas bill bills invoice invoices rechnung rechnungen boleto boletos',
);
/** Withdraw and deposit: on their own, except "remove me" ("retirez moi de la liste"). */
const CASH = rx(
  String.raw`retir[aeo]\w* withdr[ae]w\w* cashout abheb\w* abzuheben abgehoben auszahl\w* auszuzahlen einzahl\w* einzuzahlen deposit\w* depos(?:er|e|ez|es|ons) saque\w*`,
);
/** Everyday verbs that also mean "withdraw": need an amount, a currency, a funds noun or an account noun. */
const CASH_WEAK = rx('sac(?:ar|a|o|as|ame|ale|alo|amos|an|ou)');
/** Add, put, load: money with a funds noun ("agregar fondos"), or an amount plus an account noun ("add 50 to my wallet"). */
const GENERIC = rx(
  String.raw`add\w* put load\w* fund agreg\w* anad\w* pon(?:er|le|me|ga|go|gan|gale|game)? met(?:e|er|ele|eme|o|s|tre|tez|ts) carg(?:a|ar|o|ue|uen|ale|ame|uele)\w* coloc\w* adicion\w* bot[ae]\w* ajout\w* aliment\w* credit(?:er|ez)`,
);
/** Phone top-up: money with an amount, a currency, a phone or airtime credit. */
const TOPUP = rx(
  String.raw`recarg\w* recarreg\w* recharg\w* topup\w* reload\w* refill\w* auflad\w* aufzuladen aufgeladen`,
);
/** "Charge the battery" and "reload the page" are not top-ups. */
const TOPUP_NOT = set(
  'akku batterie battery bateria ladegerat charger cargador carregador chargeur page pagina seite site browser navegador navigateur pantalla screen ecran bildschirm',
);
/** Nouns that name a money movement: an action with an amount or a currency, or after "make a ...". */
const ACTION_NOUN = rx(
  String.raw`tra(?:n)?sferencia\w* transfert\w* transfers virement\w* ue?berweisung\w* pix giro\w* remesa\w* retrait\w* depot\w* auszahlung\w* einzahlung\w* abhebung\w* zahlung\w* paiement\w* payment\w* withdrawal\w* remittance\w* bizum zelle`,
);
const DO = rx(
  String.raw`haz\w* hace[rs]? hago hag[ao]\w* faz\w* faca fais faire faites mach\w* make making realiza\w* efectua\w* effectue\w* efetua\w*`,
);

/** Money itself, and phone credit. */
const FUNDS = set(
  'dinero plata lana efectivo fondos saldo credito creditos cash money funds credit credits dinheiro grana fundos argent fonds sous geld guthaben bargeld handyguthaben ahorros ganancias savings earnings winnings',
);
const AIRTIME = set('saldo credito creditos credit credits guthaben handyguthaben');
const ACCOUNT = set(
  'billetera monedero cuenta wallet account carteira conta portefeuille compte konto banco bank banque',
);
const PHONE_NOUN = set(
  'celular cel telefono movil numero linea phone number cell cellphone mobile telefone portable telephone handy nummer prepaid',
);
const CURRENCY =
  set(`usd eur mxn cup mlc cop ars brl pen bob clp pyg uyu gtq hnl nio crc dop htg ves bs gbp cad chf fcfa cfa xof xaf
  dolar dolares dollar dollars dolars bucks buck peso pesos euro euros real reais soles boliviano bolivianos lempira lempiras
  guarani guaranies quetzal quetzales colones cordobas gourde gourdes franc francs franco francos balles conto contos centavos cents
  pound pounds libras lucas pavos varos bolivares`);
/** "Everything", "the rest" and fractions of it ("half"). */
const ALL = set(
  'todo toda todito tudo all everything tout toute alles ganze ganzes ganzen gesamte gesamtes entire whole resto rest reste mitad half metade moitie halfte haelfte',
);
/** Prepositions that introduce who receives: "a Ana", "to ana", "para", "pra", "pour", "à", "an", "für". */
const PREP = set('a al para pa to for pra pro ao pour au aux vers an fur fuer nach sur auf');
const ME = set('me moi mich nos us');
const HUMAN = rx(
  String.raw`human\w* agente?s? agents? asesor\w* operador\w* operator\w* atendente\w* conseiller\w* representante\w* representative\w* supervisor\w* mitarbeiter\w* berater\w* advisor\w* ejecutiv\w*`,
);
/** Before "transfer", these make it a noun ("did the transfer arrive?"), which needs an amount to be an action. */
const EN_DET = set('the my a an this that your our his her last previous bank wire money another');
const POLITE = set(
  'porfa porfavor xfa pls plz please plis pfv pf svp stp bitte ya ahora now hoy today hj agora jetzt maintenant ai',
);

/** Numbers as words. Left out on purpose: words that are also articles (un, una, um, one, ein, une) and "once". */
const NUM_WORD =
  rx(String.raw`dos tres cuatro cinco seis siete ocho nueve diez doce trece catorce quince veinte veinti\w+ treinta cuarenta cincuenta sesenta setenta ochenta noventa
  cien ciento doscient\w+ trescient\w+ cuatrocient\w+ quinient\w+ seiscient\w+ setecient\w+ ochocient\w+ novecient\w+ mil millon millones
  two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fourty fifty sixty seventy eighty ninety hundred thousand
  dois duas quatro sete oito nove dez vinte trinta quarenta cinquenta sessenta oitenta cem cento duzent\w+ trezent\w+ quinhent\w+
  deux trois quatre cinq sept huit neuf dix vingt trente quarante cinquante soixante cent mille
  zwei drei vier funf fuenf sechs sieben acht neun zehn elf zwolf zwoelf zwanzig dreissig vierzig funfzig fuenfzig sechzig siebzig achtzig neunzig hundert tausend`);
/** After a number these make it a time or a count, not an amount: "2 horas", "10 am", "3 veces". */
const NOT_AMOUNT_AFTER = rx(
  String.raw`h hs hrs am pm uhr horas? hours? heures? stunden? minut\w* min seg segundos? seconds? secs? sekunden? secondes? dias? days? jours? tage? tagen semanas? weeks? mes meses months? anos? years? veces vez times fois mal`,
);
/** Before a number these make it a reference or a clock time: "pedido 4521", "a las 10". */
const NOT_AMOUNT_BEFORE = set(
  'pedido orden order ticket codigo code bestellung commande referencia reference ref nro las as at um vers',
);
/** After one of these, "pago", "retiro", "depósito" or "payment" is a noun ("¿ya llegó mi pago?"), which needs an amount. */
const DET = set(
  'el la los las un una mi mis tu su sus the my a an your his her this that o os um uma meu minha seu sua mon ma le les une mein meine der die das den dem ein eine',
);
const NOUN_FORM = rx(
  'pagos? pagamentos? payments? retiros? saques? depositos? deposits? withdrawals? zahlungs?',
);
const THOUSAND = set('mil k thousand mille tausend');
/** German separable verbs: "lade ... auf" (top up), "heb ... ab" (withdraw). The particle closes the clause. */
const LAD = set('lad lade');
const HEB = set('heb hebe');
/** Words that start another request: "… y transfiere", "… and also send", "… et paye", "… und zahl". */
const CONJ = set(
  'y e and et und also tambien tb tbm ademas luego despues then plus puis ensuite aussi dann auch depois tambem pero but mais aber',
);

/** Splits at punctuation and at words that start another request. */
export function clauses(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  for (const x of toks) {
    // "heb dann 100 Euro ab": a separable stem waiting for its particle keeps the clause open.
    const last = cur[cur.length - 1];
    const stemOpen =
      last !== undefined && last.k === 'word' && (LAD.has(last.t) || HEB.has(last.t));
    if (x.k === 'break' || (x.k === 'word' && CONJ.has(x.t) && !stemOpen)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(x);
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface MoneySignals {
  /** The text asks to move or spend money: send, transfer, pay, withdraw, deposit, add funds or top up. */
  action: boolean;
  /** A phone top-up is named ("recarga", "top up", "ponle saldo", "aufladen"), with or without its details. */
  topupWord: boolean;
  /** A money action that is not a phone top-up. The no-model path never handles these. */
  other: boolean;
  /** How many amounts the text holds (digits, or number words next to a currency or a recipient). */
  amounts: number;
  /** The amount, when the text holds exactly one and it is written in plain digits ("20", "20,50", "5 mil"). Otherwise null. */
  amountValue: number | null;
  /** An amount tied to a recipient: "10 a Ana", "20 dollars … to ana@example.com". */
  amountToRecipient: boolean;
  /** Verbs set aside because they hand the customer over to a person: "transfer me to a human". */
  excused: string[];
  /** Which rules fired, for explanations and tests. */
  why: string[];
}

/**
 * `chat` (the default) adds the loose chat rules: a send whose object is implied, "everything", a repeat
 * or a recipient. Studio, agent and API text leave them off: "send the form to the endpoint" is code.
 */
export function signalsOf(toks: Tok[], chat = true): MoneySignals {
  const w = (i: number): string => {
    const x = toks[i];
    return x && x.k === 'word' ? x.t : '';
  };
  const kind = (i: number): TokKind | undefined => toks[i]?.k;
  const has = (s: Set<string>): boolean => toks.some((x) => x.k === 'word' && s.has(x.t));
  const isCur = (i: number): boolean => kind(i) === 'cur' || CURRENCY.has(w(i));
  const isNumWord = (i: number): boolean => NUM_WORD.test(w(i));
  /** An email, phone, card or IBAN, or a preposition followed by a name: "a ana", "to my mom", "an [email_1]". */
  const isRecipient = (i: number): boolean =>
    kind(i) === 'pii' ||
    (PREP.has(w(i)) && (kind(i + 1) === 'pii' || (kind(i + 1) === 'word' && !isNumWord(i + 1))));

  // Amounts. Digits count unless they are a time, a count of days or a reference number.
  // A number word counts only next to a currency, a recipient or the end of the clause ("send forty to Beto").
  let amounts = 0;
  const values: (number | null)[] = [];
  let withCurrency = false;
  let numToRecipient = false;
  for (let i = 0; i < toks.length; i++) {
    if (kind(i) === 'num') {
      if (kind(i - 1) === 'num') continue;
      let j = i + 1;
      while (kind(j) === 'num') j++;
      if (
        (toks[i] as Tok).t.includes(':') ||
        NOT_AMOUNT_AFTER.test(w(j)) ||
        NOT_AMOUNT_BEFORE.has(w(i - 1))
      )
        continue;
      amounts++;
      // The value is kept only when it is unambiguous: "20", "20,50", "5 mil", "5k". Not "1.500" or "80 000".
      const plain = j === i + 1 && /^\d{1,6}(?:[.,]\d{1,2})?$/.test((toks[i] as Tok).t);
      const times = THOUSAND.has(w(j)) ? 1000 : isNumWord(j) ? 0 : 1;
      values.push(plain && times ? Number((toks[i] as Tok).t.replace(',', '.')) * times : null);
      if (isNumWord(j) || w(j) === 'k') j++;
      if (isCur(i - 1) || isCur(j)) withCurrency = true;
      if (isCur(j)) j++;
      if (POLITE.has(w(j))) j++;
      if (isRecipient(j)) numToRecipient = true;
    } else if (isNumWord(i) && !isNumWord(i - 1) && kind(i - 1) !== 'num') {
      let j = i + 1;
      while (isNumWord(j)) j++;
      if (
        !(
          j >= toks.length ||
          kind(j) === 'break' ||
          kind(j) === 'pii' ||
          isCur(j) ||
          PREP.has(w(j)) ||
          POLITE.has(w(j))
        )
      )
        continue;
      amounts++;
      values.push(null);
      if (isCur(j)) withCurrency = true;
    }
  }
  const worth = amounts > 0 || toks.some((_, i) => isCur(i));
  const funds = has(FUNDS);
  const airtime = has(AIRTIME);
  const account = has(ACCOUNT);
  const recipient = toks.some((_, i) => isRecipient(i));
  const phone = has(PHONE_NOUN) || toks.some((x) => x.k === 'pii' && x.t.startsWith('[phone'));
  const all = has(ALL);
  const human = toks.some((x) => x.k === 'word' && HUMAN.test(x.t));
  // The last non-polite word after each token, within its clause. Computed once, so long input stays linear.
  const lastAfter: string[] = new Array(toks.length);
  let lastWord = '';
  for (let j = toks.length - 1; j >= 0; j--) {
    lastAfter[j] = lastWord;
    if (kind(j) === 'break') lastWord = '';
    else if (w(j) && !POLITE.has(w(j)) && lastWord === '') lastWord = w(j);
  }
  /** Is `particle` the last word of the clause that holds token i? ("lade … auf", "heb … ab") */
  const closes = (i: number, particle: string): boolean => lastAfter[i] === particle;
  const said = toks
    .filter((x) => x.k === 'word')
    .map((x) => x.t)
    .join(' ');
  const repeatStrong = REPEAT_STRONG.test(said);
  const repeat = repeatStrong || REPEAT_WEAK.test(said);
  /**
   * Chat only: a send verb with no amount still asks to send money when its object is implied ("mándalo",
   * "send it", "envoie-le"), is "everything" or a fraction, repeats the last send, or goes to a recipient.
   * Not when the object is a known non-money thing ("mándame la ubicación", "manda saludos a Ana").
   * Looks at most 6 tokens ahead, so long input stays linear.
   */
  const sendLoose = (i: number): boolean => {
    const t = w(i);
    if (SEND_PAST.test(t)) return false;
    const obj: string[] = [];
    let toWhom = false;
    for (let j = i + 1; j < Math.min(toks.length, i + 7) && kind(j) !== 'break'; j++) {
      // "envia a foto": "a" is an article here, not "to".
      if (isRecipient(j) && !NOT_MONEY_OBJ.has(w(j + 1))) {
        toWhom = true;
        break;
      }
      if (w(j)) obj.push(w(j));
    }
    // German puts the verb last: "kannst du mir die rechnung nochmal schicken?" names the object before it.
    if (!lastAfter[i])
      for (let j = i - 1; j >= Math.max(0, i - 6) && kind(j) !== 'break'; j--)
        if (w(j)) obj.push(w(j));
    if (obj.some((o) => NOT_MONEY_OBJ.has(o))) return false;
    const content = obj.filter((o) => !POLITE.has(o) && !ME.has(o) && o !== 'mir' && o !== 'uns');
    const first = content[0] ?? '';
    const after = content[1] ?? '';
    const pronoun = PRONOUN.has(first) && (!after || PREP.has(after) || REPEAT_WEAK.test(after));
    return SEND_CLITIC.test(t) || pronoun || obj.some((o) => ALL.has(o)) || repeat || toWhom;
  };

  let send = false,
    sendTopup = false,
    xfer = false,
    pay = false,
    cash = false,
    cashWeak = false,
    payWeak = false;
  let generic = false,
    topupTok = false,
    noun = false,
    doNoun = false,
    loose = false,
    move = false;
  const excused: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = w(i);
    if (!t) continue;
    const enNoun = t === 'transfer' && EN_DET.has(w(i - 1));
    // "mi pago", "el retiro", "my payment": a noun, which counts only with an amount or after "make a …".
    const detNoun = DET.has(w(i - 1)) && NOUN_FORM.test(t);
    if (GIVE.test(t)) send = true;
    if (SEND.test(t)) {
      // "manda saldo", "send a top-up": the thing sent is phone credit. "Mándame mi saldo" is not: that is a cash-out.
      const object = [w(i + 1), w(i + 2), w(i + 3)];
      if (object.some((o) => AIRTIME.has(o) || TOPUP.test(o)) && !object.some((o) => MINE.has(o)))
        sendTopup = true;
      else {
        send = true;
        if (chat && !loose && sendLoose(i)) loose = true;
      }
    }
    if (MOVE.test(t)) move = true;
    if (XFER.test(t) && !enNoun) {
      const clitic = /^tra(?:n)?sf\w+[aeir]n?(?:me|nos)$/.test(t);
      if (!worth && (clitic || ME.has(w(i - 1)) || ME.has(w(i + 1)) || human)) excused.push(t);
      else xfer = true;
    }
    if (
      PAY.test(t) &&
      !detNoun &&
      !PAY_IDIOM.has(w(i + 1)) &&
      !(w(i + 1) === 'a' && w(i + 2) === 'visit')
    )
      pay = true;
    if (
      CASH.test(t) &&
      !detNoun &&
      (worth || !(ME.has(w(i + 1)) || /^retir\w*[aeir]n?(?:me|nos)$/.test(t)))
    )
      cash = true;
    if (t === 'cash' && (w(i + 1) === 'out' || w(i + 2) === 'out')) cash = true;
    if (HEB.has(t) && closes(i, 'ab')) cash = true;
    if (CASH_WEAK.test(t) || (t === 'take' && w(i + 1) === 'out')) cashWeak = true;
    if (PAY_WEAK.test(t)) payWeak = true;
    if (GENERIC.test(t)) generic = true;
    if (TOPUP.test(t) || (t === 'top' && w(i + 1) === 'up') || (LAD.has(t) && closes(i, 'auf')))
      topupTok = true;
    if (ACTION_NOUN.test(t) || enNoun || detNoun) {
      noun = true;
      if (DO.test(w(i - 1)) || DO.test(w(i - 2)) || DO.test(w(i - 3))) doNoun = true;
    }
  }

  const airtimeAdd = generic && airtime;
  const topupLex = (topupTok || sendTopup) && !has(TOPUP_NOT);
  const rules: [string, boolean][] = [
    ['send', send && (worth || funds || (all && recipient) || loose)],
    ['move', move && (worth || funds || all || account)],
    // "faz outro igual" after "meu pix chegou?": repeat the last movement.
    ['repeat', chat && repeatStrong && (noun || topupTok)],
    ['transfer', xfer],
    ['pay', pay || (payWeak && (worth || funds || account || has(BILL)))],
    ['withdraw_deposit', cash || (cashWeak && (worth || funds || account || all))],
    [
      'add_funds',
      (generic && (funds || (worth && account))) || ((topupLex || airtimeAdd) && account && worth),
    ],
    ['movement_noun', noun && (worth || doNoun)],
    ['topup', (topupLex || airtimeAdd) && (worth || phone || airtime)],
    ['amount_recipient', numToRecipient || (withCurrency && recipient)],
  ];
  const why = rules.filter(([, on]) => on).map(([name]) => name);
  const fired = (name: string): boolean => why.includes(name);
  const topupWord = (topupLex || airtimeAdd) && !account;
  const other =
    fired('send') ||
    fired('move') ||
    fired('repeat') ||
    fired('transfer') ||
    fired('pay') ||
    fired('withdraw_deposit') ||
    fired('movement_noun') ||
    (fired('add_funds') && !topupWord) ||
    (fired('amount_recipient') && !topupWord) ||
    ((topupLex || airtimeAdd) && account);
  return {
    action: why.length > 0,
    topupWord,
    other,
    amounts,
    amountValue: (amounts === 1 && values[0]) || null,
    amountToRecipient: fired('amount_recipient'),
    excused,
    why,
  };
}

/** A word that can make a clause a money action: a send, transfer, pay, withdraw, add, move or top-up verb, or a movement noun. */
export function isMoneyWord(t: string): boolean {
  return [SEND, GIVE, XFER, PAY, CASH, CASH_WEAK, GENERIC, TOPUP, ACTION_NOUN, MOVE].some((re) =>
    re.test(t),
  );
}

/** Infinitives and gerunds (es, pt, fr: -ar/-er/-ir, with clitics; -ando/-endo/-indo; en -ing) and German "abzuheben". */
/** Prepositions that take a noun: "por recarga", "costo de envío", "cost of sending", "via pix". */
const OF = set('por de del of par per com con with avec mit via en in by sin sem sans ohne');
const NON_FINITE =
  /^(?:\w{2,}(?:ar|er|ir)(?:le|les|lo|la|los|las|me|te|se|nos|selo|sela)?|\w{2,}(?:ando|iendo|endo|indo|ing)(?:le|lo|la|me|se)?|\w+zu\w{3,})$/;

/**
 * Is the money word at token i only the topic of a question that comes before it? True for a noun, an infinitive
 * or gerund, a verb after "to" or "zu", or a word after an article or preposition: "cuánto cuesta enviar…",
 * "how much does it cost to send…", "was kostet es … zu schicken", "combien coûte un virement…".
 * False for a finite verb ("manda", "send", "überweise"): that is a request, whatever question follows.
 * English "transfer" is a bare verb, not an infinitive, even though it ends in -er.
 */
export function isNonFinite(toks: Tok[], i: number): boolean {
  const t = toks[i]?.t ?? '';
  const prev = toks[i - 1]?.k === 'word' ? (toks[i - 1] as Tok).t : '';
  if (ACTION_NOUN.test(t) || NOUN_FORM.test(t)) return true;
  if (prev === 'to' || prev === 'zu' || DET.has(prev) || PREP.has(prev) || OF.has(prev))
    return true;
  return NON_FINITE.test(t) && !/^tra\w*fer$/.test(t);
}

/** Signals for accent-free lowercase text (raw or already masked). */
export function moneySignals(normalized: string): MoneySignals {
  return signalsOf(tokenize(moneyView(normalized)));
}

/** Words that only add a detail to a top-up: "number is …", "30 Euro auf die …", "para el …". */
const DETAIL =
  set(`is es e est ist son su sus her his my mi dela dele sa ihre seine el la le die das der the o a al to for para pra pro pour
  sur auf an fur fuer de del of von with con com avec mit its it s por favor`);

/** True when a clause holds nothing but top-up details: an amount, a currency, a phone, "number is". */
export function isTopupDetail(toks: Tok[]): boolean {
  return toks.every(
    (x) =>
      x.k === 'num' ||
      x.k === 'cur' ||
      (x.k === 'pii' && x.t.startsWith('[phone')) ||
      (x.k === 'word' &&
        (DETAIL.has(x.t) ||
          CURRENCY.has(x.t) ||
          PHONE_NOUN.has(x.t) ||
          POLITE.has(x.t) ||
          NUM_WORD.test(x.t))),
  );
}
