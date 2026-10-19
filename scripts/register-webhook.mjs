const base = process.env.PUBLIC_BASE_URL;
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
const api = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

if (!base || !id || !secret) {
  console.error("Set PUBLIC_BASE_URL, PAYPAL_CLIENT_ID, and PAYPAL_CLIENT_SECRET");
  process.exit(1);
}

const tokenRes = await fetch(`${api}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const token = await tokenRes.json();
if (!token.access_token) {
  console.error(token);
  process.exit(1);
}

const events = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.CANCELED",
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED",
];

const created = await fetch(`${api}/v1/notifications/webhooks`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${base.replace(/\/$/, "")}/api/paypal/webhooks`, event_types: events.map((name) => ({ name })) }),
}).then((response) => response.json());

console.log(JSON.stringify(created, null, 2));
if (created.id) console.log(`\nSet PAYPAL_WEBHOOK_ID=${created.id}`);
