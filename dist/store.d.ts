import type { Store } from "./types.js";
/**
 * In-memory store: answer cache (TTL + LRU), outcome stats, measured token ratios,
 * sessions and the audit hash chain. Swap in a database-backed Store in production.
 */
export declare function memoryStore(opts?: {
    maxCache?: number;
}): Store;
