/**
 * Shared contracts for the agent layer.
 *
 * Agents never produce numbers. Every figure in an answer comes from a tool result metric,
 * referenced in text as {{callId.metricKey}} and rendered by the app's formatters.
 */
import type { CampaignDraft, Daypart } from '../domain/types';

export type EvidenceType = 'observed' | 'estimated' | 'assumed' | 'simulated' | 'hypothesis';

export type MetricUnit = 'paise' | 'count' | 'percent' | 'pp' | 'days' | 'ratio' | 'text';

export interface Period {
  fromDay: number;
  toDay: number;
  /** e.g. "20 Sep – 19 Oct" */
  label: string;
}

/**
 * Who or what a metric is about. Used to check that a claim describes the same population
 * the number measures (e.g. "209 regulars" must not become "209 morning customers").
 */
export type PopulationGroup =
  | 'shop' // all sales / orders
  | 'all_customers'
  | 'regulars' // every regular customer checked by the detector
  | 'flagged_regulars' // regulars flagged for an unusually long absence
  | 'new_customers'
  | 'returning_customers'
  | 'offer_group' // flagged regulars who would get / got the offer
  | 'holdout' // flagged regulars held back
  | 'campaign'; // a whole campaign (both groups) or its economics

export interface Population {
  group: PopulationGroup;
  /** Time of day the metric is restricted to, or the cohort's majority time of day for flagged regulars. */
  daypart?: Daypart;
}

export interface Metric {
  key: string;
  /** Population the value describes; absent for settings and labels. */
  population?: Population;
  label: string;
  /** Numeric value; for unit 'text' use `text`. Percent and pp are fractions (0.13 = 13%). */
  value: number;
  text?: string;
  unit: MetricUnit;
  evidence: Exclude<EvidenceType, 'hypothesis'>;
  period?: Period;
  baseline?: Period;
}

export type ToolName =
  | 'revenue_comparison'
  | 'revenue_drivers'
  | 'daypart_breakdown'
  | 'lapse_evidence'
  | 'customer_mix'
  | 'compare_interventions'
  | 'blanket_discount'
  | 'experiment_readiness'
  | 'latest_results'
  | 'campaign_status'
  | 'prepare_campaign_draft';

export interface Provenance {
  tool: ToolName;
  args: Record<string, unknown>;
  datasetSeed: number;
  asOfDay: number;
  /** Domain functions the result was computed with. */
  computedWith: string[];
}

export interface ToolResult {
  callId: string;
  tool: ToolName;
  ok: true;
  /** One-line, number-free description for the activity timeline. */
  summary: string;
  metrics: Metric[];
  limitations: string[];
  provenance: Provenance;
  /** In-app page that shows the underlying numbers. */
  link?: { to: string; label: string };
  /** The comparison window every windowed metric of this result uses. */
  window?: { days: number; current: Period; baseline: Period | null };
  /** Only for prepare_campaign_draft. */
  proposal?: ActionProposal;
}

export interface ToolError {
  callId: string;
  tool: string;
  ok: false;
  error: string;
}

export type ToolOutcome = ToolResult | ToolError;

export interface ToolCallRequest {
  tool: string;
  args?: Record<string, unknown>;
}

export type AgentId = 'orchestrator' | 'business_analyst' | 'customer_intelligence' | 'growth_strategist' | 'experiment_scientist' | 'risk_reviewer' | 'action_planner';

export type SpecialistId = Exclude<AgentId, 'orchestrator' | 'risk_reviewer'>;

export interface Finding {
  id: string;
  /** The orchestrator contributes synthesis findings (always hypotheses or cross-references). */
  agent: SpecialistId | 'orchestrator';
  type: EvidenceType;
  /** May contain {{callId.metricKey}} placeholders and no other digits. */
  claim: string;
  /** Metric refs "callId.metricKey" the claim relies on. */
  citations: string[];
  /** Population the claim is about, as declared by its author (checked against the evidence). */
  segment?: string;
  /** Time window the claim is about, as declared by its author (checked against the evidence). */
  period?: string;
}

/** One reference of a claim, resolved to the typed tool evidence behind it. */
export interface ResolvedReference {
  ref: string;
  callId: string;
  tool: ToolName;
  metricKey: string;
  label: string;
  value: string;
  evidence: Metric['evidence'];
  population?: Population;
  period?: string;
}

