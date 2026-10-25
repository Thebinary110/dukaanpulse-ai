import { averageBasketOf, basketByCustomer, createCampaignDraft, planAudience } from '../../domain/campaign';
import { defaultDecisionSettings } from '../../domain/decision';
import { summarizeLapsedOpportunity } from '../../domain/detectors/lapsedSummary';
import { generateDataset } from '../../domain/generator';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../../domain/interventions';
import { buildLearningRecord, type LearningRecord } from '../../domain/results';
import { simulateCampaign } from '../../domain/simulator';
import { initialScenario } from '../../state/scenario';
import type { ToolContext } from '../tools/registry';

export const { dataset } = generateDataset();
export const opportunity = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
if (opportunity.status !== 'found') throw new Error('demo dataset should contain an opportunity');
export const opp = opportunity.opportunity;

export function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    dataset,
    opportunity,
    settings: defaultDecisionSettings(DEFAULT_ASSUMPTIONS),
    objective: 'profit',
    scenario: initialScenario(opp.id),
    history: [],
    ...overrides,
  };
}

export function completedRecord(): LearningRecord {
  const audience = planAudience(opp.cohort.map((c) => c.customerId), dataset.seed);
  const baskets = basketByCustomer(opp.cohort);
  const draft = createCampaignDraft({
    opportunityId: opp.id,
    interventionId: 'win-back-30',
    offer: getIntervention('win-back-30').offer,
    uplift: 0.2,
    assumptions: DEFAULT_ASSUMPTIONS,
    audience,
    merchantName: dataset.merchant.name,
    name: 'Win back morning regulars',
  });
  const outcome = simulateCampaign(draft, baskets, 1234);
  return buildLearningRecord({ draft, outcome, approval: { at: '2026-10-26T10:00:00Z', approvedBy: 'Owner (demo)' }, completedAt: '2026-10-26T10:05:00Z', averageBasketPaise: averageBasketOf(baskets, draft.treatmentIds), basketByCustomer: baskets });
}
