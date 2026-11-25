import type { Outcome, Ruta } from './ruta.js';
import type { Decision, Policy, Role, RoleBounds, RouteRequest } from './types.js';

export interface SwarmOptions {
  id?: string;
  budgetUsd: number;
  /** Tier bounds per role, e.g. orchestrator ≥ pro, worker ≤ rapida. */
  roles?: Partial<Record<Role, RoleBounds>>;
  policy?: Partial<Policy>;
}

interface AgentBook {
  role: Role;
  calls: number;
  spentUsd: number;
  baselineUsd: number;
  failures: number;
  stopped: boolean;
}

/**
 * One budget for a whole agent swarm. Every agent call is decided by role, spends from
 * the shared budget, and has its own loop breaker, so one stuck agent can't drain the rest.
 */
export function createSwarm(ruta: Ruta, o: SwarmOptions) {
  const id = o.id ?? 'swarm';
  let spent = 0;
  let baseline = 0;
  const agents = new Map<string, AgentBook>();
  const book = (agentId: string, role: Role): AgentBook => {
    let a = agents.get(agentId);
    if (!a) {
      a = { role, calls: 0, spentUsd: 0, baselineUsd: 0, failures: 0, stopped: false };
      agents.set(agentId, a);
    }
    return a;
  };
  return {
    async decide(agentId: string, role: Role, req: RouteRequest): Promise<Decision> {
      book(agentId, role);
      const remaining = Math.max(0, o.budgetUsd - spent);
      return ruta.decide(
        {
          ...req,
          role,
          channel: req.channel ?? 'agent',
          sessionId: `${id}:${agentId}`,
          budget: {
            ...req.budget,
            remainingUsd: Math.min(remaining, req.budget?.remainingUsd ?? Infinity),
          },
        },
        { ...o.policy, roleBounds: { ...ruta.policy.roleBounds, ...(o.roles ?? {}) } },
      );
    },
    record(agentId: string, d: Decision, outcome: Omit<Outcome, 'sessionId'>): void {
      const a = book(agentId, agents.get(agentId)?.role ?? 'worker');
      const cost = outcome.costUsd ?? (d.path === 'model' ? d.estimate.usd : 0);
      spent += cost;
      baseline += d.estimate.baselineUsd;
      a.calls++;
      a.spentUsd += cost;
      a.baselineUsd += d.estimate.baselineUsd;
      if (d.path === 'model') a.failures = outcome.ok ? 0 : a.failures + 1;
      a.stopped = d.path === 'refuse';
      ruta.record(d, { ...outcome, sessionId: `${id}:${agentId}` });
    },
    report() {
      return {
        id,
        budgetUsd: o.budgetUsd,
        spentUsd: spent,
        remainingUsd: Math.max(0, o.budgetUsd - spent),
        baselineUsd: baseline,
        savingsPct: baseline > 0 ? Math.max(0, Math.round((1 - spent / baseline) * 100)) : 0,
        agents: [...agents.entries()].map(([agentId, a]) => ({ agentId, ...a })),
      };
    },
  };
}

export type Swarm = ReturnType<typeof createSwarm>;
