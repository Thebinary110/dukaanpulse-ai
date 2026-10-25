/**
 * The demo's single synthetic dataset, generated once on first use.
 * Ground truth from the generator is deliberately discarded here: the app only
 * ever sees transactions, exactly as a real merchant dashboard would.
 */
import { summarizeLapsedOpportunity, type OpportunityOverview } from '../domain/detectors/lapsedSummary';
import { generateDataset } from '../domain/generator';
import { shortDateLabel } from '../domain/time';
import type { Dataset } from '../domain/types';

export interface DemoData {
  dataset: Dataset;
  /** e.g. "23 Apr – 19 Oct 2026" */
  periodLabel: string;
  /** e.g. "20 Oct 2026" */
  asOfLabel: string;
  /** Detector output as of the analysis day; independent of any date-range filter. */
  opportunity: OpportunityOverview;
}

let cached: DemoData | null = null;

export function getDemoData(): DemoData {
  if (!cached) {
    const { dataset } = generateDataset();
    const year = dataset.startDate.slice(0, 4);
    cached = {
      dataset,
      periodLabel: `${shortDateLabel(dataset.startDate, 0)} – ${shortDateLabel(dataset.startDate, dataset.dayCount - 1)} ${year}`,
      asOfLabel: `${shortDateLabel(dataset.startDate, dataset.asOfDay)} ${year}`,
      opportunity: summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay),
    };
  }
  return cached;
}
