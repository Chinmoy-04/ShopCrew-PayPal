# Demo video (target 2:55)

Record the final hosted build and keep PayPal's returned status visible. Refunds and payouts have both been successfully exercised against PayPal Sandbox. Do not describe a request as complete until the provider confirms it. Replay mode is not a live model response; only show live AI or Studio AI interactions that you have verified in the deployed environment.

No music. No third-party logos except the PayPal button the JS SDK renders.

Warm the Render URL first: `node scripts/warmup.mjs <hosted-demo-url>`

Reset the demo (seed 42) before you record. Have the sandbox buyer password ready.

| Beat | Time | On screen | Say |
| --- | --- | --- | --- |
| B1 | 0:00–0:12 | Landing page — live KPI feed | Maya runs a one-person candle shop. Tickets, stock, and refunds eat the morning. |
| B2 | 0:12–0:35 | Shop checkout as sandbox buyer; success card; Orders row flips to **confirmed** | A real PayPal sandbox payment. The webhook confirms the order — cut the wait and label it if needed. |
| B3 | 0:35–1:05 | **Advance day**; Decisions queue; $8 refund detail with tool trace | The customer-service agent prepares a refund. ShopCrew checks it against the policy before calling PayPal. |
| B4 | 1:05–1:30 | $45 refund: edit to $20, Approve, PayPal id, **confirmed** | Maya stays in control. PayPal confirms the edited amount. |
| B5 | 1:30–1:42 | Blocked NIGHT discount and policy chips; optional **Ask the agent why** | The gate blocks risk and says why — days of cover below lead time. |
| B6 | 1:42–2:00 | Approve CITRUS supplier payout and show the provider-confirmed result; roll back FIG price | The supplier payment goes through PayPal. A price change can be rolled back; a completed payment cannot. |
| B7 | 2:00–2:10 | Command bar: `show refunds over $20` | She asks in a sentence. AG Grid AI Toolkit applies the filter. |
| B8 | 2:10–2:42 | Insights dashboard: anomaly banner, custom widgets, agent roster and audit trail | ShopCrew brings the business picture and agent activity together in AG Studio. If showing an AI-built widget, demonstrate it live on the final hosted build. |
| B9 | 2:42–2:55 | **Pause all agents**; stack slide and public repo URL | One switch stops every agent. PayPal, AG Grid, Render. |

A cut to a confirmed state is appropriate only when that same transaction received provider confirmation. Otherwise keep its actual status visible and explain it plainly.
