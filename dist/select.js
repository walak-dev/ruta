import { isCodeTask } from './classify.js';
import { clamp, estTokens } from './text.js';
/**
 * Stage 5, "select": the cheapest *expected cost to a usable answer*, not the cheapest call.
 *   E(model) = attempt + (1 - p) * (E(next tier up) + cost of a wrong answer)
 * A cheap model that fails often loses to a pricier one that works the first time.
 */
const BASE_CAPABILITY = [0.35, 0.55, 0.8, 0.95, 0.97];
const REASONING = new Set(['architecture', 'plan', 'analysis', 'agent_orchestrate', 'code_debug']);
/** A wrong answer costs more on some tasks (broken app, rework, a person's time). */
const FAIL_WEIGHT = {
    architecture: 6,
    code_feature: 4,
    agent_orchestrate: 4,
    code_debug: 3,
    plan: 3,
    write_long: 2,
    analysis: 2,
};
export function tierCapability(rank) {
    return BASE_CAPABILITY[Math.max(0, Math.min(rank, BASE_CAPABILITY.length - 1))] ?? 0.5;
}
export function priorSuccess(m, rank, t, images) {
    let c = tierCapability(rank);
    const s = m.strengths ?? {};
    if (isCodeTask(t.task))
        c += 0.1 * (s.code ?? 0);
    if (REASONING.has(t.task))
        c += 0.1 * (s.reasoning ?? 0);
    if (t.lang !== 'en' && t.lang !== 'other')
        c += 0.08 * (s.spanish ?? 0);
    if (t.task === 'extract' || t.task === 'classify')
        c += 0.08 * (s.json ?? 0);
    if (images > 0)
        c += 0.1 * (s.vision ?? 0);
    return clamp(1 / (1 + Math.exp(-8 * (c - t.difficulty))), 0.02, 0.995);
}
export function statKey(t, model) {
    return `${t.task}|${model}|${t.lang}|${Math.min(3, Math.floor(t.difficulty * 4))}`;
}
/** Beta posterior: your own outcomes pull the prior toward reality. */
export function posterior(prior, st, weight = 8) {
    return (prior * weight + st.s) / (weight + st.s + st.f);
}
export function attemptUsd(m, inTok, outTok, cachedTok = 0) {
    if (m.local)
        return 0;
    const cachedPrice = m.cacheReadPerM ?? m.inputPerM;
    const fresh = Math.max(0, inTok - cachedTok);
    return (fresh * m.inputPerM + cachedTok * cachedPrice + outTok * m.outputPerM) / 1e6;
}
export function select(inp) {
    const { triage: t, req, policy, catalog, store, session, cap, now } = inp;
    const tiers = new Map(policy.tiers.map((x) => [x.id, x]));
    const rankOf = (id) => (id ? tiers.get(id)?.rank : undefined);
    const minRisk = rankOf(policy.riskMinTier[t.risk]);
    const bounds = req.role ? policy.roleBounds[req.role] : undefined;
    const roleMin = rankOf(bounds?.min);
    const roleMax = rankOf(bounds?.max);
    const floor = policy.riskFloor[t.risk];
    const fail = policy.failureCostUsd[t.risk] * (FAIL_WEIGHT[t.task] ?? 1);
    const images = req.images ?? 0;
    const expectedOut = Math.max(16, Math.round(cap * 0.5));
    const warm = !!session?.model && !!session.lastAt && now - session.lastAt < policy.promptCacheTtlMs;
    const cands = [];
    const planOk = [];
    for (const m of catalog) {
        const tier = tiers.get(m.tier);
        if (!tier)
            continue;
        const inTok = estTokens(t.inputChars, t.lang, store.getRatio(`${m.id}|${t.lang}`));
        const cachedTok = warm && session?.model === m.id ? Math.min(session.prefixTokens ?? 0, inTok) : 0;
        let p = priorSuccess(m, tier.rank, t, images);
        if (policy.learning)
            p = posterior(p, store.getStats(statKey(t, m.id)));
        const c = {
            model: m.id,
            provider: m.provider,
            tier: m.tier,
            rank: tier.rank,
            pSuccess: p,
            attemptUsd: attemptUsd(m, inTok, expectedOut, cachedTok),
            reserveUsd: attemptUsd(m, t.reserveInputTokens, cap, 0),
            expectedUsd: Infinity,
            eligible: true,
            cachedTokens: cachedTok,
        };
        const no = (note) => {
            c.eligible = false;
            c.note = c.note ?? note;
        };
        if (policy.allowTiers && !policy.allowTiers.includes(m.tier))
            no('plan');
        if (policy.allowProviders && !policy.allowProviders.includes(m.provider))
            no('provider');
        if (policy.blockModels?.includes(m.id))
            no('blocked');
        if (policy.offline && !m.local)
            no('offline');
        if (images > 0 && !((m.strengths?.vision ?? 0) > 0))
            no('no_vision');
        if (m.contextTokens && inTok + cap > m.contextTokens)
            no('context');
        const onPlan = c.eligible;
        if (minRisk !== undefined && tier.rank < minRisk)
            no('risk_pin');
        if (roleMin !== undefined && tier.rank < roleMin)
            no('role_min');
        if (roleMax !== undefined && tier.rank > roleMax)
            no('role_max');
        if (onPlan)
            planOk.push({ ...c, attemptUsd: attemptUsd(m, inTok, expectedOut, 0) });
        cands.push(c);
    }
    // Expected cost to a usable answer, computed from the strongest tier down.
    const eligible = cands.filter((c) => c.eligible);
    const ranks = [...new Set(eligible.map((c) => c.rank))].sort((a, b) => b - a);
    let upE = Infinity;
    for (const r of ranks) {
        const group = eligible.filter((c) => c.rank === r);
        for (const c of group) {
            c.expectedUsd = Number.isFinite(upE)
                ? c.attemptUsd + (1 - c.pSuccess) * (upE + fail)
                : c.attemptUsd / c.pSuccess + (1 - c.pSuccess) * fail;
        }
        upE = Math.min(upE, ...group.map((c) => c.expectedUsd));
    }
    const meets = eligible.filter((c) => c.pSuccess >= floor);
    let chosen;
    let localFirst = false;
    if (policy.preferLocal) {
        const local = meets.filter((c) => catalog.find((m) => m.id === c.model)?.local);
        if (local.length) {
            chosen = local.sort((a, b) => b.pSuccess - a.pSuccess)[0];
            localFirst = true;
        }
    }
    if (!chosen && meets.length)
        chosen = [...meets].sort((a, b) => a.expectedUsd - b.expectedUsd || a.rank - b.rank)[0];
    const floorMet = !!chosen;
    if (!chosen && eligible.length)
        chosen = [...eligible].sort((a, b) => b.pSuccess - a.pSuccess || a.attemptUsd - b.attemptUsd)[0];
    const escalation = [];
    if (chosen) {
        const chosenRank = chosen.rank;
        const higher = [
            ...new Set(eligible.filter((c) => c.rank > chosenRank).map((c) => c.rank)),
        ].sort((a, b) => a - b);
        for (const r of higher.slice(0, policy.maxEscalations)) {
            const best = eligible
                .filter((c) => c.rank === r)
                .sort((a, b) => a.expectedUsd - b.expectedUsd)[0];
            if (best)
                escalation.push(best);
        }
    }
    // Baseline: what "always use the strongest model on the plan" would spend.
    const topRank = Math.max(-1, ...planOk.map((c) => c.rank));
    const baseline = planOk
        .filter((c) => c.rank === topRank)
        .sort((a, b) => b.pSuccess - a.pSuccess)[0];
    const sticky = !!chosen && chosen.cachedTokens > 0;
    return { chosen, candidates: cands, escalation, sticky, baseline, floorMet, localFirst };
}
