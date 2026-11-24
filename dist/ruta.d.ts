import type { Adapter, AskFn, Decision, FaqEntry, ModelSpec, Policy, RouteRequest, Store } from "./types.js";
export interface RutaConfig {
    catalog?: ModelSpec[];
    policy?: Partial<Policy>;
    store?: Store;
    /** Optional tiny model for stage 4 ("ask"), used only when the cheap read is unsure. */
    ask?: AskFn;
    faq?: FaqEntry[];
}
export interface Outcome {
    ok: boolean;
    inTok?: number;
    outTok?: number;
    costUsd?: number;
    answer?: string;
    sessionId?: string;
    at?: number;
}
export interface RunAttempt {
    model: string;
    tier: string;
    provider: string;
    ok: boolean;
    costUsd: number;
    error?: string;
}
export interface RunResult {
    decision: Decision;
    text: string;
    costUsd: number;
    refused?: boolean;
    failed?: boolean;
    attempts: RunAttempt[];
}
export declare function createRuta(cfg?: RutaConfig): {
    decide: (req: RouteRequest, override?: Partial<Policy>) => Promise<Decision>;
    record: (d: Decision, o: Outcome) => void;
    run: (req: RouteRequest, opts: {
        adapters: Record<string, Adapter>;
        verify?: (text: string, d: Decision) => boolean | Promise<boolean>;
        user?: string;
        override?: Partial<Policy>;
    }) => Promise<RunResult>;
    remember: (d: Decision, answer: string) => void;
    policy: Policy;
    catalog: ModelSpec[];
    store: Store;
};
export type Ruta = ReturnType<typeof createRuta>;
