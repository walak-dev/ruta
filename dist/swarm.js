/**
 * One budget for a whole agent swarm. Every agent call is decided by role, spends from
 * the shared budget, and has its own loop breaker, so one stuck agent can't drain the rest.
 */
export function createSwarm(ruta, o) {
    const id = o.id ?? "swarm";
    let spent = 0;
    let baseline = 0;
    const agents = new Map();
    const book = (agentId, role) => {
        let a = agents.get(agentId);
        if (!a) {
            a = { role, calls: 0, spentUsd: 0, baselineUsd: 0, failures: 0, stopped: false };
            agents.set(agentId, a);
        }
        return a;
    };
    return {
        async decide(agentId, role, req) {
            book(agentId, role);
            const remaining = Math.max(0, o.budgetUsd - spent);
            return ruta.decide({ ...req, role, channel: req.channel ?? "agent", sessionId: `${id}:${agentId}`, budget: { ...req.budget, remainingUsd: Math.min(remaining, req.budget?.remainingUsd ?? Infinity) } }, { ...o.policy, roleBounds: { ...ruta.policy.roleBounds, ...(o.roles ?? {}) } });
        },
        record(agentId, d, outcome) {
            const a = book(agentId, agents.get(agentId)?.role ?? "worker");
            const cost = outcome.costUsd ?? (d.path === "model" ? d.estimate.usd : 0);
            spent += cost;
            baseline += d.estimate.baselineUsd;
            a.calls++;
            a.spentUsd += cost;
            a.baselineUsd += d.estimate.baselineUsd;
            if (d.path === "model")
                a.failures = outcome.ok ? 0 : a.failures + 1;
            a.stopped = d.path === "refuse";
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
