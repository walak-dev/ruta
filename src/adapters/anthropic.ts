import type { Adapter, ChatResult } from "../types.js";
import { RutaCallError } from "./openaiCompatible.js";

type Json = Record<string, unknown>;

/** Anthropic Messages API. The system prompt is marked cacheable so repeat calls read it cheaply. */
export function anthropic(o: { apiKey: string; version?: string; baseUrl?: string; cacheSystem?: boolean; fetch?: typeof fetch }): Adapter {
  const f = o.fetch ?? fetch;
  const base = (o.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
  return async (c): Promise<ChatResult> => {
    const system = c.system
      ? o.cacheSystem === false ? c.system : [{ type: "text", text: c.system, cache_control: { type: "ephemeral" } }]
      : undefined;
    const messages = c.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    let res: Response;
    try {
      res = await f(`${base}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": o.version ?? "2023-06-01" },
        body: JSON.stringify({ model: c.model, max_tokens: c.maxOutputTokens, ...(system ? { system } : {}), messages }),
      });
    } catch {
      throw new RutaCallError("network");
    }
    if (!res.ok) { await res.text().catch(() => ""); throw new RutaCallError(`status_${res.status}`, res.status); }
    const j = (await res.json()) as Json;
    const blocks = (j["content"] ?? []) as { type?: string; text?: string }[];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const u = (j["usage"] ?? {}) as Json;
    return {
      text,
      ...(typeof u["input_tokens"] === "number" ? { inTok: u["input_tokens"] as number } : {}),
      ...(typeof u["output_tokens"] === "number" ? { outTok: u["output_tokens"] as number } : {}),
      ...(typeof u["cache_read_input_tokens"] === "number" ? { cachedTok: u["cache_read_input_tokens"] as number } : {}),
    };
  };
}
