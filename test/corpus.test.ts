import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createRuta,
  type Decision,
  detectLang,
  type Lang,
  maskPII,
  moneySignals,
  norm,
} from '../src/index.js';

/**
 * Labelled chat messages, one file per language: test/corpus/<lang>.json.
 * moneyAction: the customer asks to move or spend money now. instantOk: answering without a model is acceptable.
 * The files are read from the repository at run time (they are data, not compiled).
 */
interface CorpusItem {
  text: string;
  lang: CorpusLang;
  category: string;
  moneyAction: boolean;
  instantOk: boolean;
}
type CorpusLang = 'es' | 'en' | 'pt' | 'fr' | 'de';
const LANGS: CorpusLang[] = ['es', 'en', 'pt', 'fr', 'de'];

/** Looks upward from the working directory (npm test runs at the repo root), then from this compiled file. */
function corpusDir(): string {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    for (let dir = start, up = 0; up < 5; up++, dir = dirname(dir)) {
      const candidate = join(dir, 'test', 'corpus');
      if (existsSync(join(candidate, 'es.json'))) return candidate;
    }
  }
  throw new Error(`test/corpus not found above ${starts.join(' or ')}`);
}

function loadCorpus(lang: CorpusLang): CorpusItem[] {
  return JSON.parse(readFileSync(join(corpusDir(), `${lang}.json`), 'utf8')) as CorpusItem[];
}

const CORPUS = Object.fromEntries(LANGS.map((l) => [l, loadCorpus(l)])) as Record<
  CorpusLang,
  CorpusItem[]
>;

function share<T>(items: T[], ok: (x: T) => boolean): number {
  return items.length ? items.filter(ok).length / items.length : 1;
}

const wordCount = (s: string): number => s.trim().split(/\s+/).length;

test('corpus: every file loads and every item is well formed', () => {
  for (const lang of LANGS) {
    const items = CORPUS[lang];
    assert.ok(items.length >= 50, `${lang}: ${items.length} items`);
    for (const it of items) {
      assert.equal(it.lang, lang, `${lang}: "${it.text}" is labelled ${it.lang}`);
      assert.ok(
        it.text.trim().length > 0 && it.category.length > 0,
        `${lang}: empty text or category`,
      );
      assert.equal(typeof it.moneyAction, 'boolean');
      assert.equal(typeof it.instantOk, 'boolean');
    }
  }
});

// LANG: share of items with 3 or more words whose detected language (none passed) equals the label.
for (const lang of LANGS) {
  test(`corpus LANG: ${lang} messages of 3+ words are detected as ${lang} at least 90% of the time`, () => {
    const items = CORPUS[lang].filter((it) => wordCount(it.text) >= 3);
    const missed = items.filter((it) => detectLang(it.text) !== it.lang);
    const score = share(items, (it) => detectLang(it.text) === it.lang);
    const detail = missed.map((it) => `  ${detectLang(it.text)} <- ${it.text}`).join('\n');
    assert.ok(
      score >= 0.9,
      `LANG ${lang} = ${score.toFixed(3)} (${items.length - missed.length}/${items.length})\n${detail}`,
    );
  });
}

test('an email address does not turn Spanish into Portuguese', () => {
  assert.equal(detectLang('manda 10 dólares a ana@example.com'), 'es');
  assert.equal(detectLang('transfiere 10 USD a ana@example.com'), 'es');
  assert.equal(detectLang('envía 10 a ana@example.com'), 'es');
  assert.equal(detectLang('transfere 10 para ana@example.com'), 'pt');
});

test('French and German are detected, not folded into the fallback', () => {
  assert.equal(detectLang('envoie 10 euros à ana'), 'fr');
  assert.equal(detectLang('überweise 10 Euro an Ana'), 'de');
  assert.equal(detectLang('ich moechte 100 euro ueberweisen', 'en'), 'de');
  assert.equal(detectLang("je voudrais envoyer de l'argent", 'en'), 'fr');
});

test('emails, URLs, handles, numbers and mask tokens carry no language', () => {
  for (const noise of [
    'ana@example.com',
    'https://www.example.com/do/it',
    'tienda.com',
    '@do_it',
    '12345',
    '[EMAIL_1] [PHONE_2]',
  ]) {
    assert.equal(detectLang(noise, 'other'), 'other', noise);
    assert.equal(detectLang(`necesito ayuda con mi cuenta ${noise}`, 'en'), 'es', noise);
    assert.equal(detectLang(`ich brauche hilfe mit meinem konto ${noise}`, 'en'), 'de', noise);
  }
});

