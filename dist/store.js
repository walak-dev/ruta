/**
 * In-memory store: answer cache (TTL + LRU), outcome stats, measured token ratios,
 * sessions and the audit hash chain. Swap in a database-backed Store in production.
 */
export function memoryStore(opts = {}) {
    const max = opts.maxCache ?? 500;
    const cache = new Map();
    const stats = new Map();
    const ratios = new Map();
    const sessions = new Map();
    let last;
    return {
        getCache(k, now) {
            const e = cache.get(k);
            if (!e)
                return undefined;
            if (e.exp < now) {
                cache.delete(k);
                return undefined;
            }
            cache.delete(k);
            cache.set(k, e);
            return e.a;
        },
        setCache(k, a, now, ttl) {
            cache.set(k, { a, exp: now + ttl });
            while (cache.size > max) {
                const first = cache.keys().next().value;
                if (first === undefined)
                    break;
                cache.delete(first);
            }
        },
        getStats(k) { return stats.get(k) ?? { s: 0, f: 0 }; },
        addStat(k, ok) {
            const st = stats.get(k) ?? { s: 0, f: 0 };
            if (ok)
                st.s++;
            else
                st.f++;
            stats.set(k, st);
        },
        getRatio(k) {
            const r = ratios.get(k);
            return r && r.tokens > 0 ? r.chars / r.tokens : undefined;
        },
        addRatio(k, chars, tokens) {
            const r = ratios.get(k) ?? { chars: 0, tokens: 0 };
            r.chars += chars;
            r.tokens += tokens;
            ratios.set(k, r);
        },
        getSession(id) { return sessions.get(id); },
        setSession(id, s) { sessions.set(id, s); },
        lastHash() { return last; },
        setLastHash(h) { last = h; },
    };
}
