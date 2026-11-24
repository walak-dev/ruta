import type { AuditRecord, Decision, RouteRequest, Store } from "./types.js";
export declare function randomId(): string;
export declare function sha256(s: string): Promise<string>;
/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). Nothing personal is stored in clear.
 */
export declare function buildAudit(d: Omit<Decision, "audit" | "explain">, req: RouteRequest, store: Store): Promise<AuditRecord>;
