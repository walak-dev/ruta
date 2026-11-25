import type { Outcome, Ruta } from './ruta.js';
import type { Decision, Policy, Role, RoleBounds, RouteRequest } from './types.js';
export interface SwarmOptions {
    id?: string;
    budgetUsd: number;
    /** Tier bounds per role, e.g. orchestrator ≥ pro, worker ≤ rapida. */
    roles?: Partial<Record<Role, RoleBounds>>;
    policy?: Partial<Policy>;
}
/**
 * One budget for a whole agent swarm. Every agent call is decided by role, spends from
 * the shared budget, and has its own loop breaker, so one stuck agent can't drain the rest.
 */
export declare function createSwarm(ruta: Ruta, o: SwarmOptions): {
    decide(agentId: string, role: Role, req: RouteRequest): Promise<Decision>;
    record(agentId: string, d: Decision, outcome: Omit<Outcome, "sessionId">): void;
    report(): {
        id: string;
        budgetUsd: number;
        spentUsd: number;
        remainingUsd: number;
        baselineUsd: number;
        savingsPct: number;
        agents: {
            role: Role;
            calls: number;
            spentUsd: number;
            baselineUsd: number;
            failures: number;
            stopped: boolean;
            agentId: string;
        }[];
    };
};
export type Swarm = ReturnType<typeof createSwarm>;
