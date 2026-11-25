import type { Candidate, ModelSpec, Policy, RouteRequest, SessionState, Store, Triage } from './types.js';
export declare function tierCapability(rank: number): number;
export declare function priorSuccess(m: ModelSpec, rank: number, t: Triage, images: number): number;
export declare function statKey(t: Triage, model: string): string;
/** Beta posterior: your own outcomes pull the prior toward reality. */
export declare function posterior(prior: number, st: {
    s: number;
    f: number;
}, weight?: number): number;
export declare function attemptUsd(m: ModelSpec, inTok: number, outTok: number, cachedTok?: number): number;
export interface SelectInput {
    triage: Triage;
    req: RouteRequest;
    policy: Policy;
    catalog: ModelSpec[];
    store: Store;
    session?: SessionState | undefined;
    cap: number;
    now: number;
}
export interface SelectOutput {
    chosen?: Candidate;
    candidates: Candidate[];
    escalation: Candidate[];
    sticky: boolean;
    baseline?: Candidate;
    floorMet: boolean;
    localFirst: boolean;
}
export declare function select(inp: SelectInput): SelectOutput;
