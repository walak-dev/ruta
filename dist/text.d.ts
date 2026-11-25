import type { Lang } from './types.js';
/** Lowercase, strip accents, collapse spaces. All rules match against this. */
export declare function norm(s: string): string;
export declare function words(s: string): string[];
/**
 * Cheap language vote: lexicon words, a few telling letters, French elisions (c'est, j'ai) and English
 * contractions (don't, I'm; not 's, which German shares: "wie geht's").
 * A tie or no signal returns the fallback (the tenant's language).
 */
export declare function detectLang(s: string, fallback?: Lang): Lang;
/**
 * Starting guesses for characters per token. Ruta replaces them with ratios measured
 * from real provider usage per (model, language): the "language tax" is measured, not assumed.
 */
export declare const CHARS_PER_TOKEN: Record<Lang, number>;
export declare function estTokens(chars: number, lang: Lang, measured?: number): number;
/** Worst case for reservations: characters ÷ 3 (safe for Spanish and JSON). */
export declare function reserveTokens(chars: number): number;
export declare function luhn(d: string): boolean;
export interface Masked {
    text: string;
    map: Record<string, string>;
    kinds: string[];
}
/**
 * Replaces phones, cards (Luhn-checked), emails, IBANs (checksum-validated) and card security codes
 * with tokens like [PHONE_1]. The map stays server-side; models only ever see tokens.
 * With `shared`, several texts (a message and its history) use one map: numbering continues from it,
 * a value already in it keeps its token, and new tokens are added to it.
 */
export declare function maskPII(input: string, shared?: Record<string, string>): Masked;
export declare function unmask(text: string, map: Record<string, string>): string;
export declare function tailDigits(value: string, n?: number): string;
export declare function clamp(x: number, lo?: number, hi?: number): number;
export declare function clock(): number;
