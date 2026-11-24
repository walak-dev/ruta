import type { Adapter } from "../types.js";
/** Anthropic Messages API. The system prompt is marked cacheable so repeat calls read it cheaply. */
export declare function anthropic(o: {
    apiKey: string;
    version?: string;
    baseUrl?: string;
    cacheSystem?: boolean;
    fetch?: typeof fetch;
}): Adapter;
