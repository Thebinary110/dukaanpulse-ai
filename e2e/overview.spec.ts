import { expect, test, type Page } from '@playwright/test';
import { summarizeLapsedOpportunity } from '../src/domain/detectors/lapsedSummary';
import { formatCount, formatINR, formatPercent } from '../src/domain/format';
import { generateDataset } from '../src/domain/generator';
import { comparePeriods, revenueTrend, type RangeDays } from '../src/domain/overview';

// Expected values come from the same pure domain functions the app uses, on the same seed.
const { dataset } = generateDataset();
const expectedFor = (range: RangeDays) => comparePeriods(dataset.transactions, dataset.asOfDay, range);
const opportunity = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);

async function kpiValue(page: Page, id: string) {
  return page.getByTestId(id).locator('[data-value]').innerText();
}

test.describe('Overview command center', () => {
  test('defaults to 30 days and shows values computed from the dataset', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('radio', { name: '30 days' })).toBeChecked();
    const e = expectedFor(30);
    expect(await kpiValue(page, 'kpi-revenue')).toBe(formatINR(e.revenuePaise.current!));
    expect(await kpiValue(page, 'kpi-orders')).toBe(formatCount(e.orders.current!));
    expect(await kpiValue(page, 'kpi-aov')).toBe(formatINR(e.averageOrderValuePaise.current!));
    expect(await kpiValue(page, 'kpi-repeat')).toBe(formatPercent(e.repeatCustomerShare.current!));
    await expect(page.getByTestId('kpi-revenue')).toContainText(formatPercent(e.revenuePaise.relativeChange!, { signed: true }));
  });

  for (const range of [7, 90] as const) {
    test(`switching to ${range} days updates metrics, chart and URL`, async ({ page }) => {
      await page.goto('/');
      const before = await kpiValue(page, 'kpi-revenue');
      await page.getByText(`${range} days`, { exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`\\?range=${range}$`));
      const e = expectedFor(range);
      await expect(page.getByTestId('kpi-revenue').locator('[data-value]')).toHaveText(formatINR(e.revenuePaise.current!));
      expect(await kpiValue(page, 'kpi-revenue')).not.toBe(before);
      await expect(page.getByTestId('kpi-orders').locator('[data-value]')).toHaveText(formatCount(e.orders.current!));
      await expect(page.getByTestId('revenue-trend')).toContainText(`last ${range} days`);

      // Table view lists exactly the trend's points for this range.
      await page.getByTestId('revenue-trend').getByRole('button', { name: 'Table' }).click();
      const points = revenueTrend(dataset.transactions, dataset.asOfDay, range).points.length;
      await expect(page.getByTestId('revenue-trend').locator('tbody tr')).toHaveCount(points);
    });
  }

  test('explains when an earlier period lacks history for repeat customers (90 days)', async ({ page }) => {
    await page.goto('/?range=90');
    await expect(page.getByTestId('kpi-repeat')).toContainText('not enough earlier history');
  });

  test('range selector works from the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: '30 days' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: '90 days' })).toBeChecked();
    await expect(page).toHaveURL(/\?range=90$/);
  });

  test('opportunity panel reflects detector output', async ({ page }) => {
    if (opportunity.status !== 'found') throw new Error('demo dataset should contain an opportunity');
    await page.goto('/');
    const panel = page.getByTestId('opportunity-panel');
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(opportunity.headline);
    await expect(page.getByTestId('opportunity-summary')).toHaveText(opportunity.summary);
    await expect(panel).toContainText(`of ${formatCount(opportunity.opportunity.regularsTested)} regulars`);
    await expect(page.getByTestId('opportunity-estimate')).toContainText(`${formatINR(opportunity.pastMonthlySpendPaise)} a month`);
    await expect(page.getByTestId('opportunity-estimate')).toContainText('Estimate, not observed');

    // Changing the date range does not change the detection.
    await page.getByText('7 days', { exact: true }).click();
    await expect(page.getByTestId('opportunity-summary')).toHaveText(opportunity.summary);
  });

  test('method details expand on demand', async ({ page }) => {
    await page.goto('/');
    const method = page.getByTestId('opportunity-method');
    await expect(method).toBeHidden();
    await page.getByText('How DukaanPulse found this').click();
    await expect(method).toBeVisible();
    await expect(method).toContainText(`Regulars checked: ${formatCount(opportunity.status === 'found' ? opportunity.opportunity.regularsTested : 0)}`);
  });

  test('both calls to action lead to the opportunity investigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Investigate opportunity' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
    await page.goBack();
    await page.getByRole('link', { name: 'Start the review' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
  });

  test('revenue chart shows a tooltip with both periods on hover', async ({ page }) => {
    await page.goto('/');
    const card = page.getByTestId('revenue-trend');
    await card.scrollIntoViewIfNeeded();
    const box = (await card.locator('.recharts-wrapper').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
    const tooltip = card.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toContainText('₹');
    await expect(tooltip).toContainText('vs previous period');
  });

  test('metric definitions are available to keyboard users', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'About repeat customers' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('paid before the period started');
  });

  test('no console errors and no horizontal overflow at common widths', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const range of [7, 30, 90]) {
        await page.goto(`/?range=${range}`);
        await expect(page.getByTestId('kpi-revenue')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `overflow at ${width}px, ${range} days`).toBeLessThanOrEqual(0);
      }
    }
    expect(errors).toEqual([]);
  });
});
