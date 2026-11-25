import type { AuditRecord, Decision, RouteRequest, Store } from "./types.js";
export declare function randomId(): string;
/**
 * SHA-256 of the string's UTF-8 bytes, as 64 lowercase hex characters. Uses the global SubtleCrypto
 * when there is one; otherwise (Node 18 without the webcrypto global, some embedded runtimes) the pure
 * implementation in sha256.ts. Both give the same digest, so audit chains verify across runtimes.
 */
export declare function sha256(s: string): Promise<string>;
/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). Nothing personal is stored in clear.
 */
export declare function buildAudit(d: Omit<Decision, "audit" | "explain">, req: RouteRequest, store: Store): Promise<AuditRecord>;
