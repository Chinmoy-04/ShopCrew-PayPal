# Studio AI evaluation list (P3.8)

Run these in Insights Edit mode with `AG_STUDIO_OPENAI_API_KEY` set. Primary model: first entry in `OPENAI_MODELS` (default `gpt-4.1-mini`). Also spot-check the second allowed model before freeze.

| # | Prompt | Expected |
| --- | --- | --- |
| 1 | Build a refund anomaly widget for the last 30 days | Widget `refund-anomaly-strip`; fields day + amount; sigma ≥ 2 |
| 2 | Is any agent refunding unusually much? | Hand-off to `refund-sentinel`; mentions spike / z-score |
| 3 | Build me a payout pipeline | Widget `payout-pipeline`; category status, value amount |
| 4 | Will we stay inside today's budgets? | `cash-planner` + `budget-burn` or pulse on burn |
| 5 | Which SKUs stock out before the supplier can deliver? | `reorder-risk` + `cover-heat` |
| 6 | What is waiting for my approval? | Pending filter / decision ticker; USD amounts |
| 7 | Explain what the agents did today | Decision ticker or decisions grid; sim-day wording |
| 8 | Show refund dollars by day with anomalies marked | `refund-anomaly-strip` on Live agents or Money |
| 9 | Compare supplier negotiation savings | `negotiation-scoreboard` |
| 10 | Add a status stack of decision statuses | `status-stack` or donut on `decisions.status` |
| 11 | Put a budget pulse on Operations | `pulse-meter` on budget burn / snapshot |
| 12 | Show Studio AI activity | Grid over `studio_ai_runs` |

**Pass bar:** ≥10/12 on primary. Failures → tighten `ai.description` on widgets or agent `instructions`.

## Results log

| Model | Date | Pass | Notes |
| --- | --- | --- | --- |
| | | | |
