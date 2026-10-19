# PayPal sandbox setup

PayPal asks you to pick a **Sandbox Business Account** when you create an app. Create that account first, then the apps.

1. Sign in at https://developer.paypal.com/dashboard/ (stay on **Sandbox**).
2. **Testing Tools → Sandbox Accounts** (or Sandbox → Accounts):
   - **Business**, **US**, name it **ShopCrew Store**. Fund the balance to about $5,000. This is the seller your apps attach to.
   - **Personal**, **US**, **Buyer Bob**. Use this login in the demo video.
   - **Personal**, **US**, **Acme Supplies**. Put that email in `SUPPLIER_EMAILS`.
   - Do **not** create an account for `UNCLAIMED_SUPPLIER_EMAIL`. Payouts to it stay `UNCLAIMED`, which is how rollback is demonstrated.
3. **Apps & Credentials → Sandbox → Create App**. In the **Sandbox Account** dropdown, choose **ShopCrew Store** (US), not the default India business.
   - `shopcrew-dev` — later: local webhooks (cloudflared or ngrok URL).
   - `shopcrew-prod` — later: the Render URL.
4. On each app, enable **Payouts** and **Transaction Search** if those toggles are present. If Payouts is missing, ask in Discord (see discord-questions.md). Also keep **JavaScript SDK v6** on.
5. Copy Client ID and Secret into `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Leave `PAYPAL_ENV=sandbox`.
6. Register the webhook (see below) and set `PAYPAL_WEBHOOK_ID` — only after you have a public URL.

## Webhook

```bash
node scripts/register-webhook.mjs
```

Subscribes `PUBLIC_BASE_URL/api/paypal/webhooks` to capture, refund, and payout events. The server verifies signatures with `POST /v1/notifications/verify-webhook-signature`. Simulator events cannot verify (they use webhook id `WEBHOOK_ID`). Use a real capture, or resend a real event.

Sandbox delivery is often 10–75 seconds. The UI treats the API response as provisional (`submitted`) and a reconciler polls after 90 seconds.

## Capture pool

Refunds need a real capture id. After a few sandbox checkouts, put them in `fixtures/capture-pool.json`:

```json
{
  "orders": [
    { "id": "ord-small", "paypalOrderId": "...", "paypalCaptureId": "..." },
    { "id": "ord-large", "paypalOrderId": "...", "paypalCaptureId": "..." }
  ]
}
```

Then `npm run db:reset`. Empty entries keep the DRY- ids, which never call PayPal.

Partial refunds ($8, then $20 after an edit) are intentional so one capture survives several demo resets. When a capture is fully refunded, replace it.
