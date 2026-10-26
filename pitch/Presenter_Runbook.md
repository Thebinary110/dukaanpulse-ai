# DukaanPulse AI: Presenter runbook

Paytm Build for India AI Hackathon, Bengaluru, Track 1: Merchant Growth AI

## 0. Before anything else: submission (deadline tonight)

The official "Submit your Pitch" stage on devSemble closes at **2026-10-26 18:30 UTC, which is 27 Oct 00:00 IST (midnight tonight)**.

1. Upload `DukaanPulse_AI_Pitch.pptx` through the form on the devSemble event page while logged in.
   - Keep `DukaanPulse_AI_Pitch.pdf` ready in case the form prefers PDF.
   - The PDF was rendered with metric-compatible fonts.
2. The official guidelines require seven sections. Each slide carries a small blue label naming its section:

   | Required section | Slides |
   |---|---|
   | Title Slide | 1 |
   | Problem Statement | 2–3 |
   | Proposed Solution | 4–7 |
   | Technology / Tech Stack | 8 |
   | USP | 9–11 |
   | Impact & Benefits | 12 |
   | Business Model | 13 |
   | Roadmap & Ask (extra) | 14 |
   | Close (extra) | 15 |
   | Appendix (extra) | 16 |

3. While logged in, check two things on the event page:
   - **Whether the event day is 30 or 31 Oct.** The API stores 2026-10-30T18:30Z, which is 00:00 IST on 31 Oct, so the day is ambiguous.
   - **Whether a GitHub, demo-video or other link is requested.** None was found in the public data.
4. Team size on the listing is 3. Check that the team registration matches.

**Not published anywhere we could find:** judging criteria, slide limit, pitch duration, final-round format.

The deck is therefore built as a complete, self-explanatory submission that can be cut down to any time slot (§2). An earlier Paytm AI hackathon edition on Luma ran a one-hour submission window, then two hours of "Demo Presentations and Award Ceremony". That suggests a short demo-style pitch, but **this is a hint, not a rule**.

## 1. Setup on the day (about 15 minutes before)

```bash
cd ~/Desktop/pba
npm run build
npm run preview -- --host 100.112.99.47        # or --host 0.0.0.0 on a trusted network
npm run warmup -- http://100.112.99.47:4173    # expect three ✓ lines; model stays loaded for 2 h
```

Open these browser tabs in order:
1. `/ask` (model mode)
2. `/ask?engine=rules` (instant fallback)
3. `/campaigns`
4. `/results`

Before going on stage:
- **Start clean:** use a fresh browser tab, or press **Restart demo** in Campaign Studio, so no earlier draft is in progress. State lives in sessionStorage.
- Keep the deck open in presenter view; the speaker notes hold the full script.
- **If there is no laptop or projector for a live demo:** slide 5 is a real screenshot of the same answer. Present from it and say so.

**If the model is slow:**
- Answers average about 25 s (latest 12-case run: average 24.8 s, maximum 44.3 s).
- Narrate the investigation timeline while it runs.
- Past about 45 s, press **Stop**, switch to the rules tab and re-ask. The answer is instant and labelled rule-based.

## 2. Timing versions (pick one once the slot length is known)

The full script runs about 8–9 minutes plus a live demo. Spoken times are in each slide's notes.

| Slot | Slides to present | Notes |
|---|---|---|
| **3 min** | 1 → 2 → 4 → 6 → 9 → 12 → 13 → 15 | No live demo. Mention the screenshot on slide 5 in one line. |
| **5 min** | 1 → 2 → 3 → 4 → 5 (screenshot) → 6 → 8 → 9 → 11 → 12 → 13 → 15 | Skip 7, 10 and 14, or keep them for Q&A. |
| **7–10 min** | All 1–15, with the live demo on slide 5 and the optional Campaign Studio flow on slide 7 | Slide 16 is backup only. |

Keep slides 7, 10, 14 and 16 ready for Q&A whatever the slot length.

## 3. The spine (memorise this, not the slides)

