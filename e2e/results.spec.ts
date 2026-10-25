import { expect, test, type Page } from '@playwright/test';
import { averageBasketOf, basketByCustomer, createCampaignDraft, planAudience } from '../src/domain/campaign';
import { summarizeLapsedOpportunity } from '../src/domain/detectors/lapsedSummary';
import { formatINR } from '../src/domain/format';
import { generateDataset } from '../src/domain/generator';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../src/domain/interventions';
import { buildLearningRecord, recommendNextStep } from '../src/domain/results';
import { simulateCampaign } from '../src/domain/simulator';
import { HISTORY_KEY } from '../src/state/history';
import { simulationSeed } from '../src/state/scenario';

// Expected values are rebuilt with the same domain functions and inputs the app uses.
const { dataset } = generateDataset();
const summary = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
if (summary.status !== 'found') throw new Error('demo dataset should contain an opportunity');
const opp = summary.opportunity;
const audience = planAudience(opp.cohort.map((c) => c.customerId), dataset.seed);
const baskets = basketByCustomer(opp.cohort);
const draft = createCampaignDraft({
  opportunityId: opp.id,
  interventionId: 'win-back-30',
  offer: getIntervention('win-back-30').offer,
  uplift: getIntervention('win-back-30').assumedUplift,
  assumptions: DEFAULT_ASSUMPTIONS,
  audience,
  merchantName: dataset.merchant.name,
  name: 'Win back morning regulars',
});
const outcome = simulateCampaign(draft, baskets, simulationSeed(dataset.seed, draft));
const record = buildLearningRecord({
  draft,
  outcome,
  approval: { at: 'any', approvedBy: 'any' },
  completedAt: 'any',
  averageBasketPaise: averageBasketOf(baskets, draft.treatmentIds),
  basketByCustomer: baskets,
});

async function completeRun(page: Page, name?: string) {
  await page.goto('/opportunities');
  await page.getByRole('button', { name: 'Draft campaign' }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
  if (name) await page.getByLabel('Internal campaign name').fill(name);
  await page.getByLabel('I understand this is a simulation').check();
  await page.getByRole('button', { name: 'Approve campaign…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve campaign' }).click();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('button', { name: 'Skip to the end' }).click();
  await expect(page.getByTestId('scenario-status')).toContainText('Simulated result ready');
}

test.describe('Results & learning', () => {
  test('explains how to get results when there are none', async ({ page }) => {
    await page.goto('/results');
    await expect(page.getByTestId('results-empty')).toContainText('No completed simulated runs yet');
    await page.getByRole('link', { name: 'Go to Opportunities' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
  });

  test('shows the run with denominators, labels and the frozen estimate', async ({ page }) => {
    await completeRun(page);
    await page.getByRole('link', { name: 'View results' }).click();
    await expect(page).toHaveURL(/\/results$/);

    await expect(page.getByTestId('kpi-treatment')).toHaveText(`${outcome.treatment.returned} of ${outcome.treatment.customers}`);
    await expect(page.getByTestId('kpi-holdout')).toHaveText(`${outcome.holdout.returned} of ${outcome.holdout.customers}`);
    await expect(page.getByTestId('kpi-spend')).toHaveText(formatINR(outcome.offerCostPaise + outcome.messageCostPaise));
    await expect(page.getByTestId('kpi-net')).toHaveText(formatINR(outcome.netIncrementalProfitPaise, { signed: true }));
    await expect(page.getByTestId('results-kpis')).toContainText(`Estimated before: ${formatINR(record.estimate.netIncrementalProfitPaise, { signed: true })}`);

    const net = page.getByTestId('compare-net');
    await expect(net).toContainText(formatINR(record.estimate.netIncrementalProfitPaise));
    await expect(net).toContainText(formatINR(outcome.netIncrementalProfitPaise));
    await expect(page.getByTestId('compare-holdout_returners')).toContainText(`out of ${draft.holdoutIds.length}`);
    await expect(page.getByTestId('comparison')).toContainText('never adjusted to match the outcome');

    await expect(page.getByText('Simulated result, not a real campaign')).toBeVisible();
    await expect(page.getByTestId('profit-distribution').getByRole('img')).toHaveAttribute('aria-label', /500 simulated runs/);
    await expect(page.getByTestId('approved-config')).toContainText(draft.message);
    await expect(page.locator('body')).not.toContainText(/statistically significant (?!evidence and does not)/);
  });

  test('warns about the small sample and never claims significance', async ({ page }) => {
    await completeRun(page);
    await page.goto('/results');
    const warning = page.getByTestId('small-sample-warning');
    await expect(warning).toContainText(`Only ${draft.holdoutIds.length} customers were held back`);
    await expect(warning).toContainText('It is not statistically significant evidence and does not prove the offer caused anything.');
    await expect(page.getByTestId('rates-section')).toContainText('95% range');
  });

  test('recommends the next step with the documented rule', async ({ page }) => {
    await completeRun(page);
    await page.goto('/results');
    const expected = recommendNextStep(record);
    await expect(page.getByTestId('decision-title')).toHaveText(expected.title);
    await expect(page.getByTestId('decision-reasons')).toContainText('customers per group are needed');
    await page.getByText('How this recommendation is made').click();
    await expect(page.getByTestId('decision-rules')).toContainText('Stop');
    await expect(page.getByTestId('decision')).toContainText('not a trained model');
  });

  test('survives reload and restart, and keeps a learning history', async ({ page }) => {
    await completeRun(page, 'First run');
    await page.goto('/results');
    const net = await page.getByTestId('kpi-net').innerText();
    await page.reload();
    await expect(page.getByTestId('kpi-net')).toHaveText(net);
    await expect(page.getByTestId('run-context')).toContainText('Current run');

    // Restarting the demo clears the campaign, not the learning history.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: 'Restart demo' }).click();
    await page.goto('/results');
    await expect(page.getByTestId('run-context')).toContainText('Earlier run');
    await expect(page.getByTestId('kpi-net')).toHaveText(net);

    await completeRun(page, 'Second run');
    await page.goto('/results');
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    await expect(page.getByTestId('results-subtitle')).toContainText('Second run');
    await page.getByTestId('history-row').filter({ hasText: 'First run' }).getByRole('button', { name: 'View' }).click();
    await expect(page.getByTestId('results-subtitle')).toContainText('First run');
    await expect(page.getByTestId('kpi-net')).toHaveText(net);

    await page.getByRole('button', { name: 'Clear history' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByTestId('results-empty')).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), HISTORY_KEY)).toBeNull();
  });

  test('ignores corrupt saved history', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((k) => sessionStorage.setItem(k, '[{"version":1,"id":"x"}]'), HISTORY_KEY);
    await page.goto('/results');
    await expect(page.getByTestId('results-empty')).toBeVisible();
  });

  test('planning the next test returns to review with assumptions kept', async ({ page }) => {
    await page.goto('/opportunities');
    await page.getByLabel('Gross margin on sales').fill('60');
    await completeRun(page);
    await page.goto('/results');
    await page.getByRole('button', { name: 'Plan the next test' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
    await expect(page.getByTestId('scenario-status')).toContainText('Under review');
    await expect(page.getByLabel('Gross margin on sales')).toHaveValue('60');
    await page.goto('/results');
    await expect(page.getByTestId('run-context')).toContainText('Earlier run');
  });

  test('is reachable from the sidebar and has no overflow or console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await completeRun(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Results' }).click();
    await expect(page).toHaveURL(/\/results$/);
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/results');
      await expect(page.getByTestId('decision-title')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});
