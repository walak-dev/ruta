import { sha256Bytes, toHex, utf8 } from './sha256.js';
import type { AuditRecord, Decision, RouteRequest, Store } from './types.js';

export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** The one piece of Web Crypto Ruta uses, typed locally so the core compiles without the DOM lib. */
interface DigestOnly {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

/**
 * SHA-256 of the string's UTF-8 bytes, as 64 lowercase hex characters. Uses the global SubtleCrypto
 * when there is one; otherwise (Node 18 without the webcrypto global, some embedded runtimes) the pure
 * implementation in sha256.ts. Both give the same digest, so audit chains verify across runtimes.
 */
export async function sha256(s: string): Promise<string> {
  const bytes = utf8(s);
  const subtle = (globalThis as { crypto?: { subtle?: DigestOnly } }).crypto?.subtle;
  if (subtle) {
    try {
      return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
    } catch {
      // Same digest from the pure implementation below.
    }
  }
  return toHex(sha256Bytes(bytes));
}

/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). Nothing personal is stored in clear.
 */
export async function buildAudit(
  d: Omit<Decision, 'audit' | 'explain'>,
  req: RouteRequest,
  store: Store,
): Promise<AuditRecord> {
  const prevHash = store.lastHash();
  const base: Omit<AuditRecord, 'hash'> = {
    id: d.id,
    at: new Date(req.now ?? Date.now()).toISOString(),
    ...(req.tenantId ? { tenantId: req.tenantId } : {}),
    ...(req.userId ? { userHash: (await sha256(`u:${req.userId}`)).slice(0, 16) } : {}),
    ...(req.sessionId ? { sessionHash: (await sha256(`s:${req.sessionId}`)).slice(0, 16) } : {}),
    channel: req.channel ?? 'app',
    inputHash: await sha256(req.message),
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
