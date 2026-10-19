# Demo video (target 2:50)

No copyrighted music. Use the YouTube Audio Library or no music. No third-party logos except the PayPal button the JS SDK renders.

Warm the Render URL first: `node scripts/warmup.mjs https://YOUR_SERVICE.onrender.com`

Reset the demo (seed 42) before you record. Have the sandbox buyer password ready.

| Time | What is on screen | Say |
| --- | --- | --- |
| 0:00–0:12 | Shop, three messy mornings implied by the landing line | Maya runs a one-person candle shop. Tickets, stock, and competitor prices eat the morning. |
| 0:12–0:22 | Landing hero | ShopCrew: agents run the shop, PayPal moves the money, Maya supervises. |
| 0:22–0:40 | Checkout with the PayPal button, then the Orders grid flipping to captured | A real sandbox checkout. The order lands in the grid when PayPal confirms it. |
| 0:40–1:00 | Advance 1 day. Open the $8 auto refund detail | The crew posts decisions. This $8 refund is under the $15 threshold, so the policy approved it and the toolkit called create_refund. |
| 1:00–1:25 | Edit the $45 refund to $20, Approve, status moves to confirmed | She does not accept the full refund. She edits the amount, approves, and PayPal confirms. |
| 1:25–1:50 | Inventory row, payout approval, then the blocked Night Market discount | Inventory wants a restock and pays the supplier. Pricing wants 15% off a candle with three days of cover. The orchestrator blocks it. |
| 1:50–2:05 | Cancel the unclaimed payout. Roll back the Fig Leaf price. Open the audit group | Unclaimed payouts can be cancelled. Prices can be restored. The audit log is the chain. |
| 2:05–2:20 | Command bar: show refunds over $20 | She asks the grid in a sentence. AG Grid applies the filter. |
| 2:20–2:35 | Policies, then Pause all agents | Thresholds are hers. One switch stops every agent. |
| 2:35–2:50 | KPI row and the repo URL | Decisions made, nothing over budget, the stack: PayPal Agent Toolkit, Payouts, JS SDK v6, AG Grid, Render. |

If a webhook is slow, cut from submitted to confirmed and label the cut "+ webhook".
