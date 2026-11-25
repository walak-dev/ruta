import { sha256Bytes, toHex, utf8 } from './sha256.js';
export function randomId() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    return `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
/**
 * SHA-256 of the string's UTF-8 bytes, as 64 lowercase hex characters. Uses the global SubtleCrypto
 * when there is one; otherwise (Node 18 without the webcrypto global, some embedded runtimes) the pure
 * implementation in sha256.ts. Both give the same digest, so audit chains verify across runtimes.
 */
export async function sha256(s) {
    const bytes = utf8(s);
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        try {
            return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
        }
        catch {
            // Same digest from the pure implementation below.
        }
    }
    return toHex(sha256Bytes(bytes));
}
/** HMAC-SHA-256 (RFC 2104) of the UTF-8 message under the UTF-8 key, as hex. Pure, so it runs everywhere. */
export function hmacSha256(key, message) {
    let k = utf8(key);
    if (k.length > 64)
        k = sha256Bytes(k);
    const msg = utf8(message);
    const inner = new Uint8Array(64 + msg.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
        inner[i] = (k[i] ?? 0) ^ 0x36;
        outer[i] = (k[i] ?? 0) ^ 0x5c;
    }
    inner.set(msg, 64);
    outer.set(sha256Bytes(inner), 64);
    return toHex(sha256Bytes(outer));
}
/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). No message, user id or session id is stored in clear.
 * Without `secret` the user, session and message hashes are plain SHA-256: a short value
 * (a phone number used as user id, a card number as the whole message) can be found by trying
 * candidates. Pass `policy.auditSecret` to key them with HMAC-SHA-256.
 */
export async function buildAudit(d, req, store, secret) {
    const prevHash = store.lastHash();
    const h = async (s) => (secret ? hmacSha256(secret, s) : sha256(s));
    const base = {
        id: d.id,
        at: new Date(req.now ?? Date.now()).toISOString(),
        ...(req.tenantId ? { tenantId: req.tenantId } : {}),
        ...(req.userId ? { userHash: (await h(`u:${req.userId}`)).slice(0, 16) } : {}),
        ...(req.sessionId ? { sessionHash: (await h(`s:${req.sessionId}`)).slice(0, 16) } : {}),
        channel: req.channel ?? 'app',
        inputHash: await h(req.message),
        path: d.path,
        task: d.triage.task,
        risk: d.triage.risk,
        difficulty: Math.round(d.triage.difficulty * 100) / 100,
        lang: d.triage.lang,
        ...(d.tier ? { tier: d.tier } : {}),
        ...(d.model ? { model: d.model } : {}),
        ...(d.provider ? { provider: d.provider } : {}),
        maxOutputTokens: d.maxOutputTokens,
        estUsd: d.estimate.usd,
        baselineUsd: d.estimate.baselineUsd,
        reasons: d.reasons.map((r) => r.code),
        shadow: d.shadow,
        ...(prevHash ? { prevHash } : {}),
    };
    const hash = await sha256(JSON.stringify(base));
    store.setLastHash(hash);
    return { ...base, hash };
}
