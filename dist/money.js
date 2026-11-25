import { maskPII, norm } from './text.js';
const TOKEN = /\[(?:email|phone|card|iban)_\d+\]|\d+(?:[.,:]\d+)*|[a-z]+|[$€£]|[?!.;,\n]/g;
/** Accent-free lowercase text with PII placeholders. Safe to call on text that is already masked. */
export function moneyView(normalized) {
    return norm(maskPII(normalized).text).replace(/ß/g, 'ss');
}
export function tokenize(view) {
    const out = [];
    for (const t of view.match(TOKEN) ?? []) {
        const c = t.charCodeAt(0);
        const k = t.startsWith('[')
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
const set = (s) => new Set(s.split(/\s+/).filter(Boolean));
const rx = (s) => new RegExp(`^(?:${s.trim().split(/\s+/).join('|')})$`);
/** Send and give: money only with an amount, a currency, a funds noun, or "everything" plus a recipient. */
const SEND = rx(String.raw `mand[aeo]\w* envi[aeo]\w* pas[ae](?:le|les|me|melo|selo|sela|nos)\w* pass[ae] passar send\w* sent schick\w* envo[iy]\w*`);
const GIVE = rx('da(?:le|les|me|selo|rle|rles) dele denle give giving gib gebe geben donne[zr]?');
const MINE = set('mi mis my meu minha mon ma mes mein meine meinen');
/** Transfer: a financial verb on its own, unless it hands the customer over to a person ("transfer me to a human"). */
const XFER = rx(String.raw `tra(?:n)?sfier\w* tra(?:n)?sferi\w* transfere[sm]? transfer[ae] transfira\w* transfer(?:er|ez|ons|ing|ring|red|ed)? tranfer\w* trasnfer\w* ue?berweis(?!ung)\w* ue?berwiesen vire[rz]? wire[ds]? wiring`);
/** Pay: on its own, except English idioms ("pay attention"). */
const PAY = rx(String.raw `pag[aou]\w* paye[rz]? payons payent paie paies pay paying payin paid zahl(?:e|en|t|st)? bezahl\w*`);
const PAY_IDIOM = set('attention heed respect respects homage tribute mind');
/** Withdraw and deposit: on their own, except "remove me" ("retirez moi de la liste"). */
const CASH = rx(String.raw `retir[aeo]\w* withdr[ae]w\w* cashout abheb\w* abzuheben abgehoben auszahl\w* auszuzahlen einzahl\w* einzuzahlen deposit\w* depos(?:er|e|ez|es|ons) saque\w*`);
/** Everyday verbs that also mean "withdraw": need an amount, a currency, a funds noun or an account noun. */
const CASH_WEAK = rx('sac(?:ar|a|o|as|ame|ale|alo|amos|an|ou)');
/** Add, put, load: money with a funds noun ("agregar fondos"), or an amount plus an account noun ("add 50 to my wallet"). */
const GENERIC = rx(String.raw `add\w* put load\w* fund agreg\w* anad\w* pon(?:er|le|me|ga|go|gan|gale|game)? met(?:e|er|ele|eme|o|s|tre|tez|ts) carg(?:a|ar|o|ue|uen|ale|ame|uele)\w* coloc\w* adicion\w* bot[ae]\w* ajout\w* aliment\w* credit(?:er|ez)`);
/** Phone top-up: money with an amount, a currency, a phone or airtime credit. */
const TOPUP = rx(String.raw `recarg\w* recarreg\w* recharg\w* topup\w* reload\w* refill\w* auflad\w* aufzuladen aufgeladen`);
/** "Charge the battery" and "reload the page" are not top-ups. */
const TOPUP_NOT = set('akku batterie battery bateria ladegerat charger cargador carregador chargeur page pagina seite site browser navegador navigateur pantalla screen ecran bildschirm');
/** Nouns that name a money movement: an action with an amount or a currency, or after "make a ...". */
const ACTION_NOUN = rx(String.raw `tra(?:n)?sferencia\w* transfert\w* transfers virement\w* ue?berweisung\w* pix giro\w* remesa\w* retrait\w* depot\w* auszahlung\w* einzahlung\w* abhebung\w* zahlung\w* paiement\w* payment\w* withdrawal\w* remittance\w* bizum zelle`);
const DO = rx(String.raw `haz\w* hace[rs]? hago hag[ao]\w* faz\w* faca fais faire faites mach\w* make making realiza\w* efectua\w* effectue\w* efetua\w*`);
/** Money itself, and phone credit. */
const FUNDS = set('dinero plata lana efectivo fondos saldo credito creditos cash money funds credit credits dinheiro grana fundos argent fonds sous geld guthaben bargeld handyguthaben ahorros ganancias savings earnings winnings');
const AIRTIME = set('saldo credito creditos credit credits guthaben handyguthaben');
const ACCOUNT = set('billetera monedero cuenta wallet account carteira conta portefeuille compte konto banco bank banque');
const PHONE_NOUN = set('celular cel telefono movil numero linea phone number cell cellphone mobile telefone portable telephone handy nummer prepaid');
const CURRENCY = set(`usd eur mxn cup mlc cop ars brl pen bob clp pyg uyu gtq hnl nio crc dop htg ves bs gbp cad chf fcfa cfa xof xaf
  dolar dolares dollar dollars dolars bucks buck peso pesos euro euros real reais soles boliviano bolivianos lempira lempiras
  guarani guaranies quetzal quetzales colones cordobas gourde gourdes franc francs franco francos balles conto contos centavos cents
  pound pounds libras lucas pavos varos bolivares`);
const ALL = set('todo toda todito tudo all everything tout toute alles ganze ganzes ganzen gesamte gesamtes entire whole resto rest reste');
/** Prepositions that introduce who receives: "a Ana", "to ana", "para", "pra", "pour", "à", "an", "für". */
const PREP = set('a al para pa to for pra pro ao pour au aux vers an fur fuer nach sur auf');
const ME = set('me moi mich nos us');
const HUMAN = rx(String.raw `human\w* agente?s? agents? asesor\w* operador\w* operator\w* atendente\w* conseiller\w* representante\w* representative\w* supervisor\w* mitarbeiter\w* berater\w* advisor\w* ejecutiv\w*`);
/** Before "transfer", these make it a noun ("did the transfer arrive?"), which needs an amount to be an action. */
const EN_DET = set('the my a an this that your our his her last previous bank wire money another');
const POLITE = set('porfa porfavor xfa pls plz please plis pfv pf svp stp bitte ya ahora now hoy today hj agora jetzt maintenant ai');
/** Numbers as words. Left out on purpose: words that are also articles (un, una, um, one, ein, une) and "once". */
const NUM_WORD = rx(String.raw `dos tres cuatro cinco seis siete ocho nueve diez doce trece catorce quince veinte veinti\w+ treinta cuarenta cincuenta sesenta setenta ochenta noventa
  cien ciento doscient\w+ trescient\w+ cuatrocient\w+ quinient\w+ seiscient\w+ setecient\w+ ochocient\w+ novecient\w+ mil millon millones
  two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fourty fifty sixty seventy eighty ninety hundred thousand
  dois duas quatro sete oito nove dez vinte trinta quarenta cinquenta sessenta oitenta cem cento duzent\w+ trezent\w+ quinhent\w+
  deux trois quatre cinq sept huit neuf dix vingt trente quarante cinquante soixante cent mille
  zwei drei vier funf fuenf sechs sieben acht neun zehn elf zwolf zwoelf zwanzig dreissig vierzig funfzig fuenfzig sechzig siebzig achtzig neunzig hundert tausend`);
/** After a number these make it a time or a count, not an amount: "2 horas", "10 am", "3 veces". */
const NOT_AMOUNT_AFTER = rx(String.raw `h hs hrs am pm uhr horas? hours? heures? stunden? minut\w* min seg segundos? seconds? secs? sekunden? secondes? dias? days? jours? tage? tagen semanas? weeks? mes meses months? anos? years? veces vez times fois mal`);
/** Before a number these make it a reference or a clock time: "pedido 4521", "a las 10". */
const NOT_AMOUNT_BEFORE = set('pedido orden order ticket codigo code bestellung commande referencia reference ref nro las at um');
const THOUSAND = set('mil k thousand mille tausend');
/** German separable verbs: "lade ... auf" (top up), "heb ... ab" (withdraw). The particle closes the clause. */
const LAD = set('lad lade');
const HEB = set('heb hebe');
/** Words that start another request: "… y transfiere", "… and also send", "… et paye", "… und zahl". */
const CONJ = set('y e and et und also tambien tb tbm ademas luego despues then plus puis ensuite aussi dann auch depois tambem pero but mais aber');
/** Splits at punctuation and at words that start another request. */
export function clauses(toks) {
    const out = [];
    let cur = [];
    for (const x of toks) {
        if (x.k === 'break' || (x.k === 'word' && CONJ.has(x.t))) {
            if (cur.length)
                out.push(cur);
            cur = [];
        }
        else
            cur.push(x);
    }
    if (cur.length)
        out.push(cur);
    return out;
}
export function signalsOf(toks) {
    const w = (i) => {
        const x = toks[i];
        return x && x.k === 'word' ? x.t : '';
    };
    const kind = (i) => toks[i]?.k;
    const has = (s) => toks.some((x) => x.k === 'word' && s.has(x.t));
    const isCur = (i) => kind(i) === 'cur' || CURRENCY.has(w(i));
    const isNumWord = (i) => NUM_WORD.test(w(i));
    /** An email, phone, card or IBAN, or a preposition followed by a name: "a ana", "to my mom", "an [email_1]". */
    const isRecipient = (i) => kind(i) === 'pii' ||
        (PREP.has(w(i)) && (kind(i + 1) === 'pii' || (kind(i + 1) === 'word' && !isNumWord(i + 1))));
    // Amounts. Digits count unless they are a time, a count of days or a reference number.
    // A number word counts only next to a currency, a recipient or the end of the clause ("send forty to Beto").
    let amounts = 0;
    const values = [];
    let withCurrency = false;
    let numToRecipient = false;
    for (let i = 0; i < toks.length; i++) {
        if (kind(i) === 'num') {
            if (kind(i - 1) === 'num')
                continue;
            let j = i + 1;
            while (kind(j) === 'num')
                j++;
            if (toks[i].t.includes(':') ||
                NOT_AMOUNT_AFTER.test(w(j)) ||
                NOT_AMOUNT_BEFORE.has(w(i - 1)))
                continue;
            amounts++;
            // The value is kept only when it is unambiguous: "20", "20,50", "5 mil", "5k". Not "1.500" or "80 000".
            const plain = j === i + 1 && /^\d{1,6}(?:[.,]\d{1,2})?$/.test(toks[i].t);
            const times = THOUSAND.has(w(j)) ? 1000 : isNumWord(j) ? 0 : 1;
            values.push(plain && times ? Number(toks[i].t.replace(',', '.')) * times : null);
            if (isNumWord(j) || w(j) === 'k')
                j++;
            if (isCur(i - 1) || isCur(j))
                withCurrency = true;
            if (isCur(j))
                j++;
            if (POLITE.has(w(j)))
                j++;
            if (isRecipient(j))
                numToRecipient = true;
        }
        else if (isNumWord(i) && !isNumWord(i - 1) && kind(i - 1) !== 'num') {
            let j = i + 1;
            while (isNumWord(j))
                j++;
            if (!(j >= toks.length ||
                kind(j) === 'break' ||
                kind(j) === 'pii' ||
                isCur(j) ||
                PREP.has(w(j)) ||
                POLITE.has(w(j))))
                continue;
            amounts++;
            values.push(null);
            if (isCur(j))
                withCurrency = true;
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
    /** Is `particle` the last word of the clause that holds token i? ("lade … auf", "heb … ab") */
    const closes = (i, particle) => {
        let last = '';
        for (let j = i + 1; j < toks.length && kind(j) !== 'break'; j++)
            if (w(j) && !POLITE.has(w(j)))
                last = w(j);
        return last === particle;
    };
    let send = false, sendTopup = false, xfer = false, pay = false, cash = false, cashWeak = false;
    let generic = false, topupTok = false, noun = false, doNoun = false;
    const excused = [];
    for (let i = 0; i < toks.length; i++) {
        const t = w(i);
        if (!t)
            continue;
        const enNoun = t === 'transfer' && EN_DET.has(w(i - 1));
        if (GIVE.test(t))
            send = true;
        if (SEND.test(t)) {
            // "manda saldo", "send a top-up": the thing sent is phone credit. "Mándame mi saldo" is not: that is a cash-out.
            const object = [w(i + 1), w(i + 2), w(i + 3)];
            if (object.some((o) => AIRTIME.has(o) || TOPUP.test(o)) && !object.some((o) => MINE.has(o)))
                sendTopup = true;
            else
                send = true;
        }
        if (XFER.test(t) && !enNoun) {
            const clitic = /^tra(?:n)?sf\w+[aeir]n?(?:me|nos)$/.test(t);
            if (!worth && (clitic || ME.has(w(i - 1)) || ME.has(w(i + 1)) || human))
                excused.push(t);
            else
                xfer = true;
        }
        if (PAY.test(t) && !PAY_IDIOM.has(w(i + 1)) && !(w(i + 1) === 'a' && w(i + 2) === 'visit'))
            pay = true;
        if (CASH.test(t) && (worth || !(ME.has(w(i + 1)) || /^retir\w*[aeir]n?(?:me|nos)$/.test(t))))
            cash = true;
        if (t === 'cash' && (w(i + 1) === 'out' || w(i + 2) === 'out'))
            cash = true;
        if (HEB.has(t) && closes(i, 'ab'))
            cash = true;
        if (CASH_WEAK.test(t) || (t === 'take' && w(i + 1) === 'out'))
            cashWeak = true;
        if (GENERIC.test(t))
            generic = true;
        if (TOPUP.test(t) || (t === 'top' && w(i + 1) === 'up') || (LAD.has(t) && closes(i, 'auf')))
            topupTok = true;
        if (ACTION_NOUN.test(t) || enNoun) {
            noun = true;
            if (DO.test(w(i - 1)) || DO.test(w(i - 2)) || DO.test(w(i - 3)))
                doNoun = true;
        }
    }
    const airtimeAdd = generic && airtime;
    const topupLex = (topupTok || sendTopup) && !has(TOPUP_NOT);
    const rules = [
        ['send', send && (worth || funds || (all && recipient))],
        ['transfer', xfer],
        ['pay', pay],
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
    const fired = (name) => why.includes(name);
    const topupWord = (topupLex || airtimeAdd) && !account;
    const other = fired('send') ||
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
/** Signals for accent-free lowercase text (raw or already masked). */
export function moneySignals(normalized) {
    return signalsOf(tokenize(moneyView(normalized)));
}
/** Words that only add a detail to a top-up: "number is …", "30 Euro auf die …", "para el …". */
const DETAIL = set(`is es e est ist son su sus her his my mi dela dele sa ihre seine el la le die das der the o a al to for para pra pro pour
  sur auf an fur fuer de del of von with con com avec mit its it s por favor`);
/** True when a clause holds nothing but top-up details: an amount, a currency, a phone, "number is". */
export function isTopupDetail(toks) {
    return toks.every((x) => x.k === 'num' ||
        x.k === 'cur' ||
        (x.k === 'pii' && x.t.startsWith('[phone')) ||
        (x.k === 'word' &&
            (DETAIL.has(x.t) ||
                CURRENCY.has(x.t) ||
                PHONE_NOUN.has(x.t) ||
                POLITE.has(x.t) ||
                NUM_WORD.test(x.t))));
}
