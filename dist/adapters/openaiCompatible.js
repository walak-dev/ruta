export class RutaCallError extends Error {
    status;
    constructor(code, status) {
        super(code);
        this.status = status;
    }
}
/**
 * Any OpenAI-compatible chat endpoint: OpenRouter, Hugging Face router, Ollama,
 * LM Studio, vLLM, llama.cpp server. Provider errors never leak to customers.
 */
export function openaiCompatible(o) {
    const f = o.fetch ?? fetch;
    return async (c) => {
        const messages = [
            ...(c.system ? [{ role: 'system', content: c.system }] : []),
            ...c.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const body = {
            model: c.model,
            messages,
            max_tokens: c.maxOutputTokens,
            stream: false,
            ...(o.body ?? {}),
        };
        if (c.sessionId && o.sessionField)
            body[o.sessionField] = c.sessionId;
        if (c.user)
            body.user = c.user;
        let res;
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
        }
        catch {
            throw new RutaCallError('network');
        }
        if (!res.ok) {
            await res.text().catch(() => '');
            throw new RutaCallError(`status_${res.status}`, res.status);
        }
        const j = (await res.json());
        if (j.error)
            throw new RutaCallError('provider_error');
        const choice = (j.choices ?? [])[0] ?? {};
        const msg = (choice.message ?? {});
        const text = typeof msg.content === 'string'
            ? msg.content
            : (msg.content ?? []).map((p) => p.text ?? '').join('');
        const u = (j.usage ?? {});
        const details = (u.prompt_tokens_details ?? {});
        return {
            text,
            ...(typeof u.prompt_tokens === 'number' ? { inTok: u.prompt_tokens } : {}),
            ...(typeof u.completion_tokens === 'number' ? { outTok: u.completion_tokens } : {}),
            ...(typeof details.cached_tokens === 'number'
                ? { cachedTok: details.cached_tokens }
                : {}),
            ...(typeof u.cost === 'number' ? { costUsd: u.cost } : {}),
        };
    };
}
/** OpenRouter with usage accounting, no training on your data, and session stickiness. */
export function openrouter(apiKey, extra = {}) {
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
export function ollama(baseUrl = 'http://localhost:11434/v1') {
    return openaiCompatible({ baseUrl });
}
export function huggingface(token, billTo) {
    return openaiCompatible({
        baseUrl: 'https://router.huggingface.co/v1',
        apiKey: token,
        headers: billTo ? { 'X-HF-Bill-To': billTo } : {},
    });
}
