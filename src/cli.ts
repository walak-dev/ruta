#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createRuta } from "./ruta.js";
import type { Channel, ModelSpec, Role, RouteRequest } from "./types.js";

const HELP = `ruta: decide the model before you spend a token

  ruta "crea una pantalla de historial con filtros" --channel studio
  ruta "recarga 10 al +53 5555 1234" --channel whatsapp

  --channel whatsapp|sms|app|web|studio|agent|api|cli
  --stage plan|build|review     --role orchestrator|worker|reviewer
  --context <chars>             --budget <usd remaining>
  --catalog <file.json>         (array of ModelSpec; default: illustrative catalog)
  --admin                       show model, numbers and candidates
  --en                          English explanation
  --json                        full decision as JSON`;

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(HELP); process.exit(0); }
const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const valued = new Set(["--channel", "--stage", "--role", "--context", "--budget", "--catalog"]);
const message = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? "")).join(" ");

const catalogFile = flag("catalog");
const catalog = catalogFile ? (JSON.parse(readFileSync(catalogFile, "utf8")) as ModelSpec[]) : undefined;
const ruta = createRuta(catalog ? { catalog } : {});
const req: RouteRequest = { message, channel: (flag("channel") as Channel) ?? "cli" };
const stage = flag("stage"); if (stage) req.stage = stage as "plan" | "build" | "review";
const role = flag("role"); if (role) req.role = role as Role;
const ctx = flag("context"); if (ctx) req.contextChars = Number(ctx);
const budget = flag("budget"); if (budget) req.budget = { remainingUsd: Number(budget) };

const d = await ruta.decide(req);
const L = args.includes("--en") ? "en" : "es";
if (args.includes("--json")) {
  console.log(JSON.stringify(d, null, 2));
} else {
  console.log(d.explain.customer[L]);
  if (args.includes("--admin")) {
    console.log(`\n${d.explain.admin[L]}`);
    for (const s of d.stages) console.log(`  ${s.used ? "●" : "○"} ${s.stage.padEnd(8)} ${s.ms.toFixed(2).padStart(6)} ms  ${s.result}`);
  }
}
