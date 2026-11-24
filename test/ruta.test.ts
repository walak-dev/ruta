import { test } from "node:test";
import assert from "node:assert/strict";
import { createRuta, createSwarm, detectLang, maskPII, luhn, memoryStore, type Decision, type FaqEntry } from "../src/index.js";

const FAQ: FaqEntry[] = [{ id: "precio-cuba", q: ["cuanto cuesta recargar a cuba", "precio de recarga a cuba"], a: { es: "Ves el precio exacto antes de pagar.", en: "You see the exact price before paying." } }];

test("top-up on WhatsApp is handled with zero AI and needs confirmation", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "recarga 10 al +53 5555 1234", channel: "whatsapp" });
  assert.equal(d.path, "instant");
  assert.equal(d.instant?.kind, "topup");
  assert.equal(d.instant?.intent?.["amount"], 10);
  assert.equal(d.instant?.intent?.["phoneTail"], "1234");
  assert.equal(d.confirmRequired, true);
  assert.equal(d.aiMayExecute, false);
  assert.equal(d.estimate.usd, 0);
  assert.ok(!JSON.stringify(d.instant).includes("5555 1234"), "the full number never leaves the masked map");
});

test("missing detail is asked for without AI (slot filling)", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "recarga para mi mamá", channel: "whatsapp" });
  assert.equal(d.path, "instant");
  assert.equal(d.instant?.kind, "slot");
  assert.equal(d.instant?.intent?.["missing"], "phone");
});

test("greetings, FAQ and status lookups cost nothing", async () => {
  const ruta = createRuta({ faq: FAQ });
  assert.equal((await ruta.decide({ message: "hola", channel: "whatsapp" })).instant?.kind, "greeting");
  assert.equal((await ruta.decide({ message: "¿Cuánto cuesta recargar a Cuba?", channel: "whatsapp" })).instant?.kind, "faq");
  assert.equal((await ruta.decide({ message: "¿ya llegó mi recarga?", channel: "whatsapp" })).instant?.kind, "status");
});

test("a refund complaint is not mistaken for a top-up and pins a stronger tier", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "Quiero un reembolso porque me cobraron dos veces la recarga de ayer", channel: "whatsapp" });
  assert.equal(d.path, "model");
  assert.equal(d.triage.risk, "money");
  assert.ok(["pro", "experta"].includes(d.tier ?? ""));
  assert.equal(d.confirmRequired, true);
  assert.ok(d.maxOutputTokens <= 300, "short channel caps output");
});

test("simple edits go cheap, complex designs go strong", async () => {
  const ruta = createRuta();
  const small = await ruta.decide({ message: "cambia el color del botón a verde", channel: "studio" });
  const big = await ruta.decide({ message: "diseña la arquitectura multi-tenant para 20 bodegas con base de datos escalable y colas", channel: "studio" });
  assert.equal(small.tier, "rapida");
  assert.ok(["pro", "experta"].includes(big.tier ?? ""));
  assert.ok(big.estimate.usd > small.estimate.usd);
  assert.ok(small.estimate.savingsPct > 50);
});

test("risk beats complexity: a two-line auth change still gets Pro and a confirm gate", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "cambia el login para usar OTP", channel: "studio" });
  assert.equal(d.triage.risk, "auth_security");
  assert.ok((d.tier === "pro" || d.tier === "experta"));
  assert.equal(d.confirmRequired, true);
});

test("budget shortens, then steps down, then refuses, never overspends", async () => {
  const ruta = createRuta();
  const msg = "crea una pantalla de historial de recargas con filtros por fecha y estado, y exportar CSV";
  const full = await ruta.decide({ message: msg, channel: "studio" });
  const tight = await ruta.decide({ message: msg, channel: "studio", budget: { remainingUsd: 0.005 } });
  const empty = await ruta.decide({ message: msg, channel: "studio", budget: { remainingUsd: 0.0001 } });
  assert.equal(full.tier, "pro");
  assert.ok(tight.path === "model" && tight.estimate.reserveUsd <= 0.005);
  assert.equal(empty.path, "refuse");
});

test("cache-aware stickiness: staying on a warm model beats re-reading a big project elsewhere", async () => {
  const ruta = createRuta();
  const now = Date.now();
  const base = { channel: "studio" as const, contextChars: 350_000, sessionId: "s1" };
  const first = await ruta.decide({ ...base, message: "planea la migración del módulo de pagos a multi-moneda", now });
  assert.equal(first.tier, "experta");
  ruta.record(first, { ok: true, sessionId: "s1", at: now, answer: "plan listo" });
  const next = await ruta.decide({ ...base, message: "ahora crea la pantalla de conversión de moneda con filtros y exportar CSV", now: now + 60_000 });
  assert.equal(next.tier, "experta");
  assert.equal(next.sticky, true);
  assert.ok(next.reasons.some((r) => r.code === "sticky"));
});

test("PII is tokenized before any model sees it; cards are Luhn-checked", () => {
  assert.equal(luhn("4111111111111111"), true);
  const m = maskPII("Mi tarjeta 4111 1111 1111 1111, mi correo ana@example.com y mi cel +53 5555 1234, cita 2026-10-01");
  assert.ok(m.text.includes("[CARD_1]") && m.text.includes("[EMAIL_1]") && m.text.includes("[PHONE_1]"));
  assert.ok(m.text.includes("2026-10-01"), "dates are left alone");
  assert.ok(!m.text.includes("4111"));
});

