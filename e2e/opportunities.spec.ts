import { expect, test, type Page } from '@playwright/test';
import { averageBasketOf, basketByCustomer, planAudience } from '../src/domain/campaign';
import { defaultDecisionSettings, evaluateOptions, recommend, type DecisionSettings } from '../src/domain/decision';
import { queryEvidence } from '../src/domain/detectors/evidence';
import { scoreRegulars } from '../src/domain/detectors/lapsedRegulars';
import { summarizeLapsedOpportunity } from '../src/domain/detectors/lapsedSummary';
import { formatCount, formatDays, formatINR } from '../src/domain/format';
import { generateDataset } from '../src/domain/generator';
import { DEFAULT_ASSUMPTIONS } from '../src/domain/interventions';
import { shortDateLabel } from '../src/domain/time';

// Expected values come from the same domain functions the screen uses.
const { dataset } = generateDataset();
const summary = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
if (summary.status !== 'found') throw new Error('demo dataset should contain an opportunity');
const scored = scoreRegulars(dataset.transactions, dataset.asOfDay, summary.opportunity.method);
const audience = planAudience(summary.opportunity.cohort.map((c) => c.customerId), dataset.seed);
const basket = averageBasketOf(basketByCustomer(summary.opportunity.cohort), audience.treatmentIds);
const defaults = defaultDecisionSettings(DEFAULT_ASSUMPTIONS);
const evaluate = (settings: DecisionSettings) =>
  evaluateOptions({ customers: audience.treatmentIds.length, averageBasketPaise: basket, settings });
const netText = (settings: DecisionSettings, id: string) =>
  formatINR(evaluate(settings).find((e) => e.intervention.id === id)!.economics.netIncrementalProfitPaise, { signed: true });

async function open(page: Page) {
  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(summary.status === 'found' ? summary.headline : '');
}

