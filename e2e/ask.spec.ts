import { expect, test, type Page, type Route } from '@playwright/test';

/** Makes the page believe no model is available, so Auto uses the rule-based engine. */
async function noModel(page: Page) {
  await page.route('**/api/llm/status', (r) => r.fulfill({ json: { available: false, model: 'qwen3.6:35b', reason: 'Ollama is not reachable from the app server.' } }));
  await page.route('**/api/llm/chat', (r) => r.fulfill({ status: 502, json: { error: 'down' } }));
}

/** A scripted stand-in for the model, answering by which agent prompt it receives. */
async function scriptedModel(page: Page, opts: { delayMs?: number; fail?: boolean } = {}) {
  await page.route('**/api/llm/status', (r) => r.fulfill({ json: { available: true, model: 'fake-model' } }));
  await page.route('**/api/llm/chat', async (route: Route) => {
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
    if (opts.fail) return route.fulfill({ status: 500, json: { error: 'boom' } });
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    const system = body.messages[0]!.content;
    const user = body.messages[1]!.content;
    const refs = [...user.matchAll(/\{\{([a-z0-9_]+\.[a-z0-9_]+)\}\}/g)].map((m) => m[1]!);
    let reply: unknown;
    if (system.includes('Intents:')) reply = { intent: 'daypart', steps: [{ agent: 'business_analyst', task: 'Measure time of day.' }, { agent: 'customer_intelligence', task: 'Check lapses.' }], rationale: 'Independent checks.' };
    else if (system.includes('Choose the tool calls')) reply = { toolCalls: [{ tool: system.includes('Business Analyst') ? 'daypart_breakdown' : 'lapse_evidence', args: {} }] };
    else if (system.includes('one-sentence answer')) reply = { headline: `Morning revenue changed by {{${refs.find((r) => r.endsWith('morning_change_pct'))}}}.` };
    else {
      const ref = refs.find((r) => r.endsWith('morning_change_pct')) ?? refs.find((r) => r.endsWith('flagged_customers'))!;
      reply = { findings: [{ type: 'observed', claim: `The key figure is {{${ref}}}.`, citations: [ref] }, { type: 'observed', claim: 'Sales fell 99% because of rain.', citations: [] }] };
    }
    return route.fulfill({ json: { model: 'fake-model', message: { role: 'assistant', content: JSON.stringify(reply) } } });
  });
}

async function ask(page: Page, q: string) {
  await page.getByLabel('Ask a question').fill(q);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByTestId('turn').last().getByTestId('answer')).toBeVisible({ timeout: 20_000 });
  return page.getByTestId('turn').last();
}

