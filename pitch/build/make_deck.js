/* DukaanPulse AI — hackathon pitch deck generator (pptxgenjs).
 * Every number on a slide comes from Pitch_Sources_and_Claims.md (verified against the repository).
 */
// Dependencies resolve through NODE_PATH (pptxgenjs, jszip). APPLY_THEME_JS optionally points at a
// module exporting applyTheme(file, theme), which writes THEME into the deck's theme part.
const path = require('path');
const pptxgen = require('pptxgenjs');
const applyTheme = process.env.APPLY_THEME_JS ? require(process.env.APPLY_THEME_JS).applyTheme : null;

const REPO = process.env.DUKAANPULSE_REPO || path.join(__dirname, '..', '..');
const SHOTS = path.join(REPO, 'docs', 'screenshots') + path.sep;
const ICON = (n) => path.join(__dirname, 'icons', `${n}.png`);
const OUT = path.join(__dirname, '..', 'DukaanPulse_AI_Pitch.pptx');

// Palette mirrors the product's own design tokens.
const BG = '0A0F1E', SURF = '111831', SURF2 = '18213F', BORDER = '26314F', TEXT = 'E7EBF3', MUTED = '9AA4BD';
const ACCENT = '4C8DFF', SIM = 'B4A0FC', AMBER = 'F5B544', GREEN = '34D399', RED = 'F87171';
const HEAD = 'Cambria', BODY = 'Calibri';

const THEME = {
  name: 'DukaanPulse Midnight',
  headFontFace: HEAD,
  bodyFontFace: BODY,
  colors: { dk1: BG, lt1: TEXT, dk2: SURF, lt2: MUTED, accent1: ACCENT, accent2: SIM, accent3: AMBER, accent4: GREEN, accent5: RED, accent6: SURF2, hlink: ACCENT, folHlink: SIM },
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
pres.title = 'DukaanPulse AI — Merchant Growth AI pitch';
pres.author = 'DukaanPulse AI team';
pres.subject = 'Paytm Build for India AI Hackathon, Merchant Growth AI track';

const W = 13.333, H = 7.5, M = 0.6;

// ── Layouts ────────────────────────────────────────────────────────────────
pres.defineSlideMaster({
  title: 'DP_TITLE',
  background: { color: BG },
  objects: [],
});
pres.defineSlideMaster({
  title: 'DP_CONTENT',
  background: { color: BG },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.42, w: W - 2 * M, h: 0.85, fontFace: HEAD, fontSize: 28, bold: true, color: TEXT, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    { text: { text: 'DukaanPulse AI  ·  prototype on synthetic data  ·  not affiliated with Paytm', options: { x: M, y: H - 0.42, w: 8, h: 0.25, fontFace: BODY, fontSize: 10, color: MUTED, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.5, y: H - 0.42, w: 0.5, h: 0.25, fontFace: BODY, fontSize: 10, color: MUTED, align: 'right' },
});

// ── Helpers ────────────────────────────────────────────────────────────────
const txt = (slide, text, o) => slide.addText(text, { isTextBox: true, fontFace: BODY, color: TEXT, margin: 0, valign: 'top', ...o });
const card = (slide, x, y, w, h, o = {}) =>
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: o.fill ?? SURF }, line: { color: o.line ?? BORDER, width: o.lineW ?? 1 }, objectName: o.name });
const icon = (slide, name, x, y, s = 0.42) => {
  slide.addShape(pres.shapes.OVAL, { x, y, w: s + 0.24, h: s + 0.24, fill: { color: SURF2 }, line: { color: BORDER, width: 1 } });
  slide.addImage({ path: ICON(name), x: x + 0.12, y: y + 0.12, w: s, h: s, altText: `${name} icon` });
};
const tag = (slide, label, color, x, y, w = 1.25) => {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.28, rectRadius: 0.14, fill: { color: BG }, line: { color, width: 1 } });
  txt(slide, label.toUpperCase(), { x, y: y + 0.035, w, h: 0.22, fontSize: 9, bold: true, color, align: 'center', charSpacing: 1.5 });
};
const shot = (slide, file, x, y, w, alt, ratio = 900 / 1440) => {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: w * ratio + 0.12, rectRadius: 0.08, fill: { color: SURF }, line: { color: BORDER, width: 1 }, shadow: { type: 'outer', color: '000000', blur: 12, offset: 4, angle: 90, opacity: 0.45 } });
  slide.addImage({ path: SHOTS + file, x, y, w, h: w * ratio, altText: alt });
};
const arrow = (slide, x1, y1, x2, y2, color = MUTED, dashed = false) =>
  slide.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(Math.abs(x2 - x1), 0.001), h: Math.max(Math.abs(y2 - y1), 0.001), flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.5, endArrowType: 'triangle', dashType: dashed ? 'dash' : 'solid' } });
const content = (title, section) => {
  const s = pres.addSlide({ masterName: 'DP_CONTENT', sectionTitle: section });
  // Kicker names the required PPT section (official guideline) this slide belongs to.
  txt(s, section.toUpperCase(), { x: M, y: 0.16, w: 8, h: 0.24, fontSize: 10, bold: true, color: ACCENT, charSpacing: 2 });
  s.addText(title, { placeholder: 'title' });
  return s;
};

pres.addSection({ title: 'Title' });
// ── 1. Title ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide({ masterName: 'DP_TITLE', sectionTitle: 'Title' });
  s.addImage({ path: path.join(REPO, 'docs', 'assets', 'banner.png'), x: 0, y: 0.55, w: W, h: W * (800 / 2560), altText: 'DukaanPulse AI banner: Turn payment signals into profitable merchant actions' });
  txt(s, 'Evidence-backed decisions for small merchants — with the merchant in control', { x: M + 0.35, y: 4.95, w: 12, h: 0.5, fontSize: 22, color: TEXT });
  txt(s, 'Paytm Build for India AI Hackathon  ·  Merchant Growth AI track', { x: M + 0.35, y: 5.6, w: 12, h: 0.35, fontSize: 15, color: MUTED });
  txt(s, [
    { text: 'Live demo  ', options: { bold: true, color: ACCENT } },
    { text: 'dukaanpulse-ai.vercel.app', options: { color: TEXT, hyperlink: { url: 'https://dukaanpulse-ai.vercel.app' } } },
    { text: '     Code  ', options: { bold: true, color: ACCENT } },
    { text: 'github.com/Thebinary110/dukaanpulse-ai', options: { color: TEXT, hyperlink: { url: 'https://github.com/Thebinary110/dukaanpulse-ai' } } },
  ], { x: M + 0.35, y: 6.15, w: 12, h: 0.35, fontSize: 14 });
  txt(s, 'Working prototype on synthetic data for a fictional bakery. Not affiliated with or endorsed by Paytm.', { x: M + 0.35, y: 6.65, w: 11, h: 0.3, fontSize: 11, color: MUTED, italic: true });
  s.addNotes(
    'SCRIPT (15s): "Every day a shop owner looks at their payments and asks one question: what should I do about this? DukaanPulse AI answers that question with evidence — and leaves the decision with the merchant."\n\n' +
      'QUALIFY: Say early and plainly that this runs on synthetic data for a fictional bakery and is not connected to Paytm.\n\nTRANSITION: "Let me show you the decision our bakery is facing."',
  );
}

