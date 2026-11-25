/**
 * Money-action signals for es, en, pt, fr and de: "the customer asks to move or spend money now".
 * Works on tokens of accent-free lowercase text (see norm()) with emails, phones, cards and IBANs
 * replaced by placeholders, so a phone number is never read as an amount.
 *
 * Biased toward recall: a wrong "money" on a harmless message only costs a stronger tier and a
 * confirmation; a missed money action is the expensive error. It is a routing hint, never a
 * security control: callers must still gate money in their own code.
 */
export type TokKind = 'num' | 'word' | 'cur' | 'pii' | 'break';
export interface Tok {
    t: string;
    k: TokKind;
}
/** Accent-free lowercase text with PII placeholders. Safe to call on text that is already masked. */
export declare function moneyView(normalized: string): string;
export declare function tokenize(view: string): Tok[];
/** Splits at punctuation and at words that start another request. */
export declare function clauses(toks: Tok[]): Tok[][];
export interface MoneySignals {
    /** The text asks to move or spend money: send, transfer, pay, withdraw, deposit, add funds or top up. */
    action: boolean;
    /** A phone top-up is named ("recarga", "top up", "ponle saldo", "aufladen"), with or without its details. */
    topupWord: boolean;
    /** A money action that is not a phone top-up. The no-model path never handles these. */
    other: boolean;
    /** How many amounts the text holds (digits, or number words next to a currency or a recipient). */
    amounts: number;
    /** The amount, when the text holds exactly one and it is written in plain digits ("20", "20,50", "5 mil"). Otherwise null. */
    amountValue: number | null;
    /** An amount tied to a recipient: "10 a Ana", "20 dollars … to ana@example.com". */
    amountToRecipient: boolean;
    /** Verbs set aside because they hand the customer over to a person: "transfer me to a human". */
    excused: string[];
    /** Which rules fired, for explanations and tests. */
    why: string[];
}
/**
 * `chat` (the default) adds the loose chat rules: a send whose object is implied, "everything", a repeat
 * or a recipient. Studio, agent and API text leave them off: "send the form to the endpoint" is code.
 */
export declare function signalsOf(toks: Tok[], chat?: boolean): MoneySignals;
/** A word that can make a clause a money action: a send, transfer, pay, withdraw, add, move or top-up verb, or a movement noun. */
export declare function isMoneyWord(t: string): boolean;
/**
 * Is the money word at token i only the topic of a question that comes before it? True for a noun, an infinitive
 * or gerund, a verb after "to" or "zu", or a word after an article or preposition: "cuánto cuesta enviar…",
 * "how much does it cost to send…", "was kostet es … zu schicken", "combien coûte un virement…".
 * False for a finite verb ("manda", "send", "überweise"): that is a request, whatever question follows.
 * English "transfer" is a bare verb, not an infinitive, even though it ends in -er.
 */
export declare function isNonFinite(toks: Tok[], i: number): boolean;
/** Signals for accent-free lowercase text (raw or already masked). */
export declare function moneySignals(normalized: string): MoneySignals;
/** True when a clause holds nothing but top-up details: an amount, a currency, a phone, "number is". */
export declare function isTopupDetail(toks: Tok[]): boolean;
