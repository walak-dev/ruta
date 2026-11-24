// One budget for a swarm: the orchestrator thinks hard, workers stay cheap.
import { createRuta, createSwarm } from "../dist/index.js";

const ruta = createRuta();
const swarm = createSwarm(ruta, { id: "webhook-audit", budgetUsd: 0.25, roles: { worker: { max: "rapida" } } });

const jobs = [
  ["lead", "orchestrator", "Coordina a 3 agentes para auditar los webhooks y reportar fallas"],
  ["w1", "worker", "Clasifica estos 20 logs: error, aviso o normal"],
  ["w2", "worker", "Resume los hallazgos del log 7 en 3 puntos"],
  ["rev", "reviewer", "Revisa el informe final y marca lo que falte"],
];
for (const [id, role, message] of jobs) {
  const d = await swarm.decide(id, role, { message });
  swarm.record(id, d, { ok: true });
  console.log(`${id.padEnd(4)} ${role.padEnd(12)} ${d.tierLabel.es.padEnd(8)} US$${d.estimate.usd.toFixed(4)}`);
}
console.log(swarm.report());
