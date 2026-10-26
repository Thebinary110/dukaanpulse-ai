# DukaanPulse AI — Pitch sources and claims

Every claim that appears in `DukaanPulse_AI_Pitch.pptx` (slides or speaker notes), what kind of claim it is, and where it comes from. All app figures were recomputed with the repository's own domain functions at commit **20369e7** (identical tree to the 308f294 the brief refers to; only commit metadata was rewritten).

**Claim types**
- **Observed**: counted directly from the app's seeded synthetic payment data.
- **Estimate**: output of a deterministic model from stated, editable assumptions.
- **Simulated**: output of the in-app simulator. No real customer was involved.
- **Test result**: produced by running the test suites at this commit.
- **Hypothesis**: the team's belief, not yet validated.
- **Official**: from the hackathon's published material (see `Pitch_Review.md` § Official constraints).

---

## 1. Merchant situation (slides 2, 4, 6, 14)

All figures describe the fictional **Sunrise Bakery**: 180 days of seeded synthetic data (seed 20261020), 900 customers plus walk-ins. "As of" is 19 Oct; the last 30 days are 20 Sep–19 Oct and the prior 30 days are 21 Aug–19 Sep.

| Claim on slide | Type | Exact value | Source |
|---|---|---|---|
| Revenue −13.0% | Observed | ₹7,90,935 vs ₹9,09,260 (−₹1,18,325, −13.01%) | `src/domain/overview.ts` → `comparePeriods` over `generateDataset()` |
| ₹7.91L vs ₹9.09L | Observed | as above, rounded to lakh | same |
| Orders 3,090 (used for blanket maths) | Observed | 3,090 vs 3,577 (−13.6%) | same |
| Average bill ₹256 | Observed | ₹255.97 (+0.7%) | same |
| Morning revenue −21.6% | Observed | ₹2,69,910 last 30 days; −21.6% vs prior | `revenueDrivers` / daypart breakdown in `overview.ts` |
| 34 of 209 regulars away far longer than usual | Observed (flag from a statistical rule) | 34 flagged of 209 regulars | `src/domain/metrics.ts` lapse detector: P(gap) = (1−p)^(gap−1) < 0.01, min gap 14 days |
| Median 30 days vs 2.4 usual | Observed | median current gap 29.5 days; median usual gap 2.4 days | same detector output |
| 91% of revenue from returning customers (slide 11) | Observed | 601 returning, 273 new customers; returning customers bring 91% of revenue | `overview.ts` customer mix |
| 85% of flagged regulars' visits were in the morning (notes only) | Observed | 85% | detector output |

**Detector honesty (not on the slides; answer if asked).** On the planted signal in the demo seed, the detector finds 30 of the 40 planted lapsed regulars (75% recall) and flags 4 regulars that were not planted (2.4% of regulars). By chance alone we would expect about 2.1 false flags (Estimate).

## 2. Blanket discount vs targeted offer (slide 6, appendix)

| Claim | Type | Derivation |
|---|---|---|
| ₹92,700 given away a month | Estimate (upper bound) | 3,090 orders in the last 30 days × ₹30, **assuming every existing order redeems**. Source: `src/domain/financials.ts` → `blanketDiscountEconomics`. |
| +27% orders needed to break even (≈837 extra orders) | Estimate | Margin per extra order = ₹255.97 × 55% − ₹30 = ₹110.78. Then ₹92,700 ÷ ₹110.78 = 836.8 orders, which is 27.1% of 3,090. The 55% margin is an **assumption**. |
| Targeted: ₹30 off ₹200+, 27 regulars (7 held back) | Estimate (configuration) | Recommended action from `src/agents/recommendation.ts` and `src/domain/decision.ts`: 34 flagged regulars split into 27 treatment and 7 holdout. |
| +₹1,133 expected net extra profit | Estimate | `campaignEconomics`. Inputs: baseline 10% return, uplift +20 pts (30% assumed), redemption 85%, margin 55%, 1 follow-on full-price visit, ₹0.25 per message, average bill ₹227, 14-day window. |
| ₹213 expected cost | Estimate | same (offer cost plus message cost) |
| Break-even 11% return vs 30% assumed | Estimate | same (break-even return rate) |
| +₹529 if it works half as well | Estimate | same, with uplift halved (+10 pts) |
| Alternatives: free add-on +₹859, loyalty bonus +₹447, do nothing ₹0 | Estimate | `decision.ts` option comparison |
| Scope footnote | — | The blanket figure covers all orders over 30 days. The targeted figures cover 27 customers over 14 days. **They are not directly comparable.** The slide states this explicitly. |

## 3. Measurement (slides 9, 12, appendix)

| Claim | Type | Source |
|---|---|---|
| 4 of 27 returned vs 0 of 7; net +₹863 vs +₹1,133 estimate; "Repeat with a larger test" | Simulated | Rehearsed in-app run, seeded by the approved configuration. Shown in `docs/screenshots/results.png` (an unmodified app screenshot). The screen also shows "86% of 500 runs profitable". |
| ~13% power with 27 vs 7 | Estimate | `src/domain/stats.ts` two-proportion power, 10% → 30%, α = 0.05 |
| ~62 per group needed | Estimate | `stats.ts` sample size for 80% power, same effect. Smaller real effects need more customers. |
| Approval binds the exact offer; edits after approval blocked | Product behaviour | `src/state/scenario.ts` approval fingerprint; e2e tests |
| Message must state the offer's real terms | Product behaviour | `src/domain/message.ts` checks; Campaign Studio checklist |
| Nothing is sent or paid | Product behaviour | No messaging or payment integration exists. The server exposes only `/api/llm/status` and `/api/llm/chat` (`server/llmProxy.ts`). |

