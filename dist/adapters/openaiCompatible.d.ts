import type { Adapter } from '../types.js';
export declare class RutaCallError extends Error {
    status?: number | undefined;
    constructor(code: string, status?: number | undefined);
}
type Json = Record<string, unknown>;
/**
 * Any OpenAI-compatible chat endpoint: OpenRouter, Hugging Face router, Ollama,
 * LM Studio, vLLM, llama.cpp server. Provider errors never leak to customers.
 */
export declare function openaiCompatible(o: {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    body?: Json;
    /** Body field that carries the session id (OpenRouter: "session_id"), for cache stickiness. */
    sessionField?: string;
    fetch?: typeof fetch;
}): Adapter;
/** OpenRouter with usage accounting, no training on your data, and session stickiness. */
export declare function openrouter(apiKey: string, extra?: {
    title?: string;
    body?: Json;
}): Adapter;
/** Local models: free, private, and they keep working when the internet doesn't. */
export declare function ollama(baseUrl?: string): Adapter;
export declare function huggingface(token: string, billTo?: string): Adapter;
export {};
