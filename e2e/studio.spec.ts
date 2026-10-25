import { expect, test, type Page } from '@playwright/test';
import { averageBasketOf, basketByCustomer, createCampaignDraft, estimateDraft, planAudience, updateDraftOffer } from '../src/domain/campaign';
import { summarizeLapsedOpportunity } from '../src/domain/detectors/lapsedSummary';
import { formatINR, formatPercent } from '../src/domain/format';
import { generateDataset } from '../src/domain/generator';
import { DEFAULT_ASSUMPTIONS, getIntervention } from '../src/domain/interventions';
import { generateMessage } from '../src/domain/message';
import { simulateCampaign } from '../src/domain/simulator';
import { STORAGE_KEY } from '../src/state/persistence';
import { simulationSeed } from '../src/state/scenario';

// The expected draft is rebuilt from the same domain functions and inputs the app uses.
const { dataset } = generateDataset();
const summary = summarizeLapsedOpportunity(dataset.transactions, dataset.asOfDay);
if (summary.status !== 'found') throw new Error('demo dataset should contain an opportunity');
const opp = summary.opportunity;
const audience = planAudience(opp.cohort.map((c) => c.customerId), dataset.seed);
const baskets = basketByCustomer(opp.cohort);
const basket = averageBasketOf(baskets, audience.treatmentIds);
const expectedDraft = createCampaignDraft({
  opportunityId: opp.id,
  interventionId: 'win-back-30',
  offer: getIntervention('win-back-30').offer,
  uplift: getIntervention('win-back-30').assumedUplift,
  assumptions: DEFAULT_ASSUMPTIONS,
  audience,
  merchantName: dataset.merchant.name,
  name: 'Win back morning regulars',
});

