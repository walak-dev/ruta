/**
 * Ruta: think-first model routing. Shared types, zero runtime dependencies.
 * Runs in Node 18+, Deno, Bun, Cloudflare Workers, Supabase Edge and the browser.
 */
export type Lang = 'es' | 'en' | 'pt' | 'fr' | 'de' | 'ht' | 'other';
export type Channel = 'whatsapp' | 'sms' | 'web' | 'app' | 'studio' | 'agent' | 'api' | 'cli';
export type RiskClass =
  | 'money'
  | 'auth_security'
  | 'identity_kyc'
  | 'legal_compliance'
  | 'pii'
  | 'none';
export type TaskType =
  | 'greeting'
  | 'thanks'
  | 'faq'
  | 'intent_topup'
  | 'status_check'
  | 'balance_check'
  | 'chat'
  | 'extract'
  | 'classify'
  | 'summarize'
  | 'translate'
  | 'write_short'
  | 'write_long'
  | 'code_small'
  | 'code_feature'
  | 'code_debug'
  | 'architecture'
  | 'plan'
  | 'analysis'
  | 'vision'
  | 'agent_orchestrate';
export type Path = 'instant' | 'cache' | 'model' | 'refuse';
export type Role = 'user' | 'orchestrator' | 'worker' | 'reviewer';
export type Strength = 'code' | 'reasoning' | 'spanish' | 'json' | 'vision';
export type StageName = 'instant' | 'memory' | 'read' | 'ask' | 'select' | 'budget';

export interface Bilingual {
  es: string;
  en: string;
}

export interface Tier {
  id: string;
  rank: number;
  label: Bilingual;
}

export interface ModelSpec {
  /** Exact provider model id. Ruta never resolves aliases, "latest" or third-party auto-routers. */
  id: string;
  provider: string;
  tier: string;
  /** USD per 1M tokens. */
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM?: number;
  contextTokens?: number;
  /** -1..1 nudges around the tier's baseline capability. */
  strengths?: Partial<Record<Strength, number>>;
  local?: boolean;
  zeroDataRetention?: boolean;
}

export interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
export interface FaqEntry {
  id: string;
  q: string[];
  a: { es: string; en?: string };
}
export interface Budget {
  remainingUsd?: number;
  perRequestMaxUsd?: number;
}

export interface RouteRequest {
  message: string;
  system?: string;
  history?: Turn[];
  /** Extra context the caller will send (files, app spec, docs), in characters. */
  contextChars?: number;
  files?: number;
  images?: number;
  channel?: Channel;
  taskHint?: TaskType;
  stage?: 'plan' | 'build' | 'review';
  role?: Role;
  lang?: Lang;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  country?: string;
  budget?: Budget;
  /** Caller promises the answer is not personal, so it may be reused for others. */
  cacheable?: boolean;
  /** The person rephrased after a stop: clears the session loop breaker. */
  resetLoop?: boolean;
  now?: number;
}

export interface RoleBounds {
  min?: string;
  max?: string;
}

export interface Policy {
  tiers: Tier[];
  /** Tiers this plan may use. Undefined = all. */
  allowTiers?: string[];
  allowProviders?: string[];
  blockModels?: string[];
  /** Minimum tier per risk class: risk beats complexity. */
  riskMinTier: Partial<Record<RiskClass, string>>;
  /** Minimum predicted success per risk class. */
  riskFloor: Record<RiskClass, number>;
  /** What a wrong answer costs you (review time, rework, harm), in USD, per risk class. */
  failureCostUsd: Record<RiskClass, number>;
  confirmFor: RiskClass[];
  /** AI may draft but never execute these; deterministic code does. */
  aiNeverExecutes: RiskClass[];
  roleBounds: Partial<Record<Role, RoleBounds>>;
  instant: boolean;
  cacheTtlMs: number;
  outputCaps: Partial<Record<TaskType, number>>;
  shortChannels: Channel[];
  shortChannelCap: number;
  maxEscalations: number;
  loopBreaker: number;
  /** How long a provider keeps a prompt prefix warm. */
  promptCacheTtlMs: number;
  preferLocal: boolean;
  offline: boolean;
  askBelowConfidence: number;
  askTimeoutMs: number;
  /** Decide and log, but the caller keeps its legacy route. */
  shadow: boolean;
  learning: boolean;
  /** "tier": customers only ever see tier names, never vendors or models. */
  customerWording: 'tier' | 'model';
  maskPii: 'untrusted' | 'all' | 'none';
  /**
   * Secret key for the audit hashes of the user id, session id and message (HMAC-SHA-256).
   * Without it they are plain SHA-256, which a dictionary can reverse for short values such as a phone number.
   * Keep it out of the audit store; changing it starts new hashes for the same user.
   */
  auditSecret?: string;
  keepTurns: number;
  /** USD per crédito, for display. */
  creditUsd: number;
  defaultLang: Lang;
}

export interface StageLog {
  stage: StageName;
  ms: number;
  used: boolean;
  result: string;
}

export interface Triage {
  task: TaskType;
  difficulty: number;
  risk: RiskClass;
  riskHits: RiskClass[];
  confidence: number;
  lang: Lang;
  inputChars: number;
  estInputTokens: number;
  reserveInputTokens: number;
  signals: string[];
  asked: boolean;
}

