import { paypal } from "./rest.js";
import { settings } from "../config.js";

export interface WebhookHeaders {
  authAlgo?: string;
  certUrl?: string;
  transmissionId?: string;
  transmissionSig?: string;
  transmissionTime?: string;
}

export function readWebhookHeaders(headers: Record<string, string | string[] | undefined>): WebhookHeaders {
  const one = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    authAlgo: one("paypal-auth-algo"),
    certUrl: one("paypal-cert-url"),
    transmissionId: one("paypal-transmission-id"),
    transmissionSig: one("paypal-transmission-sig"),
    transmissionTime: one("paypal-transmission-time"),
  };
}

export async function verifyWebhookSignature(rawBody: string, headers: WebhookHeaders): Promise<boolean> {
  const webhookId = settings.paypal().webhookId;
  if (!paypal.configured() || !webhookId) return false;
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const result = (await paypal.request("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.authAlgo,
    cert_url: headers.certUrl,
    transmission_id: headers.transmissionId,
    transmission_sig: headers.transmissionSig,
    transmission_time: headers.transmissionTime,
    webhook_id: webhookId,
    webhook_event: event,
  })) as { verification_status?: string };
  return result.verification_status === "SUCCESS";
}
