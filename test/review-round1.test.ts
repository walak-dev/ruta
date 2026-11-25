import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuta, type Decision, type FaqEntry } from '../src/index.js';

/** Probe messages from the independent review of 0.2.0, kept as regressions. */
const FAQ: FaqEntry[] = [
  { id: 'horario', q: ['a que hora abren', 'horario de la tienda'], a: { es: 'De 8 a 20.' } },
  {
    id: 'precio',
    q: ['cuanto cuesta recargar a cuba'],
    a: { es: 'Ves el precio antes de pagar.' },
  },
];
const ruta = createRuta({ faq: FAQ, policy: { shadow: true } });
let n = 0;
const ask = (message: string): Promise<Decision> =>
  ruta.decide({ message, channel: 'whatsapp', sessionId: `r1-${n++}` });
const show = (d: Decision): string =>
  `${d.path}${d.instant ? `:${d.instant.kind}` : ''} risk=${d.triage.risk} confirm=${d.confirmRequired}`;

async function moneyRequest(message: string): Promise<void> {
  const d = await ask(message);
  assert.equal(d.triage.risk, 'money', `${message}: ${show(d)}`);
  assert.equal(d.confirmRequired, true, message);
  assert.equal(d.aiMayExecute, false, message);
  assert.notEqual(d.path, 'instant', message);
}

test('a money request followed by a question or a relative clause is still money', async () => {
  for (const message of [
    'manda 50 a juan que es mi hermano',
    'transfiere 100 dólares a mi mamá que es lo que siempre hago',
    'send 50 dollars to ana how much is the fee',
    'send 100 to mom the best way you can',
    'págale 20 a juan como funciona eso',
    'envía 30 euros a ana explícame el costo',
    'überweise 50 euro an anna wie funktioniert das',
    'envoie 20 euros à paul comment ça marche',
    'manda 200 a cuba por la que más conviene',
    'manda 10 a ana cuanto cuesta?',
    'quiero mandar 100 dólares a mi hermana recomiendame como',
  ])
    await moneyRequest(message);
});

test('a question whose money verb is an infinitive or a noun is still only a question', async () => {
  for (const message of [
    '¿cuánto cuesta el envío de 100 dólares a Cuba?',
    'what is the best way to send money to mexico',
    'combien coûte un virement de 100 euros vers Cuba ?',
    'how much does it cost to transfer 200 dollars to Peru?',
  ])
    assert.notEqual((await ask(message)).triage.risk, 'money', message);
});

test('a send with no amount is money when its object is implied, everything, half, a repeat or a recipient', async () => {
  for (const message of [
    "what's my balance\nand send half to mom",
    'hello, send it again',
    'bonjour\nenvoie la moitié à maman',
    'hallo\nschick die hälfte an mama',
    'my balance pls. then move it all to savings',
    'ya llegó mi envío\ny mándale otro igual',
    'meu pix chegou? faz outro igual',
    'ist meine überweisung angekommen? und nochmal dasselbe',
    'gracias envíale la mitad',
    'thx, resend it',
    'merci, renvoie-le',
    'valeu, manda de novo',
  ])
    await moneyRequest(message);
});

test('a send whose object is not money is not money', async () => {
  for (const message of [
    'mándame la ubicación',
    'send me the menu',
    'schick mir die adresse',
    'mándale la foto a mi hermana',
    'envia a foto do produto pra mim',
    'pode mandar o comprovante pro meu email? roberto@example.com',
    'kannst du mir die rechnung vom letzten monat nochmal schicken?',
    'passa aqui amanhã às 10',
  ])
    assert.notEqual((await ask(message)).triage.risk, 'money', message);
});

test('a greeting, thanks or FAQ with a second request never takes the no-model path', async () => {
  for (const message of [
    'hola, manda todo',
    'hola, mándalo ya',
    'gracias, mándale lo mismo',
    'ok gracias, envíalo',
    'gracias, reenvía el último',
    'hi send everything',
    'thanks, send the rest',
    'oi, manda tudo',
    'obrigado, passa o resto',
    'salut, envoie tout',
    'merci, envoie le reste',
    'hallo, schick alles',
    'danke, schick den rest',
    'danke, nochmal senden',
    'hola mándale',
    'hola quiero reembolso',
    'thanks, refund me',
    'hola, cambia contraseña',
    'gracias bloquea mi tarjeta',
    'thanks block my card',
    'gracias olvide contraseña',
    'hola tarjeta robada',
    'hello stolen card',
    'hi delete account',
    'hey cancel subscription',
    'a que hora abren y bloquea mi tarjeta',
    'a que hora abren? y mi saldo',
    'horario de la tienda, manda el resto',
    'cuanto cuesta recargar a cuba? mandalo',
  ])
    assert.notEqual((await ask(message)).path, 'instant', message);
});

test('single greetings, thanks, FAQ questions, statuses and balances still skip the model', async () => {
  const cases: [string, string][] = [
    ['que onda', 'greeting'],
    ['boa tarde, tudo bem?', 'greeting'],
    ['moin zusammen', 'greeting'],
    ['ok thx, gracias', 'thanks'],
    ["merci c'est gentil", 'thanks'],
    ['a que hora abren hoy?', 'faq'],
    ['¿ya llegó mi pago?', 'status'],
    ['ya llegó mi depósito?', 'status'],
    ['did my payment go through?', 'status'],
    ['le llego el dinero a mi mama?', 'status'],
    ['Did my transfer to Rosa arrive?', 'status'],
    ['Ist meine Überweisung an Max angekommen?', 'status'],
    ['oye cuanta plata me queda', 'balance'],
    ['Wie hoch ist mein Guthaben?', 'balance'],
  ];
  for (const [message, kind] of cases) {
    const d = await ask(message);
    assert.equal(d.instant?.kind, kind, `${message}: ${show(d)}`);
  }
});

test('"quiero saldo" asks for phone credit, not a balance lookup', async () => {
  for (const message of ['quiero saldo', 'necesito saldo'])
    assert.notEqual((await ask(message)).instant?.kind, 'balance', message);
  assert.equal((await ask('quiero ver mi saldo')).instant?.kind, 'balance');
});

test('very long chat messages are decided, in bounded time', async () => {
  for (const [unit, size] of [
    ['a ', 256_000],
    ['heb ', 20_000],
    ['a.', 20_000],
    ['a-', 20_000],
  ] as const) {
    const message = unit.repeat(size / unit.length);
    const started = Date.now();
    const d = await ask(message);
    assert.ok(['model', 'refuse'].includes(d.path), `${unit} x ${size}: ${d.path}`);
    assert.ok(Date.now() - started < 1500, `${unit} x ${size}: ${Date.now() - started} ms`);
  }
  const tail = await ask(`${'hola '.repeat(30_000)}. manda 10 a ana`);
  assert.equal(tail.triage.risk, 'money', 'a request after a long paste is still read');
});
