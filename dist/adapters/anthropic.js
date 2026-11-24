import { RutaCallError } from "./openaiCompatible.js";
/** Anthropic Messages API. The system prompt is marked cacheable so repeat calls read it cheaply. */
export function anthropic(o) {
    const f = o.fetch ?? fetch;
    const base = (o.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    return async (c) => {
        const system = c.system
            ? o.cacheSystem === false ? c.system : [{ type: "text", text: c.system, cache_control: { type: "ephemeral" } }]
            : undefined;
        const messages = c.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
        let res;
        try {
            res = await f(`${base}/v1/messages`, {
                method: "POST",
                headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": o.version ?? "2023-06-01" },
                body: JSON.stringify({ model: c.model, max_tokens: c.maxOutputTokens, ...(system ? { system } : {}), messages }),
            });
        }
        catch {
            throw new RutaCallError("network");
        }
        if (!res.ok) {
            await res.text().catch(() => "");
            throw new RutaCallError(`status_${res.status}`, res.status);
        }
        const j = (await res.json());
        const blocks = (j["content"] ?? []);
        const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        const u = (j["usage"] ?? {});
        return {
            text,
            ...(typeof u["input_tokens"] === "number" ? { inTok: u["input_tokens"] } : {}),
            ...(typeof u["output_tokens"] === "number" ? { outTok: u["output_tokens"] } : {}),
            ...(typeof u["cache_read_input_tokens"] === "number" ? { cachedTok: u["cache_read_input_tokens"] } : {}),
        };
    };
}