pres.addSection({ title: 'Problem Statement' });
// ── 2. The decision ────────────────────────────────────────────────────────
{
  const s = content('Sales are slipping. Should the bakery discount everything?', 'Problem Statement');
  const stats = [
    ['−13.0%', 'revenue, last 30 days vs the 30 before', '₹7.91L vs ₹9.09L'],
    ['−21.6%', 'morning revenue — the biggest fall', '20 Sep – 19 Oct'],
    ['34 of 209', 'regulars away far longer than their own habit', 'median 30 days vs 2.4 usual'],
  ];
  stats.forEach(([big, label, sub], i) => {
    const x = M + i * 4.1;
    card(s, x, 1.6, 3.85, 2.55, { name: `stat-${i}` });
    txt(s, big, { x: x + 0.3, y: 1.85, w: 3.3, h: 0.95, fontFace: HEAD, fontSize: 44, bold: true, color: i === 2 ? ACCENT : TEXT });
    txt(s, label, { x: x + 0.3, y: 2.85, w: 3.3, h: 0.65, fontSize: 15, color: TEXT });
    txt(s, sub, { x: x + 0.3, y: 3.55, w: 3.3, h: 0.3, fontSize: 12, color: MUTED });
  });
  tag(s, 'Observed', ACCENT, M, 4.45);
  txt(s, 'All figures come from the app’s synthetic payment data for a fictional bakery.', { x: M + 1.4, y: 4.47, w: 9, h: 0.3, fontSize: 12, color: MUTED });
  card(s, M, 5.0, W - 2 * M, 1.55, { fill: SURF2 });
  icon(s, 'store', M + 0.3, 5.25);
  txt(s, 'The owner has the data. What they lack is a trustworthy answer to: “What is worth doing, for whom, and what will it cost?”', { x: M + 1.25, y: 5.3, w: 10.6, h: 0.95, fontFace: HEAD, fontSize: 20, italic: true, color: TEXT, valign: 'middle' });
  s.addNotes(
    'SCRIPT (30s): "Sunrise Bakery is our fictional merchant. Revenue is down 13 percent in a month, and mornings are down almost 22 percent. Thirty-four of its 209 regular customers have been away about a month, when they normally come every two to three days. The instinct is a storewide discount. Is that the right call?"\n\n' +
      'QUALIFY: These are observed figures in SYNTHETIC data (seeded generator, 180 days). Do not imply a real shop.\n\nTRANSITION: "Today a merchant has two kinds of tools for this — and neither answers it."',
  );
}

// ── 3. Why dashboards and chat fall short ──────────────────────────────────
{
  const s = content('Dashboards show change. Chatbots sound sure. Neither decides.', 'Problem Statement');
  const cols = [
    ['layout', 'Analytics dashboard', MUTED, ['Shows revenue fell', 'Leaves the “so what?” to the owner', 'No cost or trade-off of acting']],
    ['message', 'Generic AI chat', MUTED, ['Fluent, confident answers', 'Can invent numbers, segments or causes', 'Can be pushed to “just send it”']],
    ['target', 'DukaanPulse AI', ACCENT, ['Finds who changed and why it matters', 'Prices each response, incl. doing nothing', 'Every claim checked; merchant approves']],
  ];
  cols.forEach(([ic, head, col, items], i) => {
    const x = M + i * 4.1;
    const hi = i === 2;
    card(s, x, 1.55, 3.85, 3.9, { fill: hi ? SURF2 : SURF, line: hi ? ACCENT : BORDER, lineW: hi ? 1.5 : 1 });
    icon(s, ic, x + 0.3, 1.8);
    txt(s, head, { x: x + 1.2, y: 1.95, w: 2.5, h: 0.4, fontFace: HEAD, fontSize: 20, bold: true, color: hi ? TEXT : MUTED });
    txt(
      s,
      items.map((t, j) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: j < items.length - 1 } })),
      { x: x + 0.3, y: 2.75, w: 3.3, h: 2.5, fontSize: 16, color: hi ? TEXT : MUTED, paraSpaceAfter: 12 },
    );
  });
  card(s, M, 5.75, W - 2 * M, 0.85, { fill: SURF2 });
  txt(s, 'For a decision that costs real money, “sounds right” is not good enough — every number and claim must be traceable.', { x: M + 0.35, y: 5.75, w: W - 2 * M - 0.7, h: 0.85, fontFace: HEAD, fontSize: 17, italic: true, valign: 'middle' });
  s.addNotes(
    'SCRIPT (30s): "A dashboard tells the owner revenue fell — then leaves them alone with it. A generic AI chatbot will happily answer, but it can make up a number, mix up which customers it is talking about, or state a cause it cannot know. For money decisions, that is dangerous. DukaanPulse is built to decide safely: it finds who changed, prices every option including doing nothing, checks its own claims, and never acts without the merchant."\n\n' +
      'QUALIFY: Do not claim competitors lack these features; describe categories of tools, not named products.\n\nTRANSITION: "Here is the whole product on one slide."',
  );
}

