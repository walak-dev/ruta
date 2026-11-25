import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  createRuta,
  type FaqEntry,
  memoryStore,
  sha256,
  sha256Sync,
  toLogRecord,
} from '../src/index.js';

const VECTORS: [string, string][] = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
  // Non-ASCII: 2-, 3- and 4-byte UTF-8 (ñ, €, →, an emoji made of a surrogate pair).
  ['ñandú: 10 € → José 💸', '94ee0470afe212cc248e35f2dfda6f69f77e2ae9c2fc581a618c136422ed307e'],
  [
    'Überweisung an Jürgen, 20 €',
    'f21d2a1769e674eea040394601e8e604e4d653274709572fa17e9a28d344beaf',
  ],
];

/** Runs fn with globalThis.crypto.subtle hidden (as on runtimes without Web Crypto), then restores it. */
async function withoutSubtle<T>(fn: () => Promise<T>): Promise<T> {
  const c = globalThis.crypto;
  Object.defineProperty(c, 'subtle', { value: undefined, configurable: true });
  try {
    assert.equal(globalThis.crypto.subtle, undefined);
    return await fn();
  } finally {
    delete (c as { subtle?: unknown }).subtle;
  }
}

/** Runs fn with no globalThis.crypto at all (Node 18 without the webcrypto global), then restores it. */
async function withoutCrypto<T>(fn: () => Promise<T>): Promise<T> {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    assert.equal((globalThis as { crypto?: unknown }).crypto, undefined);
    return await fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    else delete (globalThis as { crypto?: unknown }).crypto;
  }
}

test('sha256 matches the FIPS 180-4 vectors and non-ASCII digests', async () => {
  for (const [input, want] of VECTORS) {
    assert.equal(sha256Sync(input), want, `pure: ${JSON.stringify(input)}`);
    assert.equal(await sha256(input), want, `sha256(): ${JSON.stringify(input)}`);
  }
});

test('pure sha256 agrees with node:crypto across block boundaries', () => {
  for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
    const s = `${'a'.repeat(n - 1)}é`;
    assert.equal(
      sha256Sync(s),
      createHash('sha256').update(s, 'utf8').digest('hex'),
      `length ${n}`,
    );
  }
  // A lone surrogate is encoded as U+FFFD, like TextEncoder and node:crypto do.
  assert.equal(
    sha256Sync('a\ud800b'),
    createHash('sha256').update('a\ud800b', 'utf8').digest('hex'),
  );
});

test('without SubtleCrypto, sha256 falls back to the pure implementation with the same digest', async () => {
  const inputs = [
    ...VECTORS.map(([s]) => s),
    'manda 10 dólares a ana@example.com',
    JSON.stringify({ a: 1, b: 'ç' }),
  ];
  const withSubtle = await Promise.all(inputs.map((s) => sha256(s)));
  const fallback = await withoutSubtle(() => Promise.all(inputs.map((s) => sha256(s))));
  assert.deepEqual(fallback, withSubtle);
  for (const h of fallback) assert.match(h, /^[0-9a-f]{64}$/);
});

test('without any global crypto (Node 18), the audit chain still uses real SHA-256', async () => {
  const run = async () => {
    const ruta = createRuta({ store: memoryStore() });
    const a = await ruta.decide({ message: 'hola', channel: 'whatsapp', now: 1_700_000_000_000 });
    const b = await ruta.decide({
      message: 'resume este texto en 3 puntos',
      channel: 'app',
      now: 1_700_000_000_000,
    });
    return { a: a.audit, b: b.audit };
  };
  const { a, b } = await withoutCrypto(run);
  assert.equal(b.prevHash, a.hash);
  for (const h of [a.hash, b.hash, a.inputHash, b.inputHash]) assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(a.inputHash, sha256Sync('hola'));
  const { hash, ...base } = b;
  assert.equal(
    hash,
    sha256Sync(JSON.stringify(base)),
    'the record hash is SHA-256 of the record without its hash',
  );
});

