import type { Adapter, ChatResult } from '../types.js';

export class RutaCallError extends Error {
  constructor(
    code: string,
    public status?: number,
  ) {
    super(code);
  }
}

type Json = Record<string, unknown>;

/**
 * Any OpenAI-compatible chat endpoint: OpenRouter, Hugging Face router, Ollama,
 * LM Studio, vLLM, llama.cpp server. Provider errors never leak to customers.
 */
export function openaiCompatible(o: {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  body?: Json;
  /** Body field that carries the session id (OpenRouter: "session_id"), for cache stickiness. */
  sessionField?: string;
  fetch?: typeof fetch;
}): Adapter {
  const f = o.fetch ?? fetch;
  return async (c): Promise<ChatResult> => {
    const messages = [
      ...(c.system ? [{ role: 'system', content: c.system }] : []),
      ...c.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const body: Json = {
      model: c.model,
      messages,
      max_tokens: c.maxOutputTokens,
      stream: false,
      ...(o.body ?? {}),
    };
    if (c.sessionId && o.sessionField) body[o.sessionField] = c.sessionId;
    if (c.user) body.user = c.user;
    let res: Response;
    try {
      res = await f(`${o.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}),
          ...(o.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new RutaCallError('network');
    }
    if (!res.ok) {
      await res.text().catch(() => '');
      throw new RutaCallError(`status_${res.status}`, res.status);
    }
    const j = (await res.json()) as Json;
    if (j.error) throw new RutaCallError('provider_error');
    const choice = ((j.choices as Json[] | undefined) ?? [])[0] ?? {};
    const msg = (choice.message ?? {}) as { content?: string | { text?: string }[] };
    const text =
      typeof msg.content === 'string'
        ? msg.content
        : (msg.content ?? []).map((p) => p.text ?? '').join('');
    const u = (j.usage ?? {}) as Json;
    const details = (u.prompt_tokens_details ?? {}) as Json;
    return {
      text,
      ...(typeof u.prompt_tokens === 'number' ? { inTok: u.prompt_tokens as number } : {}),
      ...(typeof u.completion_tokens === 'number' ? { outTok: u.completion_tokens as number } : {}),
      ...(typeof details.cached_tokens === 'number'
        ? { cachedTok: details.cached_tokens as number }
        : {}),
      ...(typeof u.cost === 'number' ? { costUsd: u.cost as number } : {}),
    };
  };
}

/** OpenRouter with usage accounting, no training on your data, and session stickiness. */
export function openrouter(apiKey: string, extra: { title?: string; body?: Json } = {}): Adapter {
  return openaiCompatible({
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey,
    sessionField: 'session_id',
    headers: { 'X-Title': extra.title ?? 'Ruta' },
    body: {
      usage: { include: true },
      provider: { data_collection: 'deny' },
      ...(extra.body ?? {}),
    },
  });
}

/** Local models: free, private, and they keep working when the internet doesn't. */
export function ollama(baseUrl = 'http://localhost:11434/v1'): Adapter {
  return openaiCompatible({ baseUrl });
}

export function huggingface(token: string, billTo?: string): Adapter {
  return openaiCompatible({
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey: token,
    headers: billTo ? { 'X-HF-Bill-To': billTo } : {},
  });
}