pres.addSection({ title: 'Proposed Solution' });
// ── 4. Product in one visual ───────────────────────────────────────────────
{
  const s = content('One loop: from a payment signal to a measured decision', 'Proposed Solution');
  const steps = [
    ['ask', 'Ask', 'Merchant asks in plain words'],
    ['search', 'Investigate', 'Specialist agents gather evidence'],
    ['scale', 'Compare', 'Price each option, incl. doing nothing'],
    ['user', 'Approve', 'Merchant edits and approves — or not'],
    ['flask', 'Measure', 'Simulated run vs a held-back group'],
  ];
  const y = 2.05, bw = 2.1, gap = (W - 2 * M - 5 * bw) / 4;
  steps.forEach(([ic, head, sub], i) => {
    const x = M + i * (bw + gap);
    card(s, x, y, bw, 2.35, { fill: i === 3 ? SURF2 : SURF, line: i === 3 ? GREEN : BORDER });
    icon(s, ic, x + (bw - 0.66) / 2, y + 0.25);
    txt(s, head, { x, y: y + 1.05, w: bw, h: 0.4, fontFace: HEAD, fontSize: 19, bold: true, align: 'center' });
    txt(s, sub, { x: x + 0.15, y: y + 1.5, w: bw - 0.3, h: 0.7, fontSize: 13, color: MUTED, align: 'center' });
    if (i < 4) arrow(s, x + bw + 0.04, y + 1.17, x + bw + gap - 0.04, y + 1.17, ACCENT);
  });
  // Learning return arrow
  arrow(s, M + 4 * (bw + gap) + bw / 2, y + 2.4, M + 4 * (bw + gap) + bw / 2, y + 2.85, MUTED);
  s.addShape(pres.shapes.LINE, { x: M + bw / 2, y: y + 2.85, w: 4 * (bw + gap), h: 0, line: { color: MUTED, width: 1.5 } });
  arrow(s, M + bw / 2, y + 2.85, M + bw / 2, y + 2.4, MUTED);
  txt(s, 'Results feed the next decision: repeat with a larger test, revise the offer, or stop', { x: M + 2.2, y: y + 2.95, w: 8.6, h: 0.35, fontSize: 14, italic: true, color: MUTED, align: 'center' });
  card(s, M, 5.85, W - 2 * M, 0.85, { fill: SURF2 });
  txt(s, [
    { text: 'Agents reason. ', options: { bold: true, color: TEXT } },
    { text: 'Tested calculations produce every number. ', options: { color: TEXT } },
    { text: 'The merchant decides.', options: { bold: true, color: GREEN } },
  ], { x: M + 0.35, y: 5.85, w: W - 2 * M - 0.7, h: 0.85, fontSize: 18, valign: 'middle', fontFace: HEAD });
  s.addNotes(
    'SCRIPT (40s): "DukaanPulse is one loop. The merchant asks a question. Specialist AI agents investigate the payment data. The app prices each possible response — including doing nothing. The merchant edits and approves, or walks away. Then we measure against customers who were deliberately held back, and that result feeds the next decision."\n\n' +
      'QUALIFY: "Measure" is a SIMULATED run in this prototype — no messages are sent.\n\nTRANSITION: "Let me show you this live."',
  );
}

// ── 5. Live journey ────────────────────────────────────────────────────────
{
  const s = content('Live: “Should I give everyone a discount?”', 'Proposed Solution');
  shot(s, 'ask-recommendation.png', M, 1.45, 7.6, 'Ask DukaanPulse answer with recommendation card, agents and investigation timeline (local model)');
  const points = [
    ['bot', 'Agents work in parallel', 'Growth Strategist and Customer Intelligence investigate together; the timeline shows each tool call.'],
    ['target', 'A decision, not a chart', 'Recommended action, who it targets, cost, assumptions and alternatives.'],
    ['check', 'Checked before shown', 'An independent reviewer removed unsupported claims from this answer.'],
  ];
  points.forEach(([ic, head, sub], i) => {
    const y = 1.5 + i * 1.6;
    icon(s, ic, 8.75, y);
    txt(s, head, { x: 9.6, y: y + 0.02, w: 3.15, h: 0.35, fontSize: 16, bold: true });
    txt(s, sub, { x: 9.6, y: y + 0.42, w: 3.15, h: 1.0, fontSize: 13, color: MUTED });
  });
  tag(s, 'Real screen', ACCENT, M, 6.35);
  txt(s, 'Local Qwen model via Ollama · ~25 s average per question · instant rule-based mode if needed', { x: M + 1.4, y: 6.37, w: 9, h: 0.3, fontSize: 12, color: MUTED });
  s.addNotes(
    'DEMO: Ask "Should I give everyone a discount?" in Ask DukaanPulse (local model). While it runs (about 25–45 s), narrate the timeline: plan, parallel specialists, tool calls, Risk Reviewer verdict.\n' +
      'If it passes ~45 s: press Stop, switch to "Rules only" (or the /ask?engine=rules tab) and re-ask — answers are instant and labelled rule-based.\n\n' +
      'SCRIPT: "I asked whether to discount everyone. Two specialist agents investigated in parallel — you can see every tool they called. The answer is a decision card: what to do, for whom, what it costs, and the alternatives."\n\n' +
      'QUALIFY: Latency averaged 24.8 s and peaked at 44.3 s in the latest 12-case live run; say it is a local model running on our own hardware.\n\nTRANSITION: "Let us look at the numbers behind that answer."',
  );
}

// ── 6. The blanket-discount decision ───────────────────────────────────────
{
  const s = content('The numbers behind it: target the regulars, don’t subsidise all', 'Proposed Solution');
  const colW = 5.85;
  // Blanket
  card(s, M, 1.45, colW, 3.85);
  txt(s, '₹30 off for every customer', { x: M + 0.35, y: 1.65, w: colW - 0.7, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true, color: MUTED });
  txt(s, '₹92,700', { x: M + 0.35, y: 2.2, w: 3.5, h: 0.85, fontFace: HEAD, fontSize: 46, bold: true, color: RED });
  txt(s, 'given away a month on orders that would happen anyway — if every one of the last 30 days’ 3,090 orders used it', { x: M + 0.35, y: 3.05, w: colW - 0.7, h: 0.75, fontSize: 13, color: TEXT });
  txt(s, [
    { text: '+27%', options: { bold: true, color: TEXT, fontSize: 22, fontFace: HEAD } },
    { text: '  orders needed just to break even (≈837 extra orders)', options: { color: MUTED, fontSize: 13 } },
  ], { x: M + 0.35, y: 3.95, w: colW - 0.7, h: 0.5 });
  tag(s, 'Estimate', MUTED, M + 0.35, 4.7, 1.1);
  tag(s, 'Assumes 55% margin', AMBER, M + 1.55, 4.7, 2.1);
  // Targeted
  const x2 = M + colW + 0.43;
  card(s, x2, 1.45, colW, 3.85, { fill: SURF2, line: ACCENT, lineW: 1.5 });
  txt(s, 'Recommended: ₹30 off ₹200+, 27 regulars', { x: x2 + 0.35, y: 1.65, w: colW - 0.7, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true });
  const rows = [
    ['+₹1,133', 'expected net extra profit', ACCENT],
    ['₹213', 'expected cost (offers + messages)', TEXT],
    ['11% vs 30%', 'return rate to break even vs assumed', TEXT],
    ['+₹529', 'still positive if it works half as well', GREEN],
  ];
  rows.forEach(([v, l, c], i) => {
    const y = 2.2 + i * 0.62;
    txt(s, v, { x: x2 + 0.35, y, w: 2.2, h: 0.5, fontFace: HEAD, fontSize: 22, bold: true, color: c });
    txt(s, l, { x: x2 + 2.6, y: y + 0.1, w: colW - 2.95, h: 0.4, fontSize: 13, color: MUTED });
  });
  tag(s, 'Estimate', MUTED, x2 + 0.35, 4.7, 1.1);
  tag(s, 'Assumes +20 pt uplift', AMBER, x2 + 1.55, 4.7, 2.3);
  // Footnote
  card(s, M, 5.5, W - 2 * M, 1.2, { fill: BG, line: BORDER });
  txt(s, [
    { text: 'Read this honestly. ', options: { bold: true, color: AMBER } },
    { text: 'Different scopes: the blanket figure covers all orders over 30 days; the targeted offer covers 27 flagged regulars (7 more held back) over a 14-day campaign. Both are model estimates from editable assumptions — 10% would return anyway, 85% of returners redeem, 1 later full-price visit — not measured results. Alternatives shown in-app: free add-on +₹859, loyalty bonus +₹447, do nothing ₹0.', options: { color: MUTED } },
  ], { x: M + 0.3, y: 5.6, w: W - 2 * M - 0.6, h: 1.0, fontSize: 12.5 });
  s.addNotes(
    'SCRIPT (45s): "Here is why the answer says target, not blanket. A ₹30 discount for everyone would give away about ₹92,700 a month on orders the bakery gets anyway — and orders would need to grow 27 percent just to break even. Instead: ₹30 off on ₹200 or more, for the 27 regulars who have gone quiet, with 7 held back to measure. Expected cost about ₹213, expected net about ₹1,133, it breaks even if 11 percent come back against an assumed 30 — and it stays positive even if it works half as well."\n\n' +
      'HOW THE NUMBERS ARE COMPUTED (if asked): ₹92,700 = 3,090 orders (last 30 days, observed) × ₹30, assuming every order redeems (upper bound). Break-even: each extra order earns ₹256 × 55% − ₹30 = ₹110.78; ₹92,700 ÷ ₹110.78 ≈ 837 extra orders = 27.1% of 3,090. Targeted economics: deterministic expected-value model (campaignEconomics) with baseline 10%, uplift +20 pts, redemption 85%, margin 55%, 1 follow-on visit, ₹0.25 per message.\n\n' +
      'QUALIFY: Different scopes (30-day all orders vs 27 customers / 14 days). These are estimates, not results. Do NOT say "saves ₹92,700".\n\nTRANSITION: "And once the merchant acts, we measure it honestly."',
  );
}