**Deliberately not used:** the fixture figures "9 of 27" and "+₹2,376" from the test fixtures. They are not what the app shows in the rehearsed run.

## 4. Technology and trust (slides 5, 7, 8)

| Claim | Type | Source |
|---|---|---|
| Orchestrator plus 5 specialists (Business Analyst, Customer Intelligence, Growth Strategist, Experiment Scientist, Action Planner) and a rule-based Risk Reviewer | Product behaviour | `src/agents/definitions.ts`, `orchestrator.ts`, `review.ts` |
| Specialists run in parallel | Product behaviour | `orchestrator.ts` (visible in the timeline in `ask-recommendation.png`) |
| 11 read-only allowlisted tools; each agent may call only its own | Product behaviour | `src/agents/tools/registry.ts`, `definitions.ts` |
| Results carry unit, population, period, provenance | Product behaviour | `src/agents/types.ts` (`ToolResult`, `MetricValue`) |
| Numbers only via `{{references}}`; typed digits rejected | Product behaviour | `review.ts` / `semantics.ts` |
| Semantic checks (segment, window, direction, estimate wording, simulation, recommendation, cost assumptions, action claims) | Product behaviour | `src/agents/semantics.ts` S1–S8, R10 |
| Example: "Among 209 regular **morning** customers…" rejected as a segment mismatch (S1) | Real model output, regression-tested | Observed from the local model during Stage 7. A regression test is in the agents test suite. |
| Risk Reviewer: rule-based, no model, no tools | Product behaviour | `review.ts` |
| Budgets: 2 rounds, 14 tool calls, 12 model calls, 120 s (notes only) | Product behaviour | `orchestrator.ts` constants |
| Local Qwen (qwen3.6:35b) via Ollama; model fixed server-side | Product behaviour | `server/llmProxy.ts` |
| Rule-based fallback answers with the same tools and checks, labelled | Product behaviour | `src/agents/deterministic.ts`; `/ask?engine=rules` |
| "Independent reviewer removed unsupported claims from this answer" (slide 5) | Real screen | `ask-recommendation.png` shows the reviewer line under "Limitations and review" |
| ~25 s average per question (latest run: avg 24.8 s, max 44.3 s) | Test result | `npm run eval:agents` at 20369e7, live model, 12 cases |

## 5. Quality evidence (slide 10, appendix)

All results were re-run at 20369e7 in a clean worktree on 26 Oct 2026.

| Claim | Type | Result |
|---|---|---|
| 414 unit tests | Test result | `vitest run`: 414 passed, 1 skipped (the live eval, run separately) |
| 73 browser tests, 3 consecutive runs | Test result | `playwright test` ×3: 73 passed each time |
| Typecheck and production build | Test result | `tsc -b` OK; `vite build` OK |
| 12 / 12 live-model cases | Test result | `npm run eval:agents`: 12/12; 72 claims shown, 72 grounded; 19 unsupported claims removed by the reviewer |
| 12 / 12 planted bad claims rejected (9 / 9 good claims kept) | Test result | `src/agents/adversarial.ts` suite, model and rules paths |
| "What this does not prove" | Required qualifier | The 12/12 result shows success on tested **synthetic** cases. It does not establish that recommendations increase real merchant revenue. |

## 6. Business and roadmap (slides 11, 12)

| Claim | Type | Note |
|---|---|---|
| First merchants: repeat-visit businesses already taking digital payments | Hypothesis | Labelled "Proposed — not validated" on the slide |
| Distribution inside the payment app as a weekly decision | Hypothesis | No partnership or integration is claimed |
| Value hypotheses (engagement, targeted vs storewide offers, measurable campaigns) | Hypothesis | No revenue, retention or conversion figures are claimed |
| Cost to serve: deterministic maths; model writes the narrative; the rules mode costs nothing to run | Product behaviour plus hypothesis | The rules mode makes no model calls. No hosting-cost figure is claimed. |
| Roadmap timelines (0–1, 1–3, 3–4 months) | Team plan | Labelled "our plan, not commitments from anyone else" |
| Ask: pilot, guidance on consented data access, mentors | Request | Not a claim |

## 7. Excluded claims (and why)

| Excluded | Reason |
|---|---|
| Any market size, TAM, or number of Indian merchants | No verified source in hand. The brief forbids manufactured market numbers. |
| Any revenue lift, conversion improvement, or ROI for real merchants | No real-merchant data. The 12/12 eval is not revenue proof. |
| "Saves ₹92,700" | The ₹92,700 figure is an upper-bound subsidy under a 100%-redemption assumption, not a saving. |
| Fixture simulation numbers (9/27, +₹2,376) | Not what the app shows in the rehearsed run. |
| Testimonials, merchant quotes, partnerships, Paytm data access or integration | None exist. A disclaimer appears on every slide footer. |
| Named competitor products or repos | The six competitor repos were used only as research leads (see `Pitch_Review.md`). Naming them is not strategically necessary. |
| "Revolutionary", "game-changing", "fully autonomous", "guaranteed growth" | Banned by the brief and untrue |
| Detector precision as a headline | 75% recall on planted signals is honest but needs context; it is kept for Q&A only. |