async function draftFromExplorer(page: Page) {
  await page.goto('/opportunities');
  await page.getByRole('button', { name: 'Draft campaign' }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
}

async function approve(page: Page) {
  await page.getByLabel('I understand this is a simulation').check();
  await page.getByRole('button', { name: 'Approve campaign…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve campaign' }).click();
  await expect(page.getByTestId('scenario-status')).toContainText('Approved');
}

test.describe('Campaign Studio', () => {
  test('shows a useful empty state without a draft', async ({ page }) => {
    await page.goto('/campaigns');
    await expect(page.getByTestId('no-draft')).toContainText('No campaign drafted yet');
    await page.getByTestId('no-draft').getByRole('link', { name: 'Go to Opportunities' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
  });

  test('loads the drafted campaign from shared state', async ({ page }) => {
    await draftFromExplorer(page);
    await expect(page.getByTestId('campaign-title')).toHaveText(expectedDraft.name);
    await expect(page.getByTestId('campaign-overview')).toContainText('₹30 off on ₹200+');
    await expect(page.getByTestId('overview-recipients')).toHaveText(String(audience.treatmentIds.length));
    await expect(page.getByTestId('treatment-count')).toHaveText(String(audience.treatmentIds.length));
    await expect(page.getByTestId('holdout-count')).toHaveText(String(audience.holdoutIds.length));
    await expect(page.getByTestId('message-preview')).toHaveText(generateMessage(expectedDraft.offer, dataset.merchant.name, 14));
    const e = estimateDraft(expectedDraft, basket);
    await expect(page.getByTestId('est-net')).toHaveText(formatINR(e.economics.netIncrementalProfitPaise, { signed: true }));
    await expect(page.getByTestId('est-cost')).toHaveText(formatINR(e.economics.totalCostPaise));
    await expect(page.getByTestId('simulation-notice')).toContainText('never sends messages');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Campaign Studio');
  });

  test('audience groups are disjoint and only contain flagged customers', async ({ page }) => {
    await draftFromExplorer(page);
    await page.getByText('Inspect both groups').click();
    const lists = page.getByTestId('audience-lists');
    const tables = lists.locator('table');
    const ids = async (i: number) => (await tables.nth(i).locator('tbody td:first-child').allInnerTexts()).map((t) => t.trim());
    const treatment = await ids(0);
    const holdout = await ids(1);
    expect(treatment.sort()).toEqual([...audience.treatmentIds].sort());
    expect(holdout.sort()).toEqual([...audience.holdoutIds].sort());
    expect(treatment.filter((id) => holdout.includes(id))).toEqual([]);
    const flagged = new Set(opp.cohort.map((c) => c.customerId));
    expect([...treatment, ...holdout].every((id) => flagged.has(id))).toBe(true);
    await expect(page.getByTestId('audience-card')).toContainText('Fictional demo records');
  });

  test('message editing updates preview and count, and validates offer terms', async ({ page }) => {
    await draftFromExplorer(page);
    const box = page.getByLabel('Message text');
    const text = 'Namaste! ₹30 off your next order of ₹200 or more at Sunrise Bakery.';
    await box.fill(text);
    await expect(page.getByTestId('char-count')).toHaveText(`${text.length} / 300`);
    await expect(page.getByTestId('message-preview')).toHaveText(text);
    await expect(page.getByTestId('message-ok')).toBeVisible();

    await box.fill('Namaste! Get ₹50 off at Sunrise Bakery this week.');
    await expect(page.getByTestId('message-issues')).toContainText('₹50 is not part of the offer');
    await expect(page.getByTestId('message-issues')).toContainText('Mention the discount: ₹30 off.');
    await page.getByLabel('I understand this is a simulation').check();
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toBeDisabled();
    await expect(page.getByTestId('approval-checklist').locator('[data-ok="false"]')).toContainText('Message states the offer accurately');

    await page.getByRole('button', { name: 'Reset to suggested' }).click();
    await expect(page.getByTestId('message-preview')).toHaveText(expectedDraft.message);
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toBeEnabled();
  });

  test('offer changes recalculate economics and keep the message in step', async ({ page }) => {
    await draftFromExplorer(page);
    await page.getByLabel('Discount', { exact: true }).fill('40');
    const changed = updateDraftOffer(expectedDraft, { valuePaise: 4000 }, dataset.merchant.name);
    await expect(page.getByTestId('message-preview')).toContainText('₹40 off your next order of ₹200 or more');
    await expect(page.getByTestId('est-net')).toHaveText(formatINR(estimateDraft(changed, basket).economics.netIncrementalProfitPaise, { signed: true }));
    await expect(page.getByTestId('campaign-overview')).toContainText('₹40 off on ₹200+');

    // A hand-edited message is kept and flagged when the offer changes underneath it.
    await page.getByLabel('Message text').fill('Namaste! ₹40 off your next order of ₹200 or more at Sunrise Bakery.');
    await page.getByLabel('Minimum order', { exact: true }).fill('300');
    await expect(page.getByTestId('message-issues')).toContainText('Mention the minimum order: ₹300.');
    await expect(page.getByTestId('message-issues')).toContainText('₹200 is not part of the offer');
  });

  test('invalid offer inputs never reach the draft and block approval', async ({ page }) => {
    await draftFromExplorer(page);
    const before = await page.getByTestId('est-net').innerText();
    await page.getByLabel('Discount', { exact: true }).fill('abc');
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a number.' })).toBeVisible();
    await expect(page.getByTestId('est-net')).toHaveText(before);

    await page.getByLabel('Discount', { exact: true }).fill('150');
    await expect(page.getByTestId('offer-problems')).toContainText('at most half the minimum order');
    await page.getByLabel('I understand this is a simulation').check();
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('NaN');
  });

  test('the checklist reflects real validation, including the simulation acknowledgement', async ({ page }) => {
    await draftFromExplorer(page);
    const checklist = page.getByTestId('approval-checklist');
    await expect(checklist.locator('[data-ok="false"]')).toHaveCount(1);
    await expect(checklist.locator('[data-ok="false"]')).toContainText('You understand this is a simulation');
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toBeDisabled();
    await page.getByLabel('Internal campaign name').fill('');
    await expect(checklist.locator('[data-ok="false"]')).toHaveCount(2);
    await page.getByLabel('Internal campaign name').fill('Diwali win-back');
    await expect(page.getByTestId('campaign-title')).toHaveText('Diwali win-back');
    await page.getByLabel('I understand this is a simulation').check();
    await expect(checklist.locator('[data-ok="false"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toBeEnabled();
  });

  test('cancelling approval leaves the campaign unapproved and editable', async ({ page }) => {
    await draftFromExplorer(page);
    await page.getByLabel('I understand this is a simulation').check();
    await page.getByRole('button', { name: 'Approve campaign…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('simulated');
    await expect(dialog).toContainText('no messages are sent');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
    await expect(page.getByLabel('Discount', { exact: true })).toBeEditable();
    await expect(page.getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
  });

  test('approval locks the configuration and persists across reload', async ({ page }) => {
    await draftFromExplorer(page);
    await expect(page.getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
    await approve(page);
    await expect(page.getByTestId('approved-panel')).toContainText('Ready for a simulated run');
    await expect(page.getByLabel('Discount', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Message text')).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('scenario-status')).toContainText('Approved');
    await expect(page.getByTestId('locked-note')).toContainText('locked');
  });

  test('simulation runs only after approval, is deterministic, and reaches results', async ({ page }) => {
    await draftFromExplorer(page);
    await approve(page);
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await expect(page.getByTestId('scenario-status')).toContainText('Simulating');
    await expect(page.getByTestId('simulation-panel')).toContainText('Simulated');
    await page.getByRole('button', { name: 'Skip to the end' }).click();
    await expect(page.getByTestId('scenario-status')).toContainText('Simulated result ready');

    const outcome = simulateCampaign(expectedDraft, baskets, simulationSeed(dataset.seed, expectedDraft));
    const panel = page.getByTestId('measured-panel');
    await expect(panel.getByTestId('outcome-treatment')).toHaveText(formatPercent(outcome.treatmentReturnRate, { decimals: 0 }));
    await expect(panel.getByTestId('outcome-holdout')).toHaveText(formatPercent(outcome.holdoutReturnRate, { decimals: 0 }));
    await expect(panel.getByTestId('outcome-net')).toHaveText(formatINR(outcome.netIncrementalProfitPaise, { signed: true }));
    await expect(page.getByTestId('simulation-steps').locator('[data-state="done"]')).toHaveCount(5);

    await page.reload();
    await expect(page.getByTestId('measured-panel').getByTestId('outcome-net')).toHaveText(formatINR(outcome.netIncrementalProfitPaise, { signed: true }));
    await page.getByRole('link', { name: 'View results' }).click();
    await expect(page.getByTestId('results-outcome')).toContainText('Simulated outcome, not a real result');

    // Restart and repeat: same configuration, same simulated outcome.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: 'Restart demo' }).click();
    await expect(page).toHaveURL(/\/$/);
    await draftFromExplorer(page);
    await approve(page);
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByRole('button', { name: 'Skip to the end' }).click();
    await expect(page.getByTestId('measured-panel').getByTestId('outcome-net')).toHaveText(formatINR(outcome.netIncrementalProfitPaise, { signed: true }));
  });

  test('a configuration changed after approval cannot be simulated', async ({ page }) => {
    await draftFromExplorer(page);
    await approve(page);
    await page.evaluate((key) => {
      const saved = JSON.parse(sessionStorage.getItem(key)!);
      saved.scenario.draft.offer.valuePaise = 9000;
      sessionStorage.setItem(key, JSON.stringify(saved));
    }, STORAGE_KEY);
    await page.reload();
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await expect(page.getByTestId('studio-error')).toContainText('The draft changed after approval');
    await expect(page.getByTestId('scenario-status')).toContainText('Approved');
    await expect(page.getByTestId('simulation-panel')).toHaveCount(0);
  });

  test('a dismissed opportunity has no campaign to approve', async ({ page }) => {
    await page.goto('/opportunities');
    await page.getByRole('button', { name: 'Dismiss opportunity' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dismiss' }).click();
    await page.goto('/campaigns');
    await expect(page.getByTestId('no-draft')).toContainText('dismissed');
    await expect(page.getByRole('button', { name: 'Approve campaign…' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
  });

  test('draft edits persist across reload; invalid saved state is rejected with an explanation', async ({ page }) => {
    await draftFromExplorer(page);
    await page.getByLabel('Internal campaign name').fill('Saved name');
    await page.reload();
    await expect(page.getByTestId('campaign-title')).toHaveText('Saved name');

    await page.evaluate((key) => sessionStorage.setItem(key, '{"scenario":{"status":"sent"}}'), STORAGE_KEY);
    await page.reload();
    await expect(page.getByTestId('storage-notice')).toContainText('could not be restored');
    await expect(page.getByTestId('no-draft')).toBeVisible();
  });

  test('restart clears only this demo’s saved state', async ({ page }) => {
    await draftFromExplorer(page);
    await page.evaluate(() => sessionStorage.setItem('unrelated', 'keep me'));
    await approve(page);
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByRole('button', { name: 'Skip to the end' }).click();
    await page.getByRole('button', { name: 'Restart demo' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated'))).toBe('keep me');
    await page.goto('/campaigns');
    await expect(page.getByTestId('no-draft')).toContainText('No campaign drafted yet');
  });

  test('approval works from the keyboard and Escape cancels', async ({ page }) => {
    await draftFromExplorer(page);
    await page.getByLabel('I understand this is a simulation').focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Approve campaign…' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
    await page.getByRole('button', { name: 'Approve campaign…' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'Approve campaign' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('scenario-status')).toContainText('Approved');
  });

  test('no console errors or overflow at 1440, 1024 and 390 px, including the dialog', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/campaigns');
      if (width === 1440) await draftFromExplorer(page);
      await expect(page.getByTestId('campaign-overview')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}`).toBeLessThanOrEqual(0);
      await page.getByLabel('I understand this is a simulation').check();
      await page.getByRole('button', { name: 'Approve campaign…' }).click();
      const box = (await page.getByRole('dialog').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
  });
});
