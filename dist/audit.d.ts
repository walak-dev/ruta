import type { AuditRecord, Decision, RouteRequest, Store } from './types.js';
export declare function randomId(): string;
/**
 * SHA-256 of the string's UTF-8 bytes, as 64 lowercase hex characters. Uses the global SubtleCrypto
 * when there is one; otherwise (Node 18 without the webcrypto global, some embedded runtimes) the pure
 * implementation in sha256.ts. Both give the same digest, so audit chains verify across runtimes.
 */
export declare function sha256(s: string): Promise<string>;
/** HMAC-SHA-256 (RFC 2104) of the UTF-8 message under the UTF-8 key, as hex. Pure, so it runs everywhere. */
export declare function hmacSha256(key: string, message: string): string;
/**
 * Tamper-evident decision record: hashes instead of prompts, chained to the previous
 * record (AgentWorks-compatible). No message, user id or session id is stored in clear.
 * Without `secret` the user, session and message hashes are plain SHA-256: a short value
 * (a phone number used as user id, a card number as the whole message) can be found by trying
 * candidates. Pass `policy.auditSecret` to key them with HMAC-SHA-256.
 */
export declare function buildAudit(d: Omit<Decision, 'audit' | 'explain'>, req: RouteRequest, store: Store, secret?: string): Promise<AuditRecord>;
