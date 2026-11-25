import type { Channel, FaqEntry, InstantResult } from './types.js';
export declare function matchFaq(message: string, faq: FaqEntry[], threshold?: number): FaqEntry | null;
export interface RuleContext {
    channel: Channel;
    faq: FaqEntry[];
}
export declare function instantRules(message: string, ctx: RuleContext): InstantResult | null;
