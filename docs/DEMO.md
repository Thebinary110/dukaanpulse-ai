# Demo runbook

A five-minute live walkthrough of DukaanPulse AI, with a rehearsed fallback. Every number on screen comes from
**synthetic data for a fictional bakery**; say so up front.

## Before you present (10 minutes ahead)

```bash
cd /home/shhaurya/Desktop/pba
npm run build
npm run preview -- --host 100.112.99.47      # or --host 0.0.0.0 on a trusted network
npm run warmup -- http://100.112.99.47:4173  # loads the model and checks the app can reach it
```

`npm run warmup` should print three ✓ lines. The app keeps the model loaded for two hours
(`DUKAANPULSE_KEEP_ALIVE`).

Open two tabs:

| Tab | URL | Use |
|---|---|---|
| Main | `http://100.112.99.47:4173/` | The journey below |
| Fallback | `http://100.112.99.47:4173/ask?engine=rules` | Instant rule-based answers if the model stalls |

Start from a fresh browser tab, or press **Restart demo** in Campaign Studio, so no earlier draft is in progress.

## The journey (rehearsed live on the local model)

| # | Where | Do | Expect |
|---|---|---|---|
| 1 | Overview | Point at the KPI strip and the growth-opportunity panel | Revenue −13.0% over 30 days; 34 regulars flagged; the ₹ at-risk figure is labelled as an estimate |
| 2 | Ask DukaanPulse | Ask **"Why did morning sales change?"** | About 25–35 s on the model. Business Analyst and Customer Intelligence run in parallel; morning revenue −21.6%; a "possible explanations (not proven)" section |
| 3 | Same answer | Open a claim's **Evidence**, then **Evidence (tool results)** | The value, population ("regulars flagged as away (mostly morning)"), period and source tool behind each number |
| 4 | Ask | Ask **"Should I give everyone a discount?"** | About 25–40 s. Recommendation card: **Targeted discount ₹30 off on ₹200+** for 27 regulars; the alternatives include doing nothing and a ₹30 discount for everyone (about ₹92,700 given away; orders must grow 27% to break even) |
| 5 | Recommendation card | Click **Prepare this as a draft**, then **Create draft in Campaign Studio** | Two deliberate merchant clicks. The draft is the same ₹30-off offer; nothing is approved or sent |
| 6 | Campaign Studio | Tick the simulation acknowledgement → **Approve campaign…** → confirm → **Run simulation** → **Skip to the end** | Approval locks the configuration; the run is labelled SIMULATED |
| 7 | Results | Open **View results** | "Repeat with a larger test", with the small-sample warning (27 vs 7) |

## If the model is slow or stalls

- **Expected latency:** 17–40 s per agent question on this machine. Narrate the investigation timeline while it
  runs: which specialists are active, which tools they called, and the Risk Reviewer's verdict.
- **Stall rule:** if a question passes **about 45 s**, press **Stop**, then either switch the engine to
  **Rules only** or move to the fallback tab and ask the same question. Rule-based answers are instant, use the same
  tools and checks, and are labelled "Rule-based engine". Never present them as model output.
- **Model unavailable:** if `npm run warmup` fails or the header says "Local model unavailable", present the whole
  journey on **Rules only**. Steps 5–7 do not use the model at all.

## Keep the claims honest

- **What 12/12 means:** the live evaluation passed 12 of 12 *tested cases on synthetic data*, and every claim shown
  was traced to tool evidence and checked for segment, period, wording and evidence type. It shows the answers are
  grounded and honestly labelled. It does **not** show that any recommendation increases real merchant revenue.
- **Simulated results:** these come from the stated assumptions. They are an illustration of how a test would be
  measured, not evidence of how customers behave.
- **Data access:** there is no Paytm data, no messaging and no payments. The prototype is not affiliated with Paytm.
- **Model limits:** the model can still word things awkwardly. The reviewer removes claims it cannot validate
  rather than trusting them.