// ── 9. Act and measure ─────────────────────────────────────────────────────
{
  const s = content('Act, then measure honestly — even when evidence is thin', 'Proposed Solution');
  shot(s, 'campaign-studio.png', M, 1.5, 5.65, 'Campaign Studio: draft offer, message, economics and approval checklist');
  shot(s, 'results.png', M + 6.15, 1.5, 5.65, 'Results: simulated outcome vs estimate with small-sample warning');
  txt(s, 'Approve the exact offer; no edits after approval', { x: M, y: 5.2, w: 5.65, h: 0.35, fontSize: 14, bold: true });
  txt(s, 'Message must state the offer’s real terms; a checklist gates approval.', { x: M, y: 5.55, w: 5.65, h: 0.6, fontSize: 12.5, color: MUTED });
  txt(s, 'Simulated result vs 7 held-back customers', { x: M + 6.15, y: 5.2, w: 5.65, h: 0.35, fontSize: 14, bold: true });
  txt(s, '27 vs 7 gives only ~13% power to detect the assumed lift; ~62 per group needed. The app says “repeat with a larger test” instead of claiming a win.', { x: M + 6.15, y: 5.55, w: 5.65, h: 0.8, fontSize: 12.5, color: MUTED });
  tag(s, 'Simulated', SIM, M + 6.15, 6.42, 1.2);
  s.addNotes(
    'DEMO (optional): click "Prepare this as a draft" → "Create draft in Campaign Studio" → tick the simulation acknowledgement → Approve → Run simulation → Skip to the end → View results.\n\n' +
      'SCRIPT (40s): "When the merchant acts, they approve the exact offer — the message has to state the real terms, and nothing can change after approval. We then run it against customers who were held back. In our rehearsed run, 4 of 27 came back with the offer versus 0 of 7 without — but with groups this small, the app refuses to call that a win. It says: repeat with a larger test, about 62 per group."\n\n' +
      'QUALIFY: Results are SIMULATED from stated assumptions, not real customers. Rehearsed run: 4/27 vs 0/7, net +₹863 vs +₹1,133 estimated; power ~13%; 62 per group for 80% power.\n\nTRANSITION: "Here is how it works under the hood."',
  );
}