export interface RecommendationCard {
  status: 'recommend' | 'insufficient';
  /** e.g. "Targeted discount: ₹30 off on ₹200+" */
  action: string | null;
  target: string | null;
  /** Why, with periods; observed evidence only. */
  evidence: { text: string; refs: string[] }[];
  economics: { label: string; value: string; kind: 'estimated' | 'assumed' | 'simulated' }[];
  assumptions: { label: string; value: string }[];
  alternatives: { option: string; net: string; note: string }[];
  limitations: string[];
  /** For insufficient evidence: what is known, uncertain, and what would help. */
  known: string[];
  uncertain: string[];
  wouldHelp: string[];
  nextStep: { label: string; to?: string; ask?: string } | null;
  /** Tool call ids the card was built from. */
  sources: string[];
}

export type Intent =
  | 'revenue_change'
  | 'daypart'
  | 'lapsed_customers'
  | 'offer_strategy'
  | 'blanket_discount'
  | 'offer_what_if'
  | 'experiment_results'
  | 'campaign_status'
  | 'action_request'
  | 'unanswerable'
  | 'greeting';

export interface PlanStep {
  agent: SpecialistId;
  task: string;
}

export interface Plan {
  intent: Intent;
  /** Specialists in the first round; they run in parallel. */
  steps: PlanStep[];
  /** Plain-language reason for the plan, no numbers. */
  rationale: string;
}

export interface OfferOverrides {
  interventionId?: string;
  discountRupees?: number;
  minSpendRupees?: number;
  upliftPercent?: number;
}

export interface ConversationContext {
  lastIntent: Intent | null;
  /** Offer changes the merchant asked about, carried into follow-ups. */
  offer: OfferOverrides;
  turns: number;
}

export type ReviewSeverity = 'error' | 'warning';

export interface ReviewIssue {
  rule: string;
  severity: ReviewSeverity;
  findingId: string | null;
  message: string;
}

export interface ReviewResult {
  decision: 'pass' | 'revise';
  issues: ReviewIssue[];
}

export interface ActionProposal {
  kind: 'campaign_draft';
  draft: CampaignDraft;
  /** Problems from the existing draft checks; empty when the draft is valid. */
  problems: string[];
  /** Plain description, e.g. "Targeted discount: ₹20 off on ₹200+". */
  label: string;
}

export type Engine = 'llm' | 'deterministic';

export interface AgentReport {
  agent: SpecialistId;
  task: string;
  engine: Engine;
  /** True when the model failed and the deterministic engine took over for this agent. */
  fellBack: boolean;
  toolCalls: ToolOutcome[];
  findings: Finding[];
  /** Findings the reviewer removed (kept for transparency). */
  rejected: { finding: Finding; reasons: string[] }[];
  round: number;
}

export type TraceEvent =
  | { type: 'plan'; at: number; plan: Plan; engine: Engine }
  | { type: 'agent_start'; at: number; agent: AgentId; task: string; round: number }
  | { type: 'tool'; at: number; agent: AgentId; outcome: ToolOutcome }
  | { type: 'agent_done'; at: number; agent: AgentId; findings: number; engine: Engine; fellBack: boolean }
  | { type: 'follow_up'; at: number; agent: SpecialistId; reason: string }
  | { type: 'review'; at: number; result: ReviewResult; attempt: number }
  | { type: 'notice'; at: number; message: string };

export interface Budget {
  maxRounds: number;
  maxToolCalls: number;
  maxModelCalls: number;
  maxElapsedMs: number;
  perCallTimeoutMs: number;
  retries: number;
}

export interface AnswerSection {
  type: EvidenceType;
  findings: { id: string; agent: SpecialistId | 'orchestrator'; text: string; citations: string[]; evidence: ResolvedReference[]; segment?: string; period?: string }[];
}

export interface Answer {
  headline: string;
  sections: AnswerSection[];
  limitations: string[];
  disclosure: string;
  premiseNote: string | null;
  followUps: string[];
  recommendation: RecommendationCard | null;
}

export interface RunResult {
  question: string;
  engine: Engine;
  model: string | null;
  plan: Plan;
  reports: AgentReport[];
  review: ReviewResult;
  answer: Answer;
  action: ActionProposal | null;
  trace: TraceEvent[];
  usage: { toolCalls: number; modelCalls: number; elapsedMs: number; rounds: number };
  context: ConversationContext;
  status: 'complete' | 'partial';
  notices: string[];
}
