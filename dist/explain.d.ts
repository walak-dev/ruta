import type { Decision, Lang, Policy, RiskClass, TaskType } from "./types.js";
export declare function taskName(t: TaskType, lang: "es" | "en"): string;
export declare function riskName(r: RiskClass, lang: "es" | "en"): string;
export declare function fmtNum(n: number, lang: "es" | "en", digits?: number): string;
export declare function explain(d: Decision, policy: Policy): Decision["explain"];
export declare function langKey(l: Lang): "es" | "en";