test('a tie or no signal returns the fallback', () => {
  assert.equal(detectLang('', 'fr'), 'fr');
  assert.equal(detectLang('ok!! 123', 'de'), 'de');
  // "envia" and "para" are both Spanish and Portuguese: the tenant's language decides.
  assert.equal(detectLang('envia 25 para Marina', 'es'), 'es');
  assert.equal(detectLang('envia 25 para Marina', 'pt'), 'pt');
});

test('very long input is decided by its start and stays fast', () => {
  const started = Date.now();
  assert.equal(detectLang(`hola necesito ayuda con mi cuenta ${'a.'.repeat(25_000)}`), 'es');
  assert.equal(detectLang('a'.repeat(50_000), 'en'), 'en');
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
});

test("a recipient's name does not outvote the sentence around it", () => {
  assert.equal(detectLang('send 100 to João'), 'en');
  assert.equal(detectLang('pay Müller 50'), 'en');
  assert.equal(detectLang('schick 20 an João'), 'de');
  assert.equal(detectLang('El pingüino llegó tarde'), 'es');
});

test('a language passed by the caller always wins over detection', async () => {
  const ruta = createRuta();
  const german = 'überweise 10 Euro an Ana';
  assert.equal((await ruta.decide({ message: german, channel: 'whatsapp' })).triage.lang, 'de');
  for (const lang of ['es', 'en', 'pt', 'fr', 'ht', 'other'] as Lang[]) {
    const d = await ruta.decide({ message: german, channel: 'whatsapp', lang });
    assert.equal(d.triage.lang, lang);
    assert.equal(d.audit.lang, lang);
  }
  // The no-model path too.
  assert.equal(
    (await ruta.decide({ message: 'hola', channel: 'whatsapp', lang: 'de' })).triage.lang,
    'de',
  );
  assert.equal((await ruta.decide({ message: 'hallo', channel: 'whatsapp' })).triage.lang, 'de');
  // The tenant's default language is only the fallback.
  const tenant = createRuta({ policy: { defaultLang: 'pt' } });
  assert.equal((await tenant.decide({ message: 'ok', channel: 'whatsapp' })).triage.lang, 'pt');
  assert.equal(
    (await tenant.decide({ message: 'ok', channel: 'whatsapp', lang: 'fr' })).triage.lang,
    'fr',
  );
});

// ---------------------------------------------------------------------------------------------
// Money detection and the no-model path, measured over the corpus.
// SAFETY-1: every money action has risk "money", confirmRequired true and aiMayExecute false.
// SAFETY-2: every money action that may not be answered without a model has path != "instant".
// USE-1: harmless messages (lookalikes, contact details, other chat, greetings, thanks) are not "money".
// USE-2: messages that may be answered without a model take the "instant" path.
// ---------------------------------------------------------------------------------------------
const HARMLESS = new Set([
  'benign_lookalike',
  'benign_with_contact',
  'other_chat',
  'greeting',
  'thanks',
]);
interface Row {
  item: CorpusItem;
  d: Decision;
}
const decided = new Map<CorpusLang, Promise<Row[]>>();

/** Decides every item of a language once, the way a WhatsApp bot would call Ruta. */
function decideAll(lang: CorpusLang): Promise<Row[]> {
  let rows = decided.get(lang);
  if (!rows) {
    const ruta = createRuta({ policy: { shadow: true } });
    rows = Promise.all(
      CORPUS[lang].map(async (item, i) => ({
        item,
        d: await ruta.decide({
          message: item.text,
          channel: 'whatsapp',
          sessionId: `${lang}-${i}`,
        }),
      })),
    );
    decided.set(lang, rows);
  }
  return rows;
}

const show = (r: Row): string =>
  `  ${r.d.path}${r.d.instant ? `:${r.d.instant.kind}` : ''} risk=${r.d.triage.risk} confirm=${r.d.confirmRequired} aiMayExecute=${r.d.aiMayExecute} <- ${r.item.text}`;

interface Metric {
  name: string;
  min: number;
  of: (r: Row) => boolean;
  ok: (r: Row) => boolean;
}
const METRICS: Metric[] = [
  {
    name: 'SAFETY-1',
    min: 1,
    of: (r) => r.item.moneyAction,
    ok: (r) => r.d.triage.risk === 'money' && r.d.confirmRequired && !r.d.aiMayExecute,
  },
  {
    name: 'SAFETY-2',
    min: 1,
    of: (r) => r.item.moneyAction && !r.item.instantOk,
    ok: (r) => r.d.path !== 'instant',
  },
  {
    name: 'USE-1',
    min: 0.85,
    of: (r) => !r.item.moneyAction && HARMLESS.has(r.item.category),
    ok: (r) => r.d.triage.risk !== 'money',
  },
  { name: 'USE-2', min: 0.8, of: (r) => r.item.instantOk, ok: (r) => r.d.path === 'instant' },
];