export interface Candidate {
  model: string;
  provider: string;
  tier: string;
  rank: number;
  pSuccess: number;
  attemptUsd: number;
  reserveUsd: number;
  expectedUsd: number;
  eligible: boolean;
  cachedTokens: number;
  note?: string;
}

export type ReasonCode =
  | 'instant_greeting'
  | 'instant_thanks'
  | 'instant_faq'
  | 'instant_topup'
  | 'instant_slot'
  | 'instant_status'
  | 'instant_balance'
  | 'cache_hit'
  | 'task_simple'
  | 'task_medium'
  | 'task_complex'
  | 'risk_pin'
  | 'confirm_gate'
  | 'sticky'
  | 'lang_fit'
  | 'local_first'
  | 'offline'
  | 'unsure_roundup'
  | 'asked'
  | 'budget_short'
  | 'budget_downgrade'
  | 'budget_refuse'
  | 'best_available'
  | 'loop_breaker'
  | 'plan_stage'
  | 'build_stage'
  | 'context_trim'
  | 'short_channel'
  | 'role_bound'
  | 'no_model';

export interface Reason {
  code: ReasonCode;
  vars?: Record<string, string | number>;
}

export interface InstantResult {
  kind: 'greeting' | 'thanks' | 'faq' | 'topup' | 'slot' | 'status' | 'balance';
  /**
   * Text to send. For greeting, thanks and faq it is the whole answer. For status, balance, topup and slot
   * it is only a placeholder or a confirmation prompt ("Consulto tu saldo."): see `needsHandler`.
   */
  answer: Bilingual;
  intent?: Record<string, unknown>;
  /**
   * True for status, balance, topup and slot: `answer` is not the real result. Your own deterministic code
   * must handle `intent` (look up the order or balance, ask for the missing detail, show the confirmation,
   * run the top-up after the person confirms). False for greeting, thanks and faq, whose `answer` is final.
   * Ruta always sets it; it is optional only so results built by hand still type-check.
   */
  needsHandler?: boolean;
}

export interface AuditRecord {
  id: string;
  at: string;
  tenantId?: string;
  userHash?: string;
  sessionHash?: string;
  channel: Channel;
  inputHash: string;
  path: Path;
  task: TaskType;
  risk: RiskClass;
  difficulty: number;
  lang: Lang;
  tier?: string;
  model?: string;
  provider?: string;
  maxOutputTokens: number;
  estUsd: number;
  baselineUsd: number;
  reasons: string[];
  shadow: boolean;
  prevHash?: string;
  hash: string;
}

export interface Decision {
  id: string;
  path: Path;
  model?: string;
  provider?: string;
  tier?: string;
  tierLabel: Bilingual;
  maxOutputTokens: number;
  reserveInputTokens: number;
  directive?: Bilingual;
  contextPlan: {
    keepTurns: number;
    droppedTurns: number;
    savedTokens: number;
    prefixTokens: number;
  };
  estimate: {
    usd: number;
    reserveUsd: number;
    baselineUsd: number;
    savingsPct: number;
    credits: number;
    baselineCredits: number;
  };
  triage: Triage;
  candidates: Candidate[];
  escalation: { model: string; tier: string; provider: string }[];
  confirmRequired: boolean;
  aiMayExecute: boolean;
  sticky: boolean;
  instant?: InstantResult;
  cached?: string;
  cacheKey?: string;
  /**
   * The message with phones, cards, emails and IBANs replaced by tokens like [EMAIL_1].
   * WARNING: `map` holds the ORIGINAL values (token -> raw email, phone, card, IBAN) so answers can be unmasked.
   * Never log, store or send `masked.map`, or a whole Decision that contains it. Log `toLogRecord(decision)` instead.
   */
  masked?: { text: string; map: Record<string, string>; kinds: string[] };
  reasons: Reason[];
  explain: { customer: Bilingual; admin: Bilingual };
  stages: StageLog[];
  thinkMs: number;
  shadow: boolean;
  audit: AuditRecord;
}

export interface SessionState {
  model?: string;
  tier?: string;
  lastAt?: number;
  prefixTokens?: number;
  failures: number;
  task?: TaskType;
}

export interface Store {
  getCache(key: string, now: number): string | undefined;
  setCache(key: string, answer: string, now: number, ttlMs: number): void;
  getStats(key: string): { s: number; f: number };
  addStat(key: string, ok: boolean): void;
  getRatio(key: string): number | undefined;
  addRatio(key: string, chars: number, tokens: number): void;
  getSession(id: string): SessionState | undefined;
  setSession(id: string, s: SessionState): void;
  lastHash(): string | undefined;
  setLastHash(h: string): void;
}

export type AskFn = (prompt: string) => Promise<string>;

export interface ChatCall {
  model: string;
  system?: string;
  messages: Turn[];
  maxOutputTokens: number;
  sessionId?: string;
  user?: string;
}
export interface ChatResult {
  text: string;
  inTok?: number;
  outTok?: number;
  cachedTok?: number;
  costUsd?: number;
}
export type Adapter = (call: ChatCall) => Promise<ChatResult>;