pres.addSection({ title: 'Technology / Tech Stack' });
// ── 7. How it works ────────────────────────────────────────────────────────
{
  const s = content('How it works: agents reason, tools calculate, a reviewer checks', 'Technology / Tech Stack');
  // Question + orchestrator
  card(s, M, 1.5, 2.2, 0.9, { fill: SURF2 });
  txt(s, 'Merchant question', { x: M, y: 1.5, w: 2.2, h: 0.9, fontSize: 14, bold: true, align: 'center', valign: 'middle' });
  arrow(s, M + 2.25, 1.95, M + 2.85, 1.95, ACCENT);
  card(s, M + 2.9, 1.5, 2.5, 0.9, { line: ACCENT });
  txt(s, [{ text: 'Orchestrator', options: { bold: true, breakLine: true } }, { text: 'plans · budgets · synthesises', options: { fontSize: 11, color: MUTED } }], { x: M + 2.9, y: 1.5, w: 2.5, h: 0.9, fontSize: 14, align: 'center', valign: 'middle' });
  // Specialists
  const specs = ['Business Analyst', 'Customer Intelligence', 'Growth Strategist', 'Experiment Scientist', 'Action Planner'];
  const sx = M + 5.95, sw = 2.15;
  specs.forEach((name, i) => {
    const y = 1.35 + i * 0.62;
    card(s, sx, y, sw, 0.5, { fill: i === 4 ? SURF2 : SURF, line: i === 4 ? GREEN : BORDER });
    txt(s, name, { x: sx, y, w: sw, h: 0.5, fontSize: 12.5, align: 'center', valign: 'middle', bold: i === 4 });
  });
  arrow(s, M + 5.45, 1.95, sx - 0.05, 1.95, ACCENT);
  // Tools
  const tx = sx + sw + 0.55;
  card(s, tx, 1.35, 3.25, 2.3, { fill: SURF2 });
  icon(s, 'database', tx + 0.2, 1.5, 0.34);
  txt(s, 'Allowlisted tools', { x: tx + 0.85, y: 1.55, w: 2.3, h: 0.35, fontSize: 14, bold: true });
  txt(s, [
    { text: '11 read-only tools over tested domain code', options: { breakLine: true } },
    { text: 'each agent may call only its own', options: { breakLine: true } },
    { text: 'results carry unit, population, period, provenance', options: {} },
  ], { x: tx + 0.25, y: 2.15, w: 2.85, h: 1.9, fontSize: 12, color: MUTED, paraSpaceAfter: 6 });
  arrow(s, sx + sw + 0.05, 2.5, tx - 0.05, 2.5, MUTED);
  // Reviewer + answer row
  const ry = 4.75;
  card(s, M + 2.9, ry, 2.9, 1.15, { line: AMBER });
  txt(s, [{ text: 'Risk Reviewer', options: { bold: true, breakLine: true } }, { text: 'rule-based · no model · no tools', options: { fontSize: 11, color: MUTED } }], { x: M + 2.9, y: ry, w: 2.9, h: 1.15, fontSize: 15, align: 'center', valign: 'middle' });
  arrow(s, sx - 0.05, 4.05, M + 5.2, ry - 0.03, AMBER);
  txt(s, 'findings', { x: M + 5.0, y: 4.25, w: 0.8, h: 0.25, fontSize: 10, color: AMBER });
  card(s, M, ry, 2.2, 1.15, { fill: SURF2, line: ACCENT });
  txt(s, [{ text: 'Answer', options: { bold: true, breakLine: true } }, { text: 'facts · estimates · hypotheses', options: { fontSize: 11, color: MUTED } }], { x: M, y: ry, w: 2.2, h: 1.15, fontSize: 15, align: 'center', valign: 'middle' });
  arrow(s, M + 2.85, ry + 0.57, M + 2.25, ry + 0.57, ACCENT);
  // Action path
  card(s, sx, ry, 5.95, 1.15, { line: GREEN });
  txt(s, [
    { text: 'Proposal only — the merchant acts', options: { bold: true, breakLine: true } },
    { text: 'Merchant clicks → draft → approves in Campaign Studio → simulated run → results', options: { fontSize: 12, color: MUTED } },
  ], { x: sx + 0.25, y: ry, w: 5.45, h: 1.15, fontSize: 14, valign: 'middle' });
  arrow(s, sx + sw / 2, 4.37, sx + sw / 2, ry - 0.03, GREEN, true);
  txt(s, 'If the model stalls or fails: a labelled rule-based engine answers with the same tools and checks.', { x: tx, y: 3.75, w: 3.25, h: 0.6, fontSize: 11, italic: true, color: MUTED });
  card(s, M, 6.1, W - 2 * M, 0.6, { fill: BG });
  txt(s, [
    { text: 'Tech stack  ', options: { bold: true, color: ACCENT } },
    { text: 'TypeScript · React 19 · Vite · Tailwind CSS · Recharts  |  Qwen 3.6 35B on Ollama via a 2-route server proxy  |  Vitest · Playwright · axe-core', options: { color: TEXT } },
  ], { x: M + 0.3, y: 6.1, w: W - 2 * M - 0.6, h: 0.6, fontSize: 12.5, valign: 'middle' });
  s.addNotes(
    'SCRIPT (45s): "Under the hood: an orchestrator plans the investigation and runs only the specialists it needs, in parallel. Specialists cannot compute numbers themselves — they call allowlisted, tested business tools, and every result carries its unit, the customers it describes, its time window and its provenance. Before anything reaches the merchant, an independent Risk Reviewer — pure rules, no model, no tools — checks every claim. The Action Planner can only propose; the merchant creates and approves the campaign."\n\n' +
      'TECH DETAIL (if asked): custom TypeScript orchestrator; local Qwen 3.6 35B via Ollama behind a two-route server endpoint (status + chat, model fixed server-side); budgets: 2 rounds, 14 tool calls, 12 model calls, 120 s; per-agent fallback to rules.\n\nTRANSITION: "So what makes this different?"',
  );
}

pres.addSection({ title: 'USP' });
// ── USP ────────────────────────────────────────────────────────────────────
{
  const s = content('Our USP: the whole loop, evidence-checked and merchant-controlled', 'USP');
  const items = [
    ['scale', 'Prices every option', 'Break-even and a half-as-good downside for each offer — and doing nothing — before anyone acts.'],
    ['flask', 'Measures against a holdout', 'Results are read against held-back customers, and the app says when the sample is too small to tell.'],
    ['shield', 'Checks what AI claims mean', 'Right customers, right window, right direction, estimate vs fact vs simulated, no causes stated as proof.'],
    ['lock', 'Approval binds the offer', 'Agents can only propose. The merchant approves the exact terms; nothing changes after approval.'],
    ['cpu', 'Local-first and resilient', 'Runs on a local open model on our own hardware, with an instant, labelled rule-based fallback.'],
  ];
  items.forEach(([ic, head, sub], i) => {
    const y = 1.45 + i * 0.86;
    card(s, M, y, 7.6, 0.74, { fill: i % 2 ? SURF : SURF2 });
    icon(s, ic, M + 0.15, y + 0.07, 0.36);
    txt(s, head, { x: M + 0.95, y: y + 0.08, w: 2.6, h: 0.6, fontSize: 15, bold: true, valign: 'middle' });
    txt(s, sub, { x: M + 3.55, y: y + 0.08, w: 3.9, h: 0.6, fontSize: 11.5, color: MUTED, valign: 'middle' });
  });
  card(s, M + 8.0, 1.45, W - 2 * M - 8.0, 4.18, { fill: SURF2, line: ACCENT, lineW: 1.5 });
  txt(s, 'Why the combination matters', { x: M + 8.3, y: 1.7, w: 3.6, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true });
  txt(s, [
    { text: 'Each piece exists somewhere. Together they let a merchant act on AI advice without trusting it blindly.', options: {} },
  ], { x: M + 8.3, y: 2.2, w: 3.55, h: 1.0, fontSize: 13, color: MUTED });
  [['What should I do?', 'options priced, incl. doing nothing'], ['What will it cost?', 'break-even and downside'], ['Did it work?', 'read against a holdout']].forEach(([q, a], i) => {
    const y = 3.35 + i * 0.72;
    txt(s, q, { x: M + 8.3, y, w: 3.55, h: 0.3, fontFace: HEAD, fontSize: 15, bold: true, italic: true });
    txt(s, '→ ' + a, { x: M + 8.3, y: y + 0.32, w: 3.55, h: 0.3, fontSize: 12.5, color: GREEN });
  });
  txt(s, 'All five are implemented and tested in the prototype (see appendix).', { x: M, y: 5.95, w: 10, h: 0.3, fontSize: 12, italic: true, color: MUTED });
  s.addNotes(
    'SCRIPT (35s): "What makes DukaanPulse different is not any single feature — it is that the whole loop is checkable. It prices every option before you act, measures against customers who were held back, checks what the AI claims actually mean, binds approval to the exact offer, and runs on a local model with an instant rule-based fallback."\n\n' +
      'QUALIFY: Do NOT say "unique" or "the only one". If asked about other teams: "Approval gates, evidence lists and rules fallbacks exist in other projects; we have not seen all five combined with holdout measurement and claim-level semantic checks in the public projects we looked at — but we have not seen every team\'s work."\n\nTRANSITION: "Let me make the trust part concrete."',
  );
}