test('toLogRecord keeps routing facts and drops every piece of personal text', async () => {
  const ruta = createRuta();
  const message = 'manda 10 dólares a ana.perez@example.com, mi número es +52 55 1234 5678';
  const d = await ruta.decide({ message, channel: 'whatsapp', sessionId: 's-log' });
  // The Decision itself holds the raw values (masked.map): that is why it must never be logged whole.
  assert.ok(JSON.stringify(d).includes('ana.perez@example.com'));
  const rec = toLogRecord(d);
  const json = JSON.stringify(rec);
  for (const leak of [
    'ana.perez@example.com',
    'ana.perez',
    'example.com',
    '+52',
    '1234 5678',
    '55 1234',
    '5512345678',
    '[EMAIL_',
    '[PHONE_',
    'dólares',
    'manda',
  ]) {
    assert.ok(!json.includes(leak), `log record leaks ${leak}`);
  }
  const allowed = [
    'id',
    'path',
    'tier',
    'model',
    'provider',
    'task',
    'risk',
    'riskHits',
    'lang',
    'confirmRequired',
    'aiMayExecute',
    'maxOutputTokens',
    'estimate',
    'thinkMs',
    'shadow',
    'reasons',
  ];
  for (const k of Object.keys(rec)) assert.ok(allowed.includes(k), `unexpected key ${k}`);
  assert.equal(rec.id, d.id);
  assert.equal(rec.path, d.path);
  assert.equal(rec.risk, 'money');
  assert.equal(rec.confirmRequired, true);
  assert.equal(rec.aiMayExecute, false);
  assert.deepEqual(
    rec.reasons,
    d.reasons.map((r) => r.code),
  );
  assert.deepEqual(Object.keys(rec.estimate).sort(), [
    'baselineCredits',
    'baselineUsd',
    'credits',
    'reserveUsd',
    'savingsPct',
    'usd',
  ]);
  for (const v of Object.values(rec.estimate)) assert.equal(typeof v, 'number');
});

test('toLogRecord on an instant top-up carries neither the number nor the answer', async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: 'recarga 10 al +53 5555 1234', channel: 'whatsapp' });
  assert.equal(d.path, 'instant');
  const json = JSON.stringify(toLogRecord(d));
  // Keys are checked as JSON keys: the task name "intent_topup" is a routing fact and may appear.
  for (const leak of [
    '+53',
    '5555',
    '55551234',
    'Recarga',
    'Top-up',
    'phoneTail',
    '"intent":',
    '"answer":',
    '"explain":',
    '"masked":',
    '"instant":',
  ]) {
    assert.ok(!json.includes(leak), `log record leaks ${leak}`);
  }
});

test('thinkMs covers the whole decide() call, audit included', async () => {
  const store = memoryStore();
  const setLastHash = store.setLastHash.bind(store);
  // A slow audit store: before the fix, this time was left out of thinkMs.
  store.setLastHash = (h: string) => {
    const until = Date.now() + 25;
    while (Date.now() < until) {
      /* wait */
    }
    setLastHash(h);
  };
  const ruta = createRuta({ store });
  for (const message of ['hola', 'resume este texto en 3 puntos']) {
    const t0 = performance.now();
    const d = await ruta.decide({ message, channel: 'whatsapp' });
    const wall = performance.now() - t0;
    assert.ok(d.thinkMs >= 24, `thinkMs ${d.thinkMs} misses the audit step`);
    assert.ok(d.thinkMs <= wall + 1, `thinkMs ${d.thinkMs} exceeds wall time ${wall}`);
    assert.ok(
      d.explain.admin.en.includes(`think ${d.thinkMs.toFixed(1)} ms`),
      'the admin text shows the same figure',
    );
  }
});

test("instant results say whether the answer is final or needs the caller's handler", async () => {
  const faq: FaqEntry[] = [
    {
      id: 'precio-cuba',
      q: ['cuanto cuesta recargar a cuba'],
      a: { es: 'Ves el precio exacto antes de pagar.' },
    },
  ];
  const ruta = createRuta({ faq });
  const cases: [string, string, boolean][] = [
    ['hola', 'greeting', false],
    ['gracias', 'thanks', false],
    ['¿Cuánto cuesta recargar a Cuba?', 'faq', false],
    ['¿ya llegó mi recarga?', 'status', true],
    ['cuál es mi saldo', 'balance', true],
    ['recarga 10 al +53 5555 1234', 'topup', true],
    ['recarga para mi mamá', 'slot', true],
  ];
  for (const [message, kind, needsHandler] of cases) {
    const d = await ruta.decide({ message, channel: 'whatsapp' });
    assert.equal(d.instant?.kind, kind, message);
    assert.equal(d.instant?.needsHandler, needsHandler, `${message}: needsHandler`);
  }
});