test.describe('Opportunity Explorer', () => {
  test('header, breadcrumb and review status', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Opportunities');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Morning regulars');
    await expect(page.getByTestId('scenario-status')).toContainText('Under review');
    await page.getByRole('link', { name: 'Back to Overview' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('summary matches detector output, with estimate kept separate', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('fact-flagged')).toHaveText(formatCount(summary.customers));
    await expect(page.getByText(`of ${formatCount(summary.opportunity.regularsTested)} regulars checked`)).toBeVisible();
    await expect(page.getByTestId('fact-gap')).toHaveText(formatDays(summary.medianCurrentGapDays));
    await expect(page.getByTestId('fact-usual')).toHaveText(formatDays(summary.medianTypicalGapDays));
    await expect(page.getByTestId('exposure-value')).toContainText(formatINR(summary.pastMonthlySpendPaise));
    await expect(page.getByTestId('exposure')).toContainText('Estimated exposure');
    await expect(page.getByTestId('exposure')).toContainText('not lost revenue');
    await expect(page.getByTestId('exposure')).toContainText(summary.opportunity.expectedFalseAlarms.toFixed(1));
  });

  test('evidence table lists detector rows with filtering, sorting and paging', async ({ page }) => {
    await open(page);
    const table = page.getByTestId('evidence-table');
    const flagged = scored.filter((r) => r.flagged).length;
    await expect(table).toContainText(`1–10 of ${formatCount(flagged)}`);

    const expectedFirst = queryEvidence(scored, { filter: 'flagged', sortKey: 'currentGapDays', direction: 'desc', page: 1, pageSize: 10 }).rows[0]!;
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toContainText(expectedFirst.customerId);
    await expect(firstRow).toContainText(shortDateLabel(dataset.startDate, expectedFirst.lastVisitDay));
    await expect(firstRow).toContainText(formatDays(expectedFirst.currentGapDays));
    await expect(firstRow).toContainText('Flagged');

    await table.getByRole('button', { name: /Comparison/ }).click();
    await expect(table).toContainText(`of ${formatCount(scored.length - flagged)}`);
    await expect(table.locator('tbody')).not.toContainText(/^Flagged$/);

    await table.getByRole('button', { name: 'Customer' }).click();
    const sortedFirst = queryEvidence(scored, { filter: 'comparison', sortKey: 'customerId', direction: 'asc', page: 1, pageSize: 10 }).rows[0]!;
    await expect(table.locator('tbody tr').first()).toContainText(sortedFirst.customerId);
    await expect(table.getByRole('columnheader', { name: 'Customer' })).toHaveAttribute('aria-sort', 'ascending');

    await table.getByRole('button', { name: 'Next' }).click();
    await expect(table).toContainText('Page 2 of');
  });

  test('methodology exposes the real settings', async ({ page }) => {
    await open(page);
    await page.getByText('Method, settings and limitations').click();
    const m = page.getByTestId('methodology');
    await expect(m).toBeVisible();
    await expect(m).toContainText(`< ${summary.opportunity.method.probabilityThreshold}`);
    await expect(m).toContainText(`${summary.opportunity.method.minGapDays} days`);
    await expect(m).toContainText('Detects absence only');
  });

  test('evidence chart shows a customer tooltip on hover', async ({ page }) => {
    await open(page);
    const chart = page.getByTestId('evidence-chart');
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.locator('.recharts-scatter-symbol').nth(5).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chart.locator('.recharts-tooltip-wrapper')).toContainText(/C-\d{4}/);
  });

  test('comparison figures match the domain model and respond to edits', async ({ page }) => {
    await open(page);
    for (const id of ['win-back-30', 'free-addon', 'double-stamps']) {
      await expect(page.getByTestId(`net-${id}`)).toHaveText(netText(defaults, id));
    }
    const rec = recommend(evaluate(defaults), 'profit');
    await expect(page.getByTestId(`recommended-${rec.recommendedId}`)).toBeVisible();

    // Bigger discount → higher cost, lower profit, exactly as the model says.
    const discount = page.getByLabel('Targeted discount: discount');
    await discount.fill('50');
    const bigger: DecisionSettings = { ...defaults, options: { ...defaults.options, 'win-back-30': { ...defaults.options['win-back-30']!, valuePaise: 5000 } } };
    await expect(page.getByTestId('net-win-back-30')).toHaveText(netText(bigger, 'win-back-30'));

    // Global assumption: margin.
    await page.getByLabel('Gross margin on sales').fill('40');
    const lowerMargin: DecisionSettings = { ...bigger, assumptions: { ...bigger.assumptions, grossMarginRate: 0.4 } };
    await expect(page.getByTestId('net-free-addon')).toHaveText(netText(lowerMargin, 'free-addon'));
    await expect(page.getByTestId('recommended-title')).toBeVisible();
  });

  test('invalid inputs show an error and never reach the figures', async ({ page }) => {
    await open(page);
    const before = await page.getByTestId('net-win-back-30').innerText();
    const margin = page.getByLabel('Gross margin on sales');
    await margin.fill('abc');
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a number.' })).toBeVisible();
    await expect(margin).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('net-win-back-30')).toHaveText(before);
    await margin.fill('95');
    await expect(page.getByRole('alert').filter({ hasText: 'Use 10% to 90%.' })).toBeVisible();
    await expect(page.getByTestId('net-win-back-30')).toHaveText(before);
    await margin.blur();
    await expect(margin).toHaveValue('55');
    await expect(page.locator('body')).not.toContainText('NaN');
  });

  test('changing the goal re-ranks according to the policy', async ({ page }) => {
    await open(page);
    await page.getByLabel('Free add-on: extra return rate').fill('30');
    const settings: DecisionSettings = { ...defaults, options: { ...defaults.options, 'free-addon': { ...defaults.options['free-addon']!, uplift: 0.3 } } };
    await page.getByText('Most customers back').click();
    const rec = recommend(evaluate(settings), 'customers');
    await expect(page.getByTestId(`recommended-${rec.recommendedId}`)).toBeVisible();
    await expect(page.getByTestId('recommendation-reasons')).toContainText('Brings back the most customers');
  });

  test('"do nothing" cannot be drafted', async ({ page }) => {
    await open(page);
    await page.getByRole('radio', { name: /Do nothing/ }).check();
    await expect(page.getByRole('button', { name: 'Draft campaign' })).toBeDisabled();
    await expect(page.getByTestId('recommendation')).toContainText('needs no campaign');
  });

  test('drafting carries the chosen option and assumptions into Campaign Studio, and survives reload', async ({ page }) => {
    await open(page);
    await page.getByRole('radio', { name: /Free add-on/ }).check();
    await page.getByLabel('Free add-on: extra return rate').fill('18');
    await page.getByLabel('Gross margin on sales').fill('60');
    await expect(page.getByTestId('selected-option')).toContainText('Free add-on');
    await page.getByRole('button', { name: 'Draft campaign' }).click();

    await expect(page).toHaveURL(/\/campaigns$/);
    await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
    await expect(page.getByTestId('draft-offer')).toContainText('Free add-on');
    await expect(page.getByTestId('draft-uplift')).toHaveText('18%');
    await expect(page.getByTestId('draft-margin')).toHaveText('60%');
    await expect(page.getByTestId('draft-summary')).toContainText(`${audience.treatmentIds.length} customers`);

    await page.reload();
    await expect(page.getByTestId('draft-offer')).toContainText('Free add-on');

    await page.getByRole('link', { name: 'Back to the comparison' }).click();
    await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
    await expect(page.getByRole('radio', { name: /Free add-on/ })).toBeChecked();
    await expect(page.getByLabel('Gross margin on sales')).toHaveValue('60');
    await expect(page.getByRole('button', { name: 'Update draft' })).toBeEnabled();
  });

  test('dismissing gives feedback, blocks drafting, and can be reopened', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Dismiss opportunity' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Offers would cost too much').check();
    await dialog.getByRole('button', { name: 'Dismiss' }).click();

    await expect(page.getByTestId('explorer-feedback')).toHaveText('Opportunity dismissed. No campaign will be drafted.');
    await expect(page.getByTestId('scenario-status')).toContainText('Dismissed');
    await expect(page.getByTestId('rejected-banner')).toContainText('Offers would cost too much');
    await expect(page.getByRole('button', { name: 'Draft campaign' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Campaign Studio' }).click();
    await expect(page.getByTestId('no-draft')).toContainText('dismissed');
    await expect(page.getByTestId('draft-summary')).toHaveCount(0);

    await page.getByRole('link', { name: 'Opportunities' }).first().click();
    await page.getByTestId('rejected-banner').getByRole('button', { name: 'Reopen review' }).click();
    await expect(page.getByTestId('scenario-status')).toContainText('Under review');
    await expect(page.getByRole('button', { name: 'Draft campaign' })).toBeEnabled();
  });

  test('options can be chosen and edited from the keyboard', async ({ page }) => {
    await open(page);
    const first = page.getByRole('radio', { name: /Targeted discount/ });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /Free add-on/ })).toBeChecked();
    await page.getByLabel('Free add-on: cost per use').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('20');
    await expect(page.getByTestId('net-free-addon')).not.toHaveText(netText(defaults, 'free-addon'));
  });

  test('no console errors or page overflow at demo widths', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});
