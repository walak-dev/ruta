// Real calls through OpenRouter. OPENROUTER_API_KEY=... node examples/openrouter-live.mjs
// Put the exact model ids you use, with their tiers, in `pick`; prices are read live.

import { openrouter } from '../dist/adapters/index.js';
import { catalogFromOpenRouter, createRuta } from '../dist/index.js';

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('Set OPENROUTER_API_KEY');
  process.exit(1);
}
const pick = JSON.parse(process.env.RUTA_PICK ?? '{}'); // e.g. {"<quick-model-id>":"rapida","<pro-model-id>":"pro"}
const models = await (await fetch('https://openrouter.ai/api/v1/models')).json();
const catalog = catalogFromOpenRouter(models, pick);
if (!catalog.length) {
  console.error('RUTA_PICK matched no models');
  process.exit(1);
}

const ruta = createRuta({ catalog });
const r = await ruta.run(
  {
    message: process.argv[2] ?? 'Explica en 3 frases cómo mandar dinero a Bolivia',
    channel: 'app',
    sessionId: 'demo',
  },
  { adapters: { openrouter: openrouter(key) }, verify: (t) => t.trim().length > 20 },
);
console.log(r.decision.explain.admin.es, '\n\n', r.text, '\n\nspent US$', r.costUsd.toFixed(5));
