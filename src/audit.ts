import type { AuditRecord, Decision, RouteRequest, Store } from "./types.js";

export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export async function sha256(s: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) return hex(await subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return `fnv1a-${fnv1a(s)}`;
}

/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). Nothing personal is stored in clear.
 */
export async function buildAudit(d: Omit<Decision, "audit" | "explain">, req: RouteRequest, store: Store): Promise<AuditRecord> {
  const prevHash = store.lastHash();
  const base: Omit<AuditRecord, "hash"> = {
    id: d.id,
    at: new Date(req.now ?? Date.now()).toISOString(),
    ...(req.tenantId ? { tenantId: req.tenantId } : {}),
    ...(req.userId ? { userHash: (await sha256(`u:${req.userId}`)).slice(0, 16) } : {}),
    ...(req.sessionId ? { sessionHash: (await sha256(`s:${req.sessionId}`)).slice(0, 16) } : {}),
    channel: req.channel ?? "app",
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
