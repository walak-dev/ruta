/**
 * Pure SHA-256 (FIPS 180-4) and UTF-8 encoding, for runtimes without a global SubtleCrypto
 * (Node 18 without the webcrypto global, older embedded runtimes). No dependencies, no node: imports,
 * no DOM types: it runs the same in Node 18+, Deno, Bun, Workers and the browser.
 */
/** UTF-8 bytes of a string, like TextEncoder: a lone surrogate becomes U+FFFD. */
export declare function utf8(s: string): Uint8Array;
/** SHA-256 digest of raw bytes (32 bytes). */
export declare function sha256Bytes(data: Uint8Array): Uint8Array;
/** Lowercase hex of bytes. */
export declare function toHex(bytes: Uint8Array): string;
/** Synchronous SHA-256 of a string's UTF-8 bytes, as 64 hex characters. */
export declare function sha256Sync(s: string): string;
