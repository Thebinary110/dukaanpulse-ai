/**
 * Measures the lapsed-regular detector against the generator's planted ground truth.
 * Evaluation only; the application never uses ground truth.
 */
import { generateDataset, type GeneratorConfig } from '../generator';
import type { LapsedDetectorConfig } from '../types';
import { DEFAULT_LAPSED_CONFIG, scoreRegulars } from './lapsedRegulars';

export interface DetectorEvaluation {
  seed: number;
  planted: number;
  flagged: number;
  truePositives: number;
  falsePositives: number;
  /** truePositives / planted. */
  recall: number;
  /** Planted customers with no visit at all since their lapse began. */
  plantedFullyAbsent: number;
  /** Recall restricted to planted customers who never came back. */
  recallFullyAbsent: number;
  /** Customers not planted as lapsed (all segments). */
  ordinaryCustomers: number;
  /** falsePositives / ordinaryCustomers. */
  falsePositiveRate: number;
  /** Ordinary customers who qualified as regulars and were tested. */
  ordinaryRegularsTested: number;
  /** falsePositives / ordinaryRegularsTested. */
  falsePositiveRateAmongRegulars: number;
  /** Tested regulars × threshold: what chance alone would produce. */
  expectedFalseAlarms: number;
}

export function evaluateDetector(
  generator: Partial<GeneratorConfig> = {},
  detector: LapsedDetectorConfig = DEFAULT_LAPSED_CONFIG,
): DetectorEvaluation {
  const { dataset, groundTruth } = generateDataset(generator);
  const scored = scoreRegulars(dataset.transactions, dataset.asOfDay, detector);
  const planted = new Set(groundTruth.lapsedCustomerIds);
  const flagged = scored.filter((s) => s.flagged).map((s) => s.customerId);
  const truePositives = flagged.filter((id) => planted.has(id)).length;
  const falsePositives = flagged.length - truePositives;

  const visitedAfterLapse = new Set<string>();
  for (const t of dataset.transactions) {
    const start = groundTruth.lapseStartDay[t.customerId];
    if (start !== undefined && t.day >= start) visitedAfterLapse.add(t.customerId);
  }
  const fullyAbsent = groundTruth.lapsedCustomerIds.filter((id) => !visitedAfterLapse.has(id));
  const flaggedSet = new Set(flagged);
  const ordinaryRegularsTested = scored.filter((s) => !planted.has(s.customerId)).length;
  const ordinaryCustomers = dataset.customers.length - planted.size;

  return {
    seed: dataset.seed,
    planted: planted.size,
    flagged: flagged.length,
    truePositives,
    falsePositives,
    recall: planted.size === 0 ? 0 : truePositives / planted.size,
    plantedFullyAbsent: fullyAbsent.length,
    recallFullyAbsent: fullyAbsent.length === 0 ? 0 : fullyAbsent.filter((id) => flaggedSet.has(id)).length / fullyAbsent.length,
    ordinaryCustomers,
    falsePositiveRate: falsePositives / ordinaryCustomers,
    ordinaryRegularsTested,
    falsePositiveRateAmongRegulars: ordinaryRegularsTested === 0 ? 0 : falsePositives / ordinaryRegularsTested,
    expectedFalseAlarms: scored.length * detector.probabilityThreshold,
  };
}
