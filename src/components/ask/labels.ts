import type { AgentId, EvidenceType, ToolName } from '../../agents/types';

export const AGENT_NAME: Record<AgentId, string> = {
  orchestrator: 'Orchestrator',
  business_analyst: 'Business Analyst',
  customer_intelligence: 'Customer Intelligence',
  growth_strategist: 'Growth Strategist',
  experiment_scientist: 'Experiment Scientist',
  risk_reviewer: 'Risk Reviewer',
  action_planner: 'Action Planner',
};

export const TOOL_LABEL: Record<ToolName, string> = {
  revenue_comparison: 'Revenue comparison',
  revenue_drivers: 'Revenue drivers',
  daypart_breakdown: 'Time-of-day breakdown',
  lapse_evidence: 'Lapsed-regular evidence',
  customer_mix: 'New vs returning customers',
  compare_interventions: 'Offer comparison',
  blanket_discount: 'Discount for everyone',
  experiment_readiness: 'Test readiness',
  latest_results: 'Latest simulated results',
  campaign_status: 'Campaign status',
  prepare_campaign_draft: 'Draft proposal',
};

export const SECTION_LABEL: Record<EvidenceType, string> = {
  observed: 'Facts from your payments',
  estimated: 'Estimates',
  assumed: 'Assumptions',
  simulated: 'Simulated outcomes',
  hypothesis: 'Possible explanations (not proven)',
};

export const SECTION_TONE: Record<EvidenceType, string> = {
  observed: 'text-accent border-accent/40',
  estimated: 'text-muted border-border-strong',
  assumed: 'text-warning border-warning/40',
  simulated: 'text-simulated border-simulated/40',
  hypothesis: 'text-text border-border-strong',
};
