import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = [
  { path: '/', nav: 'Overview', heading: /^Sunrise Bakery$/ },
  { path: '/opportunities', nav: 'Opportunities', heading: /may be slipping away$/ },
  { path: '/campaigns', nav: 'Campaign Studio', heading: /^Campaign Studio$/ },
  { path: '/results', nav: 'Results', heading: /^Results$/ },
];

test('every navigation destination is reachable from the sidebar', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const route of ROUTES) {
    await nav.getByRole('link', { name: route.nav }).click();
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(nav.getByRole('link', { name: route.nav })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle(/DukaanPulse AI/);
  }
});

test('synthetic-data indicator and disclaimer are always visible', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.getByRole('button', { name: 'Synthetic demo data' })).toBeVisible();
    await expect(page.getByLabel('Prototype disclaimer')).toContainText('Not affiliated with or endorsed by Paytm');
  }
});

test('unknown paths show a not-found page inside the shell', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByRole('button', { name: 'Synthetic demo data' })).toBeVisible();
});

test('mobile layout uses an accessible navigation drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Results' }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole('dialog')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('makes no requests outside the local server', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:') external.push(req.url());
  });
  for (const route of ROUTES) await page.goto(route.path, { waitUntil: 'networkidle' });
  expect(external).toEqual([]);
});

for (const route of ROUTES) {
  test(`no serious accessibility violations on ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