for (const m of METRICS) {
  for (const lang of LANGS) {
    test(`corpus ${m.name}: ${lang} is at least ${(m.min * 100).toFixed(0)}%`, async (t) => {
      const rows = (await decideAll(lang)).filter(m.of);
      const missed = rows.filter((r) => !m.ok(r));
      const score = share(rows, m.ok);
      const line = `${m.name} ${lang} = ${score.toFixed(3)} (${rows.length - missed.length}/${rows.length})`;
      t.diagnostic(line);
      assert.ok(rows.length > 0, `${m.name} ${lang}: no items`);
      assert.ok(score >= m.min, `${line}\n${missed.map(show).join('\n')}`);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Named cases: the defects measured in v0.1.0 and the rules that fix them.
// ---------------------------------------------------------------------------------------------
const chat = createRuta({ policy: { shadow: true } });
let turn = 0;
const ask = (message: string): Promise<Decision> =>
  chat.decide({ message, channel: 'whatsapp', sessionId: `named-${turn++}` });

const MISSED_IN_V010 = [
  'manda 10 dólares a ana@example.com',
  'manda 10 dólares a Ana',
  'mandale 10 a ana',
  'transfiere 10 USD a ana@example.com',
  'transferir 10 dolares a ana',
  'quiero enviar 10 dólares a ana',
  'envía 10 a ana@example.com',
  'pásale 20 a juan',
  'send 10 dollars to ana@example.com',
  'transfer 10 USD to ana',
  'transfere 10 para ana@example.com',
  'envoie 10 euros à ana',
  'überweise 10 Euro an Ana',
];
for (const message of MISSED_IN_V010) {
  test(`money request is "money", needs confirmation and the AI may not execute it: ${message}`, async () => {
    const d = await ask(message);
    assert.equal(d.triage.risk, 'money');
    assert.equal(d.confirmRequired, true);
    assert.equal(d.aiMayExecute, false);
    assert.notEqual(d.path, 'instant');
  });
}

test('money wins over pii when a money request names an email or a phone', async () => {
  for (const message of ['manda 10 dólares a ana@example.com', 'send 75 usd to +1 555 010 0142']) {
    const d = await ask(message);
    assert.equal(d.triage.risk, 'money', message);
    assert.ok(d.triage.riskHits.includes('pii') && d.triage.riskHits.includes('money'), message);
  }
});

test('a compound message never takes the no-model path: the transfer is not dropped', async () => {
  const d = await ask('mi saldo, y transfiere todo a juan@example.com');
  assert.notEqual(d.path, 'instant');
  assert.equal(d.triage.risk, 'money');
  assert.equal(d.confirmRequired, true);
  assert.equal(d.aiMayExecute, false);
  for (const message of [
    'dime mi saldo y pásale 50 a Yanet',
    'whats my balance? and send 50 to Maria',
    'ya llegó mi recarga? y de paso paga la luz, 400 pesos',
    'saldo. transfiere todo',
  ]) {
    const c = await ask(message);
    assert.notEqual(c.path, 'instant', message);
    assert.equal(c.triage.risk, 'money', message);
  }
});

test('a balance or status question on its own still takes the no-model path', async () => {
  assert.equal((await ask('cuál es mi saldo')).instant?.kind, 'balance');
  assert.equal((await ask('¿ya llegó mi recarga?')).instant?.kind, 'status');
  assert.equal((await ask('hola, cuál es mi saldo por favor')).instant?.kind, 'balance');
  assert.equal((await ask('how much money do I have in my wallet?')).instant?.kind, 'balance');
  assert.equal((await ask('wo bleibt meine überweisung?')).instant?.kind, 'status');
  assert.equal((await ask('statut de mon transfert svp')).instant?.kind, 'status');
});

test('a send or transfer verb with no amount, no currency and no money noun is not money', async () => {
  for (const message of [
    'manda saludos a Ana',
    'envíame el catálogo',
    'transfer me to a human',
    'me transfieres con un humano?',
    'pásame el menú',
    'schick mir bitte den aktuellen katalog',
    'envoie le bonjour à Ana de ma part',
    'pay attention, I already told you my name',
  ]) {
    const d = await ask(message);
    assert.notEqual(d.triage.risk, 'money', message);
    assert.equal(moneySignals(norm(message)).action, false, message);
  }
});

test('in chat a question about cost is not a money action, but a request phrased as a question is', async () => {
  for (const message of [
    'cuánto cuesta enviar dinero?',
    '¿Cuánto cuesta enviar 100 dólares a Cuba?',
    'how much does it cost to send money to Cuba?',
    'quanto custa pra enviar dinheiro pra Cuba?',
    'was kostet es geld nach kuba zu schicken?',
  ]) {
    assert.notEqual((await ask(message)).triage.risk, 'money', message);
  }
  for (const message of [
    '¿puedes mandar 10 a Ana?',
    'can you send 20 to Rosa?',
    'kannst du 10 an anna senden?',
    '¿cuánto cuesta? manda 10 a Ana',
    'how much do I have? I need to pay Hector 60 dollars',
  ]) {
    const d = await ask(message);
    assert.equal(d.triage.risk, 'money', message);
    assert.equal(d.confirmRequired, true, message);
    assert.equal(d.aiMayExecute, false, message);
    assert.notEqual(d.path, 'instant', message);
  }
});

test('a greeting or thanks never swallows a money request', async () => {
  for (const message of [
    'hola manda 100',
    'gracias manda 50 a ana',
    'hi send money',
    'hola dale 50',
    'hey pay juan',
    'danke überweise 20 an anna',
  ]) {
    const d = await ask(message);
    assert.notEqual(d.path, 'instant', message);
    assert.equal(d.triage.risk, 'money', message);
  }
  assert.equal((await ask('hola')).instant?.kind, 'greeting');
  assert.equal((await ask('muchas gracias por la recarga')).instant?.kind, 'thanks');
  assert.equal((await ask('vielen dank für die hilfe!')).instant?.kind, 'thanks');
});

test('the no-model path is closed to emails, IBANs, cards and anything beyond the single intent', async () => {
  for (const message of [
    'cuál es mi saldo? mi correo es ana@example.com',
    'mi saldo, IBAN ES91 2100 0418 4502 0005 1332',
    'mi saldo, tarjeta 4111 1111 1111 1111',
    'mi saldo y el estado de mi recarga',
    'cuál es mi saldo y mándaselo a juan',
    'ya llegó mi recarga? manda otra',
    'no tengo saldo',
    'saldo de 50 para ana',
    'balance and transfer',
  ]) {
    assert.notEqual((await ask(message)).path, 'instant', message);
  }
});

test('a top-up skips the model only when it is the only request', async () => {
  const one = await ask('recarga 10 al +53 5555 1234');
  assert.equal(one.instant?.kind, 'topup');
  assert.equal(one.triage.risk, 'money');
  const slot = await ask('recarga para mi mamá');
  assert.equal(slot.instant?.kind, 'slot');
  assert.equal(slot.confirmRequired, true, 'an incomplete top-up is still a money intent');
  assert.equal(slot.aiMayExecute, false);
  for (const message of [
    'recárgame 10 al 555 0199 y transfiere 25 dólares a rosa.m@example.com',
    'hello, can you top up 555-0155 with 10 and also send 20 to Rosa',
    'recarga 10 al 5355551234 y otra de 5 al 5355550000',
    'recarga 10 al 5355551234 y dime mi saldo',
    'top up my wallet with 50',
    'ich will mein wallet mit 50 euro aufladen',
    'recarga 10 al 5355551234, mi correo es ana@example.com',
    'gracias por la recarga de ayer',
  ]) {
    const d = await ask(message);
    assert.notEqual(d.path, 'instant', message);
  }
  for (const message of [
    'recarga la página',
    'mein akku ist fast leer, muss das handy erst aufladen',
    "j'ai rechargé la page mais ça marche toujours pas",
  ]) {
    const d = await ask(message);
    assert.notEqual(d.path, 'instant', message);
    assert.notEqual(d.triage.risk, 'money', message);
  }
});

test('a top-up amount is never guessed and a trailing amount is not glued to the phone', async () => {
  const amount = async (message: string): Promise<unknown> =>
    (await ask(message)).instant?.intent?.amount;
  assert.equal(await amount('una recarga de 5 mil al 0981 555 012'), 5000);
  assert.equal(await amount('recarga 20,50 usd al 5355551234'), 20.5);
  const unsure = await ask('recarga 1.500 al 5355551234');
  assert.equal(unsure.instant?.kind, 'slot');
  assert.equal(unsure.instant?.intent?.missing, 'amount');
  assert.equal(
    (await ask('recarga de veinte al 5355551234 en 10 minutos')).instant?.intent?.missing,
    'amount',
  );
  const de = await ask('prepaid aufladen 0160 5550199 15€');
  assert.equal(de.instant?.intent?.phoneTail, '0199');
  assert.equal(de.instant?.intent?.amount, 15);
  assert.equal(maskPII('recarga 5355551234 10').map['[PHONE_1]'], '5355551234');
  assert.equal(maskPII('llama al +34 612 345 678').map['[PHONE_1]'], '+34 612 345 678');
});