test("loop breaker: two failures in a session stop spending", async () => {
  const ruta = createRuta();
  const req = { message: "arregla el error en la pantalla de historial", channel: "studio" as const, sessionId: "loop" };
  const a = await ruta.decide(req);
  ruta.record(a, { ok: false, sessionId: "loop" });
  const b = await ruta.decide(req);
  ruta.record(b, { ok: false, sessionId: "loop" });
  const c = await ruta.decide(req);
  assert.equal(c.path, "refuse");
  assert.ok(c.reasons.some((r) => r.code === "loop_breaker"));
  const d = await ruta.decide({ ...req, resetLoop: true });
  assert.equal(d.path, "model");
});

test("learning: repeated failures on the cheap tier move the task up", async () => {
  const ruta = createRuta();
  const req = { message: "escribe un mensaje corto para mi cliente sobre el horario", channel: "app" as const };
  const before = await ruta.decide(req);
  assert.equal(before.tier, "rapida");
  for (let i = 0; i < 12; i++) ruta.record(before, { ok: false });
  const after = await ruta.decide(req);
  assert.notEqual(after.tier, "rapida");
});

test("the thinker can adjust difficulty but never lowers risk", async () => {
  let asked = 0;
  const ruta = createRuta({ ask: async () => { asked++; return '{"task":"chat","difficulty":0.05}'; }, policy: { askBelowConfidence: 0.99 } });
  const d = await ruta.decide({ message: "revisa los permisos de la tabla de pagos", channel: "studio" });
  assert.equal(asked, 1);
  assert.equal(d.triage.asked, true);
  assert.equal(d.triage.risk, "money");
  assert.ok((d.tier === "pro" || d.tier === "experta"));
});

test("language detection covers LatAm basics", () => {
  assert.equal(detectLang("Summarize these tickets into key points"), "en");
  assert.equal(detectLang("Hola, necesito ayuda con mi recarga"), "es");
  assert.equal(detectLang("Olá, preciso de ajuda com minha recarga"), "pt");
  assert.equal(detectLang("Bonjou, mwen bezwen ed"), "ht");
});

test("customer text never names a model or provider; admin text does", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "diseña la arquitectura multi-tenant para bodegas", channel: "studio" });
  for (const L of ["es", "en"] as const) {
    assert.ok(!d.explain.customer[L].includes(d.model ?? "@@"));
    assert.ok(!d.explain.customer[L].toLowerCase().includes("openrouter"));
  }
  assert.ok(d.explain.admin.es.includes(d.model ?? "@@"));
});

test("audit records chain by hash", async () => {
  const store = memoryStore();
  const ruta = createRuta({ store });
  const a = await ruta.decide({ message: "hola", channel: "whatsapp" });
  const b = await ruta.decide({ message: "resume este texto en 3 puntos", channel: "app" });
  assert.equal(b.audit.prevHash, a.audit.hash);
  assert.equal(a.audit.hash.length, 64);
});

test("swarm: roles bound tiers and one budget covers every agent", async () => {
  const ruta = createRuta();
  const swarm = createSwarm(ruta, { id: "audit", budgetUsd: 0.5, roles: { worker: { max: "rapida" } } });
  const boss = await swarm.decide("lead", "orchestrator", { message: "Coordina a 3 agentes para revisar los webhooks" });
  const worker = await swarm.decide("w1", "worker", { message: "Clasifica este mensaje: ¿es spam o no?" });
  assert.ok(["pro", "experta"].includes(boss.tier ?? ""));
  assert.equal(worker.tier, "rapida");
  swarm.record("lead", boss, { ok: true });
  swarm.record("w1", worker, { ok: true });
  const r = swarm.report();
  assert.ok(r.spentUsd > 0 && r.spentUsd < 0.5);
  assert.equal(r.agents.length, 2);
});

test("offline mode keeps working on the local model", async () => {
  const ruta = createRuta({ policy: { offline: true } });
  const d: Decision = await ruta.decide({ message: "clasifica este mensaje: ¿es spam?", channel: "agent" });
  assert.equal(d.tier, "local");
  assert.equal(d.estimate.usd, 0);
});

test("run(): verify, climb once, stop", async () => {
  const ruta = createRuta();
  const calls: string[] = [];
  const adapter = async ({ model }: { model: string }) => { calls.push(model); return { text: model === "example/quick" ? "" : "ok", inTok: 50, outTok: 20 }; };
  const r = await ruta.run({ message: "escribe un mensaje corto para mi cliente", channel: "app" }, { adapters: { openrouter: adapter } });
  assert.deepEqual(calls, ["example/quick", "example/pro"]);
  assert.equal(r.text, "ok");
  assert.equal(r.attempts.length, 2);
});

test("task verbs beat intent rules: translating a status sentence is a translation", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "Traduce al inglés: tu recarga llegó, gracias por usar SendLatam", channel: "app" });
  assert.equal(d.path, "model");
  assert.equal(d.triage.task, "translate");
});

test("in chat, an informational money question is not a money action", async () => {
  const ruta = createRuta();
  const a = await ruta.decide({ message: "Compara el costo de enviar 200 dólares a Perú por transferencia o por recarga", channel: "app" });
  const b = await ruta.decide({ message: "¿qué me recomiendas para mandar saldo a Cuba esta semana?", channel: "whatsapp" });
  const c = await ruta.decide({ message: "quiero transferir 100 dólares a mi hermana", channel: "whatsapp" });
  assert.equal(a.path, "model");
  assert.equal(a.triage.risk, "none");
  assert.equal(b.triage.risk, "none");
  assert.equal(b.tier, "rapida");
  assert.equal(c.triage.risk, "money");
  assert.equal(c.confirmRequired, true);
});

test("a leading verb decides the task: 'Clasifica … error …' is sorting, not debugging", async () => {
  const ruta = createRuta();
  const d = await ruta.decide({ message: "Clasifica estos 20 logs: error, aviso o normal", channel: "agent", role: "worker" });
  assert.equal(d.triage.task, "classify");
  assert.equal(d.tier, "rapida");
});