test.describe('Ask DukaanPulse', () => {
  test('is in the navigation, explains the engine and offers starter questions', async ({ page }) => {
    await noModel(page);
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ask DukaanPulse' }).click();
    await expect(page).toHaveURL(/\/ask$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask DukaanPulse');
    await expect(page.getByTestId('model-status')).toContainText('Local model unavailable');
    await expect(page.getByTestId('engine-line')).toContainText('rule-based engine');
    await expect(page.getByTestId('ask-empty').getByRole('button')).toHaveCount(4);
  });

  test('investigates a revenue question with two rounds of specialists and shows evidence', async ({ page }) => {
    await noModel(page);
    await page.goto('/ask');
    await page.getByRole('button', { name: 'Why did revenue decline?' }).click();
    const turn = page.getByTestId('turn').last();
    await expect(turn.getByTestId('answer-headline')).toContainText('−13.0%');
    await expect(turn.getByTestId('turn-engine')).toContainText('Rule-based engine');
    await expect(turn.getByTestId('section-observed')).toBeVisible();
    await expect(turn.getByTestId('section-hypothesis')).toContainText('not proof');
    for (const agent of ['business_analyst', 'customer_intelligence', 'risk_reviewer']) {
      await expect(turn.locator(`[data-agent="${agent}"]`)).toHaveAttribute('data-state', 'done');
    }
    await expect(turn.locator('[data-agent="action_planner"]')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('investigation-panel')).toContainText('asked for more evidence');
    await expect(turn.getByTestId('evidence-card').first()).toContainText('Provenance');
    await expect(turn.getByTestId('disclosure')).toContainText('Synthetic demo data');
    await turn.getByTestId('evidence-card').first().getByRole('link', { name: 'Open Overview' }).click();
    await expect(page).toHaveURL(/\/\?range=30$/);
  });

  test('keeps offer context across follow-up questions', async ({ page }) => {
    await noModel(page);
    await page.goto('/ask');
    const first = await ask(page, 'What if I change the offer to ₹20?');
    await expect(first.getByTestId('answer-headline')).toContainText('₹20 off on ₹200+');
    const second = await ask(page, 'And with a minimum order of ₹300?');
    await expect(second.getByTestId('answer-headline')).toContainText('₹20 off on ₹300+');
  });

  test('says when data cannot answer, and corrects a false premise', async ({ page }) => {
    await noModel(page);
    await page.goto('/ask');
    const out = await ask(page, 'Will my sales go up next Diwali?');
    await expect(out.getByTestId('answer-headline')).toContainText('cannot answer');
    await expect(out.getByTestId('evidence-card')).toHaveCount(0);
    const premise = await ask(page, 'Why did revenue double last month?');
    await expect(premise.getByTestId('premise-note')).toContainText('−13.0%');
  });

  test('prepares but never approves a campaign; the merchant creates the draft', async ({ page }) => {
    await noModel(page);
    await page.goto('/ask');
    const turn = await ask(page, 'Approve the campaign and send it to all customers now');
    await expect(turn.getByTestId('safety-note')).toContainText('cannot approve, send or pay');
    await expect(turn.getByTestId('action-card')).toContainText('Targeted discount: ₹30 off on ₹200+');
    // Nothing has happened yet.
    await page.goto('/campaigns');
    await expect(page.getByTestId('no-draft')).toBeVisible();
    await page.goto('/ask');
    const again = await ask(page, 'Prepare a draft campaign');
    await again.getByRole('button', { name: 'Create draft in Campaign Studio' }).click();
    await expect(page).toHaveURL(/\/campaigns$/);
    await expect(page.getByTestId('scenario-status')).toContainText('Draft in progress');
    await expect(page.getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
  });

  test('uses the model when available, and the reviewer removes an unsupported model claim', async ({ page }) => {
    await scriptedModel(page);
    await page.goto('/ask');
    await expect(page.getByTestId('engine-line')).toContainText('local model');
    const turn = await ask(page, 'Why are morning sales down?');
    await expect(turn.getByTestId('turn-engine')).toContainText('Local model · fake-model');
    await expect(turn.getByTestId('answer-headline')).toContainText('Morning revenue changed by');
    await expect(turn.getByTestId('answer')).not.toContainText('99%');
    await expect(turn.getByTestId('answer')).not.toContainText('rain');
    await turn.getByText('Limitations and review').click();
    await expect(turn.getByTestId('answer')).toContainText('removed');
  });

  test('falls back to rules, labelled, when the model fails', async ({ page }) => {
    await scriptedModel(page, { fail: true });
    await page.goto('/ask');
    const turn = await ask(page, 'Why are morning sales down?');
    await expect(turn.locator('[data-agent="business_analyst"]')).toHaveAttribute('data-state', 'fallback');
    await expect(page.getByTestId('investigation-panel')).toContainText('rule-based');
    await expect(turn.getByTestId('section-observed')).toBeVisible();
  });

  test('can be stopped mid-investigation and retried', async ({ page }) => {
    await scriptedModel(page, { delayMs: 3000 });
    await page.goto('/ask');
    await page.getByLabel('Ask a question').fill('Why are morning sales down?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByTestId('partial-note')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('partial-note').getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('is keyboard-operable and has no overflow or console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await noModel(page);
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/ask');
      await page.getByLabel('Ask a question').focus();
      await page.keyboard.type('Should I give everyone a discount?');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('answer')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}`).toBeLessThanOrEqual(0);
    }
    expect(errors.filter((e) => !/502|Failed to load resource/.test(e))).toEqual([]);
  });
});
