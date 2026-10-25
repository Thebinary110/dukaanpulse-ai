#!/usr/bin/env node
/**
 * Regenerates the README banner and screenshots from a running build.
 *   npm run build && npm run preview -- --port 4176 &
 *   node scripts/readme-assets.mjs http://localhost:4176 [--rules]
 * The banner's fonts (Fraunces, Inter, JetBrains Mono) are fetched only while rendering the PNG.
 * Screenshots walk the real journey: ask → recommendation → draft → approve → simulate → results.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:4176').replace(/\/$/, '');
const rules = process.argv.includes('--rules');
mkdirSync('docs/assets', { recursive: true });
mkdirSync('docs/screenshots', { recursive: true });

const banner = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1280px; height: 400px; background: #0a0f1e; overflow: hidden; font-family: Inter, sans-serif; position: relative; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(#141c35 1px, transparent 1px), linear-gradient(90deg, #141c35 1px, transparent 1px); background-size: 40px 40px; mask-image: radial-gradient(ellipse at 70% 50%, black 10%, transparent 75%); }
  .glow { position: absolute; width: 640px; height: 640px; right: -120px; top: -160px; background: radial-gradient(circle, rgba(76,141,255,.18), transparent 65%); }
  .wrap { position: absolute; left: 88px; top: 70px; right: 88px; }
  .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 15px; letter-spacing: .18em; color: #6a9fff; text-transform: uppercase; display: flex; align-items: center; gap: 14px; }
  .eyebrow span { color: #9aa4bd; }
  h1 { font-family: Fraunces, serif; font-weight: 600; font-size: 92px; letter-spacing: -.02em; color: #e7ebf3; margin-top: 22px; line-height: 1; }
  h1 em { font-style: italic; font-weight: 400; color: #4c8dff; }
  p { font-size: 26px; color: #9aa4bd; margin-top: 22px; }
  p b { color: #e7ebf3; font-weight: 500; }
  .tags { position: absolute; left: 88px; bottom: 54px; display: flex; gap: 12px; }
  .tag { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #c9d1e3; border: 1px solid #26314f; background: #111831; padding: 7px 12px; border-radius: 999px; }
  .tag i { color: #b4a0fc; font-style: normal; }
  svg.pulse { position: absolute; right: 72px; top: 118px; }
</style></head><body>
<div class="grid"></div><div class="glow"></div>
<svg class="pulse" width="330" height="140" viewBox="0 0 330 140"><path d="M0 90 H90 L118 40 L150 120 L182 20 L212 90 H330" fill="none" stroke="#4c8dff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><circle cx="182" cy="20" r="7" fill="#4c8dff"/></svg>
<div class="wrap">
  <div class="eyebrow">Merchant growth copilot <span>· hackathon prototype</span></div>
  <h1>DukaanPulse <em>AI</em></h1>
  <p>Turn payment signals into <b>profitable merchant actions</b>.</p>
</div>
<div class="tags"><div class="tag">multi-agent</div><div class="tag">local LLM · rules fallback</div><div class="tag">evidence-checked claims</div><div class="tag">approval-gated</div><div class="tag"><i>●</i> synthetic data</div></div>
</body></html>`;

const browser = await chromium.launch();
const b = await browser.newPage({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2 });
await b.setContent(banner, { waitUntil: 'networkidle' });
await b.evaluate(() => document.fonts.ready);
await b.screenshot({ path: 'docs/assets/banner.png' });
console.log('✓ banner');

const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (name) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `docs/screenshots/${name}.png` });
  console.log(`✓ ${name}`);
};
const scrollTo = async (locator, offset = 90) => {
  await locator.evaluate((el, o) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o }), offset);
};

await p.goto(`${base}/`);
await shot('overview');

await p.goto(`${base}/opportunities`);
await shot('opportunity-explorer');
await scrollTo(p.getByTestId('evidence-chart'), 140);
await shot('evidence');
await scrollTo(p.locator('[aria-labelledby="options-title"]'), 90);
await shot('offer-comparison');

await p.goto(`${base}/ask${rules ? '?engine=rules' : ''}`);
await p.getByLabel('Ask a question').fill('Should I give everyone a discount?');
await p.getByRole('button', { name: 'Ask', exact: true }).click();
const turn = p.getByTestId('turn').last();
await turn.getByTestId('answer').waitFor({ timeout: 150_000 });
await scrollTo(turn, 80);
await shot('ask-recommendation');

await turn.getByTestId('recommendation-card').getByRole('button', { name: 'Prepare this as a draft' }).click();
const draft = p.getByTestId('turn').last();
await draft.getByTestId('action-card').waitFor({ timeout: 150_000 });
await draft.getByRole('button', { name: 'Create draft in Campaign Studio' }).click();
await p.waitForURL('**/campaigns');
await shot('campaign-studio');

await p.getByLabel('I understand this is a simulation').check();
await p.getByRole('button', { name: 'Approve campaign…' }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Approve campaign' }).click();
await p.getByRole('button', { name: 'Run simulation' }).click();
await p.getByRole('button', { name: 'Skip to the end' }).click();
await p.getByTestId('measured-panel').waitFor();
await p.getByRole('link', { name: 'View results' }).click();
await p.getByTestId('decision-title').waitFor();
await shot('results');

const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto(`${base}/`);
await m.waitForTimeout(500);
await m.screenshot({ path: 'docs/screenshots/mobile.png' });
console.log('✓ mobile');
await browser.close();