// ── 8. Trust by construction ───────────────────────────────────────────────
{
  const s = content('Trust by design: no invented numbers, segments or actions', 'USP');
  const pillars = [
    ['hash', 'Numbers only from tools', 'Agents write {{references}}; the app fills in figures from tested calculations. Typed digits are rejected.'],
    ['shield', 'Claims checked for meaning', 'Right customers, right time window, right direction, estimate vs fact vs simulated, no causes stated as proof.'],
    ['lock', 'Merchant in control', 'Agents can only propose. Approval binds the exact offer; nothing is ever sent or paid in this prototype.'],
  ];
  pillars.forEach(([ic, head, sub], i) => {
    const x = M + i * 4.1;
    card(s, x, 1.45, 3.85, 2.5);
    icon(s, ic, x + 0.3, 1.65);
    txt(s, head, { x: x + 1.15, y: 1.8, w: 2.55, h: 0.4, fontSize: 17, bold: true });
    txt(s, sub, { x: x + 0.3, y: 2.55, w: 3.3, h: 1.3, fontSize: 13, color: MUTED });
  });
  // Real caught example
  card(s, M, 4.25, W - 2 * M, 2.4, { fill: SURF2 });
  txt(s, 'A real failure the reviewer now catches (regression-tested)', { x: M + 0.35, y: 4.4, w: 9, h: 0.35, fontSize: 14, bold: true, color: AMBER });
  txt(s, [
    { text: '✗  ', options: { color: RED, bold: true } },
    { text: 'Model wrote: “Among 209 regular ', options: { color: MUTED } },
    { text: 'morning', options: { color: RED, bold: true } },
    { text: ' customers, 34 showed an unusually long absence.”', options: { color: MUTED } },
  ], { x: M + 0.35, y: 4.9, w: W - 2 * M - 0.7, h: 0.4, fontSize: 15 });
  txt(s, 'The 209 is correct — but it counts all regulars, not morning ones. Rejected: segment mismatch (S1).', { x: M + 0.75, y: 5.32, w: W - 2 * M - 1.1, h: 0.35, fontSize: 12.5, color: MUTED, italic: true });
  txt(s, [
    { text: '✓  ', options: { color: GREEN, bold: true } },
    { text: 'Shown instead: “34 of 209 regular customers have been away much longer than usual.”', options: { color: TEXT } },
  ], { x: M + 0.35, y: 5.85, w: W - 2 * M - 0.7, h: 0.4, fontSize: 15 });
  s.addNotes(
    'SCRIPT (40s): "Three design rules. One: numbers only come from tools — agents insert references and the app fills in the figures. Two: claims are checked for meaning, not just for numbers. Here is a real example from our local model: it wrote 209 regular morning customers. The 209 is a real number — but it counts all regulars, not morning ones. Our reviewer catches that kind of mistake and removes it. Three: the merchant stays in control — agents cannot approve, send or pay."\n\n' +
      'QUALIFY: The semantic checks are deterministic word-level rules over typed evidence — they catch qualifiers next to numbers, windows, direction, evidence type and causation, not every possible misreading. Do not call them perfect.\n\nTRANSITION: "And we test all of this like software that handles money."',
  );
}

// ── 10. Evidence of quality ────────────────────────────────────────────────
{
  const s = content('How we know it works — and what that doesn’t prove', 'USP');
  const stats = [
    ['414', 'unit tests', 'domain, state machine, agents, reviewer'],
    ['73', 'browser tests', 'full workflow, 3 consecutive runs'],
    ['12 / 12', 'live-model cases', 'local Qwen; every claim shown grounded'],
    ['12 / 12', 'bad claims rejected', 'planted claims, model and rules paths'],
  ];
  stats.forEach(([big, label, sub], i) => {
    const x = M + i * 3.07;
    card(s, x, 1.45, 2.85, 2.2);
    txt(s, big, { x: x + 0.25, y: 1.6, w: 2.4, h: 0.85, fontFace: HEAD, fontSize: 40, bold: true, color: i < 2 ? TEXT : ACCENT });
    txt(s, label, { x: x + 0.25, y: 2.5, w: 2.4, h: 0.35, fontSize: 15, bold: true });
    txt(s, sub, { x: x + 0.25, y: 2.9, w: 2.4, h: 0.6, fontSize: 12, color: MUTED });
  });
  const tests = ['Wrong customer segment', 'Wrong time window', 'Correlation as proof', 'Simulated called real', 'Invented or missing references', 'Contradicting a tool', 'Missing cost assumptions', 'Unanswerable question', 'Conflicting recommendation', 'Attempted approve / send'];
  txt(s, 'Adversarial cases tested', { x: M, y: 3.95, w: 6, h: 0.35, fontSize: 14, bold: true, color: MUTED });
  tests.forEach((t, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const x = M + col * 2.45, y = 4.35 + row * 0.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.3, h: 0.38, rectRadius: 0.19, fill: { color: SURF }, line: { color: BORDER, width: 1 } });
    txt(s, t, { x, y: y + 0.07, w: 2.3, h: 0.26, fontSize: 11, align: 'center', color: TEXT });
  });
  card(s, M, 5.55, W - 2 * M, 1.1, { fill: BG, line: AMBER });
  txt(s, [
    { text: 'What this proves: ', options: { bold: true, color: AMBER } },
    { text: 'answers are grounded, scoped and honestly labelled on tested synthetic cases, and agents cannot act.  ', options: { color: TEXT } },
    { text: 'What it does not: ', options: { bold: true, color: AMBER } },
    { text: 'that any recommendation increases real merchant revenue. That needs a real, adequately sized randomized test.', options: { color: TEXT } },
  ], { x: M + 0.3, y: 5.62, w: W - 2 * M - 0.6, h: 0.95, fontSize: 14, valign: 'middle' });
  s.addNotes(
    'SCRIPT (35s): "We test this like software that handles money: 414 unit tests, 73 browser tests run three times in a row, and a live evaluation where our local model passed 12 of 12 cases with every displayed claim traced to evidence. We also attack it — ten kinds of misleading claims, from wrong customer segments to fake approvals — and all of them are rejected. What this does NOT prove is that the recommendations make real merchants more money. That is the next milestone."\n\n' +
      'QUALIFY: Counts were re-verified on the current commit before the pitch (see Pitch_Sources_and_Claims.md). The 12/12 live result is on synthetic scenarios.\n\nTRANSITION: "So what is the impact?"',
  );
}

