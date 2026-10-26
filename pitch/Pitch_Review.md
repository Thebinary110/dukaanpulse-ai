# DukaanPulse AI: pitch review

Written as a skeptical judge, with the research behind the deck's choices.

## 1. Official constraints (verified 26 Oct 2026)

**Source:** the devSemble listing "Paytm Build for India AI Hackathon – Bengaluru". It is hosted by Paytm Community and says it was "Organized by Paytm in collaboration with devSemble". The listing data was read from its public API.

| Item | Official value | Status |
|---|---|---|
| Deliverable | A single stage, "Submit your Pitch": upload a PPT through a form | **Official** |
| Required PPT content | Title Slide · Problem Statement · Proposed Solution · Technology/Tech Stack Used · USP · Impact & Benefits · Business Model | **Official** (quoted) |
| Pitch stage deadline | 2026-10-26 18:30 UTC = **27 Oct 00:00 IST (midnight tonight)** | **Official** |
| Event date | Stored as 2026-10-30T18:30Z, which is 00:00 IST on 31 Oct; may be displayed as 30 Oct | Official but **ambiguous**; confirm while logged in |
| Venue | Paytm, The Hub, Bellandur, Bengaluru (offline) | **Official** |
| Team size | 3 | **Official** |
| Track 1 | "Merchant Growth AI — Build the AI business partner for every Paytm merchant … a trusted business copilot" | **Official** (quoted) |
| Sponsors | Paytm (hiring opportunity for top performers); Sarvam AI (credits) | **Official** |
| Judging rubric / weights | — | **Not published** |
| Slide limit | — | **Not published** |
| Pitch / demo duration | — | **Not published** |
| Repo / video required | — | **Not published** |
| Rules on synthetic data or Paytm branding | — | **Not published** |

**Recommendations (not rules):**
- An earlier Paytm AI hackathon edition on Luma (21 March, a different event) ran a demo session after submissions. Prepare a 3-minute cut.
- Sarvam AI is the official AI partner. DukaanPulse does not use Sarvam, and the deck does not claim it does. Only mention Sarvam as a possible future option for Indic-language messages, and only if asked.
- No Paytm logo or branding appears in the deck. Every slide footer says the prototype is "not affiliated with Paytm".

## 2. Positioning

Three candidate statements:

1. **Decision copilot.** "DukaanPulse turns a merchant's payment signals into evidence-backed actions the merchant controls: what to do, for whom, at what cost, and whether it worked."
2. **Trust-first AI.** "The merchant AI that won't make things up: every number from tested code, every claim checked."
3. **Win-back.** "Win back the regulars you're quietly losing."

**Chosen: #1 as the spine, #2 as the "how", #3 as the running example.**
- #1 matches the track brief's wording ("trusted business copilot") and the required sections.
- #2 alone is a feature, not a product. Peers also say "LLM never computes numbers", so it cannot carry the USP by itself.
- #3 alone is too narrow for "Merchant Growth AI". It is better as the concrete story that makes #1 tangible.

## 3. Competitive position (research leads only; no teams named in the deck)

The research covered six public repos that describe themselves as Paytm AI hackathon projects. Four cite "Track 1: Merchant Growth AI", most likely from an **earlier edition**; their edition is unconfirmed.

Patterns those repos **already share**, so the deck does **not** claim them as unique:
- an approval gate or human-in-the-loop;
- evidence lists on recommendations;
- what-if simulation;
- an LLM with a rules fallback;
- multi-agent orchestration;
- "the LLM never computes numbers";
- synthetic data with a disclosure.

Claims the review supports, phrased as "in the public projects we reviewed":
- No break-even or downside economics.
- No holdout readout.
- No claim-level checks for segment, time window or causation.
- No local model.

One more search-only repo **claims** an 80/20 holdout (not verified). So the deck never says "only one with a holdout".

The USP slide is therefore framed as **the combination** of five things, each implemented and tested. It says explicitly: "Each piece exists somewhere."

## 4. Scorecard (skeptical judge, 1–10)

**First pass:** rendered v1 deck, before the official guidelines were known.
**Final:** after the fixes listed in the last column.

| Criterion | First pass | Final | What changed / why it is not higher |
|---|---|---|---|
| Covers the required PPT sections | 5 | **9** | v1 had no explicit USP, Impact & Benefits or Tech Stack slides. Added a USP slide, an Impact & Benefits slide, and a tech-stack strip; reframed slide 13 as Business Model; each slide is labelled with its section. |
| Problem clarity | 7 | **8** | Shorter titles; one concrete merchant and three observed numbers. The figures are synthetic, which caps credibility. |
| Solution clarity | 7 | **8** | The loop slide plus a real screen plus worked numbers. Fixed a title colliding with content and a broken stat card. |
| Technical depth and credibility | 7 | **8** | Architecture diagram fixed (overlapping boxes, a misleading arrow); stack strip added; budgets and the fallback in the notes. |
| USP defensibility | 5 | **8** | Was implicit and risked "unique" claims that peers disprove. Now a five-part combination, every part verifiable in code, with the honest "each piece exists somewhere" framing. |
| Impact & Benefits | 4 | **7** | Added a dedicated slide that separates "Shown in prototype" from "Expected — to test". **Why not 8+:** without real-merchant data, any higher score would need invented lift or ROI, which the brief forbids. The pilot is the fix. |
| Business model | 5 | **7** | Reframed with revenue options to test and the key assumption the pilot must test. **Why not 8+:** no validated pricing or market data. Adding numbers would mean manufacturing them. |
| Honesty / claim hygiene | 9 | **10** | Every figure is labelled (Observed / Estimate / Simulated / Test result); scope footnote on the blanket comparison; disclaimer on every slide; appendix plus `Pitch_Sources_and_Claims.md`. "Three guarantees" in the notes changed to "three design rules". |
| Visual design and readability | 6 | **8** | Installed metric-compatible fonts so the render matches PowerPoint widths, then fixed every overflow found: titles, stat cards, tags, diagram overlaps, the business-model overlap. The screenshots are small to read at full slide size, which is acceptable as evidence of a real UI. |
| Demo readiness | 7 | **8** | Live answers average 24.8 s and peak at 44.3 s; there is a rehearsed stop-and-switch to the rules mode and a screenshot fallback. Latency is the residual risk. |

**Two criteria remain below 8: Impact & Benefits, and Business Model.** Both are capped by the no-fabrication rule, not by deck quality. The mitigation is verbal: state plainly what is shown versus expected, and make the pilot ask concrete (slide 14).

## 5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing tonight's upload deadline | — | Upload now; `Presenter_Runbook.md` §0 |
| A judge reads ₹92,700 as "savings" | Medium | "Upper bound", scope footnote, script wording |
| The live model stalls on stage | Low–medium | Rules tab, Stop button, screenshot slide |
| "How is this different from team X?" | Medium | Combination framing; never "only" |
| "Is this real data?" | High | Say "synthetic" up front; planted-signal recall as a strength (30/40) |
| A short slot (≤3 min) | Unknown | A 3-minute cut is defined |
| Rubric weights favour business or market | Unknown | Business model slide plus an honest pilot ask; no invented TAM |

## 6. Assumptions that sit behind the deck

These are inputs to the model, editable in the app and shown on slide 6:
- 55% gross margin
- 10% baseline return
- +20 pt uplift
- 85% redemption
- 1 follow-on visit
- ₹0.25 per message

Blanket-discount maths assumes every existing order redeems.

**Verification snapshot:** the evaluation figures were measured at commit 20369e7 on 26 Oct 2026. Any later code change should be re-verified before quoting them.