1. **Problem.** A merchant has payment data, but not a trustworthy answer to "what is worth doing, for whom, and what will it cost?"
2. **Solution.** One loop: Ask → Investigate → Compare (including doing nothing) → merchant Approves → Measure against a holdout → Learn.
3. **Example.** Sunrise Bakery is down 13% and mornings are down 21.6%.
   - A blanket ₹30 discount would give away up to ₹92,700 a month and need 27% more orders to break even.
   - Instead, target 27 lapsed regulars: about ₹213 cost and about +₹1,133 expected. It stays positive at half the effect.
4. **Why trust it.** Numbers only come from tested tools, every claim is checked for meaning, and agents can only propose.
5. **Honesty.** We have tested this on synthetic data; real revenue impact is what the pilot will prove.

## 4. Lines that must be said (or the claim must not be made)

- "This is a prototype on **synthetic data** for a fictional bakery. It is **not connected to Paytm**." Say this on slide 1 or 2.
- The ₹92,700 is an **upper bound** under the assumption that every order redeems. Never say "saves ₹92,700".
- The blanket and targeted numbers **cover different scopes**: all orders over 30 days vs 27 customers over 14 days.
- +₹1,133, ₹213, 11% and +₹529 are **estimates** from editable assumptions.
- 4 of 27 vs 0 of 7 is a **simulated** run, and the app itself says the sample is too small.
- 12/12 is on **tested synthetic cases**. It does **not** show that real merchants earn more.
- Business model and distribution are **hypotheses**. There are no pricing, market-size or partnership claims.

**Never say:** "revolutionary", "game-changing", "fully autonomous", "guaranteed", "unique", "the only", "proven ROI", "Paytm data", "real customers".

## 5. Likely judge questions

| Question | Answer |
|---|---|
| Is this real merchant data? | No. It is a seeded synthetic generator: 180 days, 900 customers, with known patterns planted. That lets us check whether the detector finds what we planted: 30 of 40 planted lapsed regulars, with 4 false flags. |
| How do you know the AI isn't hallucinating? | The model never types numbers. It writes references, and the app fills them in from tested tools. A rule-based reviewer, with no model involved, checks every claim for the right segment, time window, direction, evidence type and causation. In the latest live run, 72 of 72 claims shown were grounded and 19 unsupported claims were removed before display. |
| What if the model is down or slow? | A labelled rule-based engine answers with the same tools and checks, instantly. |
| Why a local model? | The data stays on our hardware, and the hardest work (the maths) is done by deterministic code, so a compact open model is enough. A hosted model can be swapped in behind the same two-route proxy. |
| Does the discount actually work? | Unknown for real merchants. That is the point of the pilot. With 27 vs 7 customers there is only about 13% power, and the app says so. About 62 per group are needed for the assumed effect. |
| How is this different from other teams? | Approval gates, evidence lists and rules fallbacks exist elsewhere. Our USP is the combination: priced options with break-even, a holdout readout, claim-level meaning checks and a local-first model, behind a merchant approval gate. **Do not name teams. Do not claim "only".** |
| Market size? Revenue model? | We have deliberately not quoted market numbers we cannot source. The revenue model is a set of options to test in the pilot (slide 13). |
| What did you build in the hackathon vs before? | Answer truthfully from the commit history. Do not guess. |
| What about Sarvam / Indic languages? | Not built yet. It is a reasonable roadmap item (message drafting in the merchant's language), but **do not claim it**. |

## 6. What to rehearse (in order of risk)

1. **The live ask on slide 5**, including the stop-and-switch to rules mode if it stalls past about 45 s. Practise both paths twice.
2. **Slide 6 numbers out loud**, with the qualifiers ("up to", "estimate", "different scopes"). This is the slide most likely to be challenged.
3. **The 3-minute cut** with a timer. It is the most likely slot if the format is a quick demo round.
4. **The honest-limit line on slide 11** ("what this does not prove"). Say it confidently, not apologetically.
5. **Q&A answers** for "is it real data?", "how is it different?" and "does it make money?".
6. **Hand-offs between three presenters**, if the team splits the talk. Suggested split:
   - Problem and solution: slides 1–7
   - Technology, USP and impact: slides 8–12
   - Business, roadmap and close: slides 13–15