pres.addSection({ title: 'Impact & Benefits' });
// ── Impact & benefits ──────────────────────────────────────────────────────
{
  const s = content('Impact & benefits: better decisions now, revenue proof next', 'Impact & Benefits');
  const cols = [
    ['store', 'For the merchant', [
      ['Avoids blind storewide discounts: ₹30 off for all needs +27% orders to break even', 'shown'],
      ['One clear decision in plain words: who, what it costs, the risk and the alternatives', 'shown'],
      ['Knows whether it worked — or that the test was too small to tell', 'shown'],
    ]],
    ['user', 'For their customers', [
      ['Fewer, more relevant offers: 27 lapsed regulars contacted, not every customer', 'shown'],
      ['Messages must state the offer’s real terms', 'shown'],
    ]],
    ['zap', 'For the platform', [
      ['Merchant-facing AI that does not invent figures (on tested cases)', 'shown'],
      ['A weekly reason for merchants to come back to the app', 'expected'],
      ['Holdout results across merchants show which offers really work', 'expected'],
    ]],
  ];
  cols.forEach(([ic, head, items], i) => {
    const x = M + i * 4.1;
    card(s, x, 1.45, 3.85, 4.35);
    icon(s, ic, x + 0.3, 1.65);
    txt(s, head, { x: x + 1.15, y: 1.8, w: 2.6, h: 0.4, fontSize: 17, bold: true });
    items.forEach(([t, k], j) => {
      const y = 2.6 + j * 1.02;
      tag(s, k === 'shown' ? 'Shown in prototype' : 'Expected — to test', k === 'shown' ? GREEN : AMBER, x + 0.3, y, k === 'shown' ? 1.85 : 1.75);
      txt(s, t, { x: x + 0.3, y: y + 0.36, w: 3.3, h: 0.62, fontSize: 12, color: TEXT });
    });
  });
  card(s, M, 6.0, W - 2 * M, 0.62, { fill: BG, line: AMBER });
  txt(s, [
    { text: 'Not yet shown: ', options: { bold: true, color: AMBER } },
    { text: 'revenue impact for real merchants. “Shown” means demonstrated on synthetic data; proving real impact is the pilot’s job.', options: { color: TEXT } },
  ], { x: M + 0.3, y: 6.0, w: W - 2 * M - 0.6, h: 0.62, fontSize: 13, valign: 'middle' });
  s.addNotes(
    'SCRIPT (35s): "The impact we can show today: the merchant avoids a blind storewide discount — ₹30 off for everyone would need 27 percent more orders just to break even — and gets one clear decision with its cost, risk and alternatives. Customers get fewer, more relevant offers: 27 lapsed regulars instead of everyone. For the platform, we expect a weekly reason for merchants to return and a growing record of which offers actually work. What we have not shown yet is revenue impact for real merchants — that is exactly what the pilot is for."\n\n' +
      'QUALIFY: +27% is an estimate (assumes 55% margin and that every existing order redeems). "Shown" = demonstrated on synthetic data. No revenue, retention or conversion figures for real merchants are claimed.\n\nTRANSITION: "How would this become a business?"',
  );
}

pres.addSection({ title: 'Business Model' });
// ── 11. Adoption and business model (proposed) ─────────────────────────────
{
  const s = content('Business model (proposed): a decision layer in the payment app', 'Business Model');
  tag(s, 'Proposed — not validated', AMBER, M, 1.35, 2.6);
  const blocks = [
    ['store', 'First merchants', 'Repeat-visit businesses already taking digital payments — bakeries, cafés, kiranas — where regulars drive revenue (91% of revenue from returning customers in our synthetic shop).'],
    ['refresh', 'Distribution', 'Surfaced where merchants already check payments: a weekly “one decision worth making” with evidence, not another dashboard.'],
    ['zap', 'How it could earn — options to test', 'Free weekly insight to drive engagement; a paid campaign-and-measurement tier; or a fee linked to measured incremental profit. No pricing validated yet.'],
    ['cpu', 'Cost to serve', 'Deterministic tools do the maths; a compact local model or a hosted model writes the narrative — and a rules-only mode costs nothing to run.'],
  ];
  blocks.forEach(([ic, head, sub], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * 6.15, y = 1.9 + row * 1.98;
    card(s, x, y, 5.9, 1.8);
    icon(s, ic, x + 0.3, y + 0.3);
    txt(s, head, { x: x + 1.2, y: y + 0.32, w: 4.5, h: 0.4, fontSize: 17, bold: true });
    txt(s, sub, { x: x + 1.2, y: y + 0.78, w: 4.5, h: 1.1, fontSize: 12.5, color: MUTED });
  });
  card(s, M, 6.0, W - 2 * M, 0.62, { fill: BG, line: AMBER });
  txt(s, [
    { text: 'Assumption the pilot must test: ', options: { bold: true, color: AMBER } },
    { text: 'merchants act on a weekly decision, and the campaigns they approve pay back when measured against a holdout.', options: { color: TEXT } },
  ], { x: M + 0.3, y: 6.0, w: W - 2 * M - 0.6, h: 0.62, fontSize: 13, valign: 'middle' });
  s.addNotes(
    'SCRIPT (35s): "Where would this live? Our hypothesis: inside the payment app merchants already use, as a weekly decision — one thing worth doing, with the evidence. We would start with repeat-visit businesses like bakeries and cafés, where regulars drive revenue. How it could earn — and these are options to test, not validated pricing: a free weekly insight that drives engagement, a paid campaign-and-measurement tier, or a fee linked to measured incremental profit. And it is cheap to run, because tested code does the maths and the model only writes the narrative."\n\n' +
      'QUALIFY: Everything on this slide is a HYPOTHESIS. No market size, pricing, partnership or revenue figure is claimed. The 91% figure is from synthetic data.\n\nTRANSITION: "Which brings me to what we would do next."',
  );
}

pres.addSection({ title: 'Roadmap & Ask' });
// ── 12. Roadmap and ask ────────────────────────────────────────────────────
{
  const s = content('Next: prove it with real merchants, measured properly', 'Roadmap & Ask');
  const steps = [
    ['1', 'Pilot data', 'Consented payment data from a small set of repeat-visit merchants; detector and tools re-run unchanged.', '0–1 month'],
    ['2', 'Real holdout tests', 'Randomized offer vs holdout, sized for power (≈62+ per group per test); merchant approves every campaign.', '1–3 months'],
    ['3', 'Measure what matters', 'Incremental return rate and margin per merchant — reported with uncertainty, including no-effect results.', '3–4 months'],
    ['4', 'Scale what works', 'Keep the offers that pay back; add opportunity types beyond lapsed regulars.', 'after evidence'],
  ];
  steps.forEach(([n, head, sub, when], i) => {
    const y = 1.5 + i * 1.12;
    s.addShape(pres.shapes.OVAL, { x: M, y: y + 0.08, w: 0.6, h: 0.6, fill: { color: i === 1 ? ACCENT : SURF2 }, line: { color: ACCENT, width: 1.5 } });
    txt(s, n, { x: M, y: y + 0.08, w: 0.6, h: 0.6, fontFace: HEAD, fontSize: 20, bold: true, align: 'center', valign: 'middle', color: i === 1 ? BG : TEXT });
    if (i < 3) s.addShape(pres.shapes.LINE, { x: M + 0.3, y: y + 0.7, w: 0, h: 0.5, line: { color: BORDER, width: 1.5 } });
    txt(s, head, { x: M + 0.85, y: y + 0.05, w: 4.2, h: 0.35, fontSize: 16, bold: true });
    txt(s, sub, { x: M + 0.85, y: y + 0.42, w: 6.4, h: 0.6, fontSize: 12.5, color: MUTED });
    txt(s, when, { x: M + 7.35, y: y + 0.08, w: 1.2, h: 0.3, fontSize: 11, color: MUTED, align: 'right' });
  });
  card(s, M + 8.85, 1.5, 3.3, 4.35, { fill: SURF2, line: ACCENT, lineW: 1.5 });
  txt(s, 'Our ask', { x: M + 9.15, y: 1.75, w: 2.8, h: 0.45, fontFace: HEAD, fontSize: 22, bold: true });
  txt(s, [
    { text: 'A pilot with a handful of merchants', options: { bullet: { indent: 14 }, breakLine: true } },
    { text: 'Guidance on consented data access', options: { bullet: { indent: 14 }, breakLine: true } },
    { text: 'Mentors to shape the experiment design', options: { bullet: { indent: 14 } } },
  ], { x: M + 9.15, y: 2.4, w: 2.85, h: 2.6, fontSize: 15, paraSpaceAfter: 14 });
  txt(s, 'Timelines are our plan, not commitments from anyone else.', { x: M, y: 6.1, w: 8.5, h: 0.3, fontSize: 11.5, italic: true, color: MUTED });
  s.addNotes(
    'SCRIPT (35s): "Our next milestone is not more features — it is evidence. With consented data from a few repeat-visit merchants, our tools run unchanged. We would run real randomized offers with holdouts, sized properly — about 62 customers per group or more — with the merchant approving every campaign. Then we measure incremental return and margin, and we report no-effect results too. Our ask: a small pilot, guidance on consented data access, and mentors on experiment design."\n\n' +
      'QUALIFY: Timelines are the team\'s plan. 62 per group is for the assumed 10%→30% lift at 80% power; smaller real effects need more.\n\nTRANSITION: "To close."',
  );
}

