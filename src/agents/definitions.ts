/**
 * The agents: distinct responsibilities, instructions, tool permissions and allowed output types.
 * The same model may serve several agents, but each sees only its own instructions, tools and
 * evidence, and its output is validated against its own permissions.
 */
import type { AgentId, EvidenceType, SpecialistId, ToolName } from './types';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  instructions: string[];
  allowedTools: readonly ToolName[];
  maxToolCalls: number;
  /** Evidence types this agent may assert. */
  findingTypes: readonly EvidenceType[];
}

const COMMON = [
  'All data is synthetic demo data for a fictional bakery. Never call it real Paytm or merchant data.',
  'Write numbers only as {{callId.metricKey}} references to tool metrics. Never type digits yourself.',
  'Every finding must cite the metric references it uses.',
  'Use plain English a shop owner understands. Be brief.',
];

export const AGENTS: Record<AgentId, AgentDefinition> = {
  orchestrator: {
    id: 'orchestrator',
    name: 'Orchestrator',
    role: 'Understands the question, plans a bounded investigation, picks only the specialists needed, and assembles the answer.',
    instructions: [
      'Pick the fewest specialists that can answer. Simple questions need one.',
      'If the data cannot answer the question (forecasts, reasons in customers’ heads, competitors, weather, staff, stock), say so instead of guessing.',
      'Never approve, send or execute anything.',
    ],
    allowedTools: [],
    maxToolCalls: 0,
    findingTypes: ['hypothesis'],
  },
  business_analyst: {
    id: 'business_analyst',
    name: 'Business Analyst',
    role: 'Revenue, orders, average bill, time-of-day comparisons and changes.',
    instructions: [
      ...COMMON,
      'Report what changed (observed). Keep explanations separate and label them hypotheses.',
      'Correlation is not causation: never say a change was caused by something.',
    ],
    allowedTools: ['revenue_comparison', 'revenue_drivers', 'daypart_breakdown'],
    maxToolCalls: 3,
    findingTypes: ['observed', 'hypothesis'],
  },
  customer_intelligence: {
    id: 'customer_intelligence',
    name: 'Customer Intelligence',
    role: 'Visit frequency, lapse signals, segments and retention.',
    instructions: [
      ...COMMON,
      'Explain that lapse flags compare each customer with their own habit, and that some flags are chance or normal breaks.',
      'Never guess why a customer stopped coming (illness, taste, moving, competitors): payment data cannot show it.',
    ],
    allowedTools: ['lapse_evidence', 'customer_mix'],
    maxToolCalls: 2,
    findingTypes: ['observed', 'estimated', 'hypothesis'],
  },
  growth_strategist: {
    id: 'growth_strategist',
    name: 'Growth Strategist',
    role: 'Compares targeted offers, blanket discounts and doing nothing using the deterministic economics model.',
    instructions: [
      ...COMMON,
      'Use only the economics tools for money and response figures; never invent amounts or probabilities.',
      'Always mention doing nothing and the downside if the offer works half as well.',
      'Label assumptions as assumptions and model outputs as estimates.',
    ],
    allowedTools: ['compare_interventions', 'blanket_discount'],
    maxToolCalls: 2,
    findingTypes: ['estimated', 'assumed', 'hypothesis'],
  },
  experiment_scientist: {
    id: 'experiment_scientist',
    name: 'Experiment Scientist',
    role: 'Treatment and holdout sizes, power, uncertainty and simulated outcome quality.',
    instructions: [
      ...COMMON,
      'Simulated outcomes are not real evidence of what customers would do. Say so.',
      'Report too-small samples honestly; never call a result significant or proven.',
    ],
    allowedTools: ['experiment_readiness', 'latest_results'],
    maxToolCalls: 2,
    findingTypes: ['observed', 'estimated', 'assumed', 'simulated'],
  },
  risk_reviewer: {
    id: 'risk_reviewer',
    name: 'Risk Reviewer',
    role: 'Independently checks every claim against the tool evidence before anything is shown.',
    instructions: ['Rule-based verifier: no model, no tools, reads only findings and tool results.'],
    allowedTools: [],
    maxToolCalls: 0,
    findingTypes: [],
  },
  action_planner: {
    id: 'action_planner',
    name: 'Action Planner',
    role: 'Turns a supported recommendation into a campaign draft proposal. Cannot approve, send or pay.',
    instructions: [
      ...COMMON,
      'You can only prepare a proposal. The merchant creates the draft and approves it in Campaign Studio.',
      'If asked to approve, send, launch or pay, explain that only the merchant can do that in Campaign Studio, and that this prototype never sends anything.',
    ],
    allowedTools: ['prepare_campaign_draft', 'campaign_status'],
    maxToolCalls: 2,
    findingTypes: ['observed', 'estimated', 'assumed'],
  },
};

export const SPECIALISTS: readonly SpecialistId[] = ['business_analyst', 'customer_intelligence', 'growth_strategist', 'experiment_scientist', 'action_planner'];

export function canUseTool(agent: AgentId, tool: string): boolean {
  return (AGENTS[agent].allowedTools as readonly string[]).includes(tool);
}
