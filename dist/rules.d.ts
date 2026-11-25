import type { Channel, FaqEntry, InstantResult } from './types.js';
/**
 * The FAQ entry the message asks, or null. Similar is not enough: every content word of the message must be in
 * that entry's questions or be filler, so "a que hora abren y bloquea mi tarjeta" is not the opening-hours FAQ.
 */
export declare function matchFaq(message: string, faq: FaqEntry[], threshold?: number): FaqEntry | null;
export interface RuleContext {
    channel: Channel;
    faq: FaqEntry[];
}
export declare function instantRules(message: string, ctx: RuleContext): InstantResult | null;