pres.addSection({ title: 'Close' });
// ── 13. Close ──────────────────────────────────────────────────────────────
{
  const s = pres.addSlide({ masterName: 'DP_TITLE', sectionTitle: 'Close' });
  txt(s, 'Evidence, not guesses.', { x: M + 0.4, y: 2.1, w: 12, h: 1.0, fontFace: HEAD, fontSize: 50, bold: true });
  txt(s, 'Decisions, not dashboards.', { x: M + 0.4, y: 3.1, w: 12, h: 1.0, fontFace: HEAD, fontSize: 50, bold: true, color: ACCENT, italic: true });
  txt(s, 'And the merchant always has the final say.', { x: M + 0.4, y: 4.3, w: 11, h: 0.6, fontSize: 24, color: TEXT });
  card(s, M + 0.4, 5.35, 7.6, 1.15, { fill: SURF });
  icon(s, 'store', M + 0.65, 5.55);
  txt(s, [
    { text: 'DukaanPulse AI', options: { bold: true, breakLine: true } },
    { text: 'Working prototype · synthetic data · local model + rules fallback · not affiliated with Paytm', options: { fontSize: 12, color: MUTED } },
  ], { x: M + 1.55, y: 5.45, w: 6.3, h: 0.95, fontSize: 18, valign: 'middle' });
  card(s, M + 8.3, 5.35, 3.83, 1.15, { fill: SURF2, line: ACCENT });
  txt(s, [
    { text: 'Live demo', options: { bold: true, color: ACCENT, fontSize: 11, breakLine: true } },
    { text: 'dukaanpulse-ai.vercel.app', options: { color: TEXT, hyperlink: { url: 'https://dukaanpulse-ai.vercel.app' }, breakLine: true } },
    { text: 'Code', options: { bold: true, color: ACCENT, fontSize: 11, breakLine: true } },
    { text: 'github.com/Thebinary110/dukaanpulse-ai', options: { color: TEXT, hyperlink: { url: 'https://github.com/Thebinary110/dukaanpulse-ai' } } },
  ], { x: M + 8.5, y: 5.42, w: 3.5, h: 1.0, fontSize: 12.5, valign: 'middle' });
  s.addNotes(
    'SCRIPT (15s): "DukaanPulse turns payment signals into decisions a merchant can trust: every number from tested calculations, every claim checked, every action approved by the merchant. Evidence, not guesses. Decisions, not dashboards. Thank you — we would love to show you anything in more depth."\n\nTRANSITION: Open for questions; keep the app on the Ask page with the rules-only tab ready.\n\nLINKS: The live demo (dukaanpulse-ai.vercel.app) runs Ask DukaanPulse in rule-based mode only; the local-model mode runs on our machine.',
  );
}

pres.addSection({ title: 'Appendix' });
// ── Appendix: sources and assumptions ──────────────────────────────────────
{
  const s = content('Appendix: where the numbers come from', 'Appendix');
  const rows = [
    ['Revenue −13.0%, morning −21.6%, 34 of 209 regulars', 'Observed', 'Seeded synthetic data (180 days, seed 20261020); comparePeriods, revenueByDaypart, lapse detector'],
    ['₹92,700 · +27% (≈837 orders)', 'Estimate', '3,090 orders × ₹30 if all redeem; break-even at ₹256 × 55% − ₹30 per extra order'],
    ['+₹1,133 · ₹213 · 11% · +₹529', 'Estimate', 'campaignEconomics for 27 customers, 14 days; baseline 10%, uplift +20 pts, 85% redemption, 55% margin'],
    ['4 of 27 vs 0 of 7 · +₹863', 'Simulated', 'Rehearsed in-app run (seeded by approved configuration); not real customers'],
    ['~13% power · 62 per group', 'Estimate', 'Two-proportion normal approximation, 10% → 30%, α = 0.05, 80% power'],
    ['414 · 73 · 12/12 · 12/12', 'Test result', 'Re-run on the current commit; live cases are synthetic scenarios'],
  ];
  const kind = { Observed: ACCENT, Estimate: MUTED, Simulated: SIM, 'Test result': GREEN };
  s.addTable(
    [
      [
        { text: 'Claim', options: { bold: true, color: MUTED } },
        { text: 'Type', options: { bold: true, color: MUTED } },
        { text: 'Source / method', options: { bold: true, color: MUTED } },
      ],
      ...rows.map(([c, k, src]) => [
        { text: c, options: { color: TEXT } },
        { text: k, options: { color: kind[k], bold: true } },
        { text: src, options: { color: MUTED } },
      ]),
    ],
    { x: M, y: 1.45, w: W - 2 * M, colW: [3.9, 1.3, 6.93], fontFace: BODY, fontSize: 12, fill: { color: SURF }, border: { type: 'solid', color: BORDER, pt: 0.75 }, rowH: 0.62, valign: 'middle', margin: [0.06, 0.12, 0.06, 0.12] },
  );
  txt(s, 'Full claim-by-claim mapping: Pitch_Sources_and_Claims.md', { x: M, y: 6.25, w: 8, h: 0.3, fontSize: 11.5, italic: true, color: MUTED });
  s.addNotes('Backup slide for judges who ask where a figure comes from. Every row maps to code or a rehearsed run in Pitch_Sources_and_Claims.md.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  if (applyTheme) await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
