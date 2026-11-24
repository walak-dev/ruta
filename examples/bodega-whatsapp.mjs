// A bodega's WhatsApp line: most messages never touch a model.
import { createRuta } from "../dist/index.js";

const ruta = createRuta({
  policy: { allowTiers: ["rapida", "pro"] },
  faq: [{ id: "horario", q: ["a que hora abren", "horario de la bodega"], a: { es: "Abrimos de 8 a 20, todos los días." } }],
});

for (const message of ["hola", "¿a qué hora abren?", "recarga 10 al +53 5555 1234", "recarga para mi mamá", "¿ya llegó mi recarga?", "me cobraron dos veces la recarga, quiero un reembolso"]) {
  const d = await ruta.decide({ message, channel: "whatsapp", sessionId: "cliente-1" });
  console.log(`${message}\n  → ${d.explain.customer.es}${d.instant ? `\n  ↳ ${d.instant.answer.es}` : ""}\n`);
}
