# Demo video (target 2:55)

No music. No third-party logos except the PayPal button the JS SDK renders.

Warm the Render URL first: `node scripts/warmup.mjs https://YOUR_SERVICE.onrender.com`

Reset the demo (seed 42) before you record. Have the sandbox buyer password ready.

| Beat | Time | On screen | Say |
| --- | --- | --- | --- |
| B1 | 0:00–0:12 | Landing page — live KPI feed | Maya runs a one-person candle shop. Tickets, stock, and refunds eat the morning. |
| B2 | 0:12–0:35 | Shop checkout as sandbox buyer; success card; Orders row flips to **confirmed** | A real PayPal sandbox payment. The webhook confirms the order — cut the wait and label it if needed. |
| B3 | 0:35–1:05 | **Advance day**; Decisions queue; $8 refund detail with tool trace | The model chose `create_refund` through the PayPal Agent Toolkit. Policy auto-approved it under $15. |
| B4 | 1:05–1:30 | $45 refund: edit to $20, Approve, PayPal id, **confirmed** | Maya stays in control. PayPal confirms the edited amount. |
| B5 | 1:30–1:42 | Blocked NIGHT discount and policy chips; optional **Ask the agent why** | The gate blocks risk and says why — days of cover below lead time. |
| B6 | 1:42–2:00 | Approve CITRUS payout → **UNCLAIMED**; roll back payout; roll back FIG price | Unclaimed payouts and prices can be undone. Refunds cannot — the UI says so. |
| B7 | 2:00–2:10 | Command bar: `show refunds over $20` | She asks in a sentence. AG Grid AI Toolkit applies the filter. |
| B8 | 2:10–2:42 | Insights: anomaly banner; Studio AI; custom agent builds refund-anomaly widget; audit shows tool calls | Custom widgets, ShopCrew theme, and a custom Studio agent on AG Studio. |
| B9 | 2:42–2:55 | **Pause all agents**; stack slide and public repo URL | One switch stops every agent. PayPal, AG Grid, Render. |

If a webhook is slow, cut from submitted to confirmed and label the cut "+ webhook".
