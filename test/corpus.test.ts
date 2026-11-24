import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuta, detectLang, type Lang } from "../src/index.js";

/**
 * Labelled chat messages, one file per language: test/corpus/<lang>.json.
 * moneyAction: the customer asks to move or spend money now. instantOk: answering without a model is acceptable.
 * The files are read from the repository at run time (they are data, not compiled).
 */
interface CorpusItem { text: string; lang: CorpusLang; category: string; moneyAction: boolean; instantOk: boolean }
type CorpusLang = "es" | "en" | "pt" | "fr" | "de";
const LANGS: CorpusLang[] = ["es", "en", "pt", "fr", "de"];

/** Looks upward from the working directory (npm test runs at the repo root), then from this compiled file. */
function corpusDir(): string {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    for (let dir = start, up = 0; up < 5; up++, dir = dirname(dir)) {
      const candidate = join(dir, "test", "corpus");
      if (existsSync(join(candidate, "es.json"))) return candidate;
    }
  }
  throw new Error(`test/corpus not found above ${starts.join(" or ")}`);
}

function loadCorpus(lang: CorpusLang): CorpusItem[] {
  return JSON.parse(readFileSync(join(corpusDir(), `${lang}.json`), "utf8")) as CorpusItem[];
}

const CORPUS = Object.fromEntries(LANGS.map((l) => [l, loadCorpus(l)])) as Record<CorpusLang, CorpusItem[]>;

function share<T>(items: T[], ok: (x: T) => boolean): number {
  return items.length ? items.filter(ok).length / items.length : 1;
}

const wordCount = (s: string): number => s.trim().split(/\s+/).length;

test("corpus: every file loads and every item is well formed", () => {
  for (const lang of LANGS) {
    const items = CORPUS[lang];
    assert.ok(items.length >= 50, `${lang}: ${items.length} items`);
    for (const it of items) {
      assert.equal(it.lang, lang, `${lang}: "${it.text}" is labelled ${it.lang}`);
      assert.ok(it.text.trim().length > 0 && it.category.length > 0, `${lang}: empty text or category`);
      assert.equal(typeof it.moneyAction, "boolean");
      assert.equal(typeof it.instantOk, "boolean");
    }
  }
});

// LANG: share of items with 3 or more words whose detected language (none passed) equals the label.
for (const lang of LANGS) {
  test(`corpus LANG: ${lang} messages of 3+ words are detected as ${lang} at least 90% of the time`, () => {
    const items = CORPUS[lang].filter((it) => wordCount(it.text) >= 3);
    const missed = items.filter((it) => detectLang(it.text) !== it.lang);
    const score = share(items, (it) => detectLang(it.text) === it.lang);
    const detail = missed.map((it) => `  ${detectLang(it.text)} <- ${it.text}`).join("\n");
    assert.ok(score >= 0.9, `LANG ${lang} = ${score.toFixed(3)} (${items.length - missed.length}/${items.length})\n${detail}`);
  });
}

test("an email address does not turn Spanish into Portuguese", () => {
  assert.equal(detectLang("manda 10 dólares a ana@example.com"), "es");
  assert.equal(detectLang("transfiere 10 USD a ana@example.com"), "es");
  assert.equal(detectLang("envía 10 a ana@example.com"), "es");
  assert.equal(detectLang("transfere 10 para ana@example.com"), "pt");
});

test("French and German are detected, not folded into the fallback", () => {
  assert.equal(detectLang("envoie 10 euros à ana"), "fr");
  assert.equal(detectLang("überweise 10 Euro an Ana"), "de");
  assert.equal(detectLang("ich moechte 100 euro ueberweisen", "en"), "de");
  assert.equal(detectLang("je voudrais envoyer de l'argent", "en"), "fr");
});

test("emails, URLs, handles, numbers and mask tokens carry no language", () => {
  for (const noise of ["ana@example.com", "https://www.example.com/do/it", "tienda.com", "@do_it", "12345", "[EMAIL_1] [PHONE_2]"]) {
    assert.equal(detectLang(noise, "other"), "other", noise);
    assert.equal(detectLang(`necesito ayuda con mi cuenta ${noise}`, "en"), "es", noise);
    assert.equal(detectLang(`ich brauche hilfe mit meinem konto ${noise}`, "en"), "de", noise);
  }
});

test("a tie or no signal returns the fallback", () => {
  assert.equal(detectLang("", "fr"), "fr");
  assert.equal(detectLang("ok!! 123", "de"), "de");
  // "envia" and "para" are both Spanish and Portuguese: the tenant's language decides.
  assert.equal(detectLang("envia 25 para Marina", "es"), "es");
  assert.equal(detectLang("envia 25 para Marina", "pt"), "pt");
});

test("very long input is decided by its start and stays fast", () => {
  const started = Date.now();
  assert.equal(detectLang("hola necesito ayuda con mi cuenta " + "a.".repeat(25_000)), "es");
  assert.equal(detectLang("a".repeat(50_000), "en"), "en");
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
});

test("a recipient's name does not outvote the sentence around it", () => {
  assert.equal(detectLang("send 100 to João"), "en");
  assert.equal(detectLang("pay Müller 50"), "en");
  assert.equal(detectLang("schick 20 an João"), "de");
  assert.equal(detectLang("El pingüino llegó tarde"), "es");
});

test("a language passed by the caller always wins over detection", async () => {
  const ruta = createRuta();
  const german = "überweise 10 Euro an Ana";
  assert.equal((await ruta.decide({ message: german, channel: "whatsapp" })).triage.lang, "de");
  for (const lang of ["es", "en", "pt", "fr", "ht", "other"] as Lang[]) {
    const d = await ruta.decide({ message: german, channel: "whatsapp", lang });
    assert.equal(d.triage.lang, lang);
    assert.equal(d.audit.lang, lang);
  }
  // The no-model path too.
  assert.equal((await ruta.decide({ message: "hola", channel: "whatsapp", lang: "de" })).triage.lang, "de");
  assert.equal((await ruta.decide({ message: "hallo", channel: "whatsapp" })).triage.lang, "de");
  // The tenant's default language is only the fallback.
  const tenant = createRuta({ policy: { defaultLang: "pt" } });
  assert.equal((await tenant.decide({ message: "ok", channel: "whatsapp" })).triage.lang, "pt");
  assert.equal((await tenant.decide({ message: "ok", channel: "whatsapp", lang: "fr" })).triage.lang, "fr");
});
