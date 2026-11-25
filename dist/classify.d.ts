import { type Masked } from './text.js';
import type { Channel, Lang, RiskClass, RouteRequest, TaskType, Triage } from './types.js';
/**
 * Deterministic risk. The thinking step can never be talked out of it.
 * A routing hint, never a security control: callers must still gate money in their own code.
 */
export declare function riskOf(normalized: string, piiKinds?: string[], channel?: Channel): {
    risk: RiskClass;
    hits: RiskClass[];
};
export declare function isCodeTask(t: TaskType): boolean;
export declare function classify(req: RouteRequest, lang: Lang, masked: Masked): Triage;
