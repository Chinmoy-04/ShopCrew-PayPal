import { settings } from "../config.js";

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(formatPayPalError(body, status));
  }
}

/** Retain support diagnostics without copying headers, credentials or request bodies. */
export function paypalErrorDetails(error: unknown) {
  if (!(error instanceof PayPalError)) return null;
  const body = error.body && typeof error.body === "object"
    ? error.body as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" ? value.slice(0, 1000) : undefined;
  return {
    provider: "paypal",
    status: error.status,
    name: text(body.name),
    debugId: text(body.debug_id),
    details: Array.isArray(body.details) ? body.details.slice(0, 20).map((detail) => {
      const item = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
      return { issue: text(item.issue), field: text(item.field), location: text(item.location) };
    }) : [],
  };
}

export function formatPayPalError(body: unknown, status = 0): string {
  if (body && typeof body === "object") {
    const record = body as { message?: string; details?: { description?: string; issue?: string }[] };
    const detail = record.details?.[0];
    if (detail?.description) return detail.description;
    if (record.message) return record.message;
  }
  return status ? `PayPal request failed (${status})` : "PayPal request failed";
}

export class PayPalRest {
  private token: { value: string; exp: number } | null = null;

  configured(): boolean {
    const paypal = settings.paypal();
    return Boolean(paypal.clientId && paypal.clientSecret);
  }

  base(): string {
    return settings.paypal().env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.exp > Date.now() + 5 * 60 * 1000) return this.token.value;
    const paypal = settings.paypal();
    const response = await fetch(`${this.base()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${paypal.clientId}:${paypal.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await response.json();
    if (!response.ok) throw new PayPalError(response.status, body);
    this.token = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  async request(method: string, path: string, body?: unknown, requestId?: string): Promise<unknown> {
    const send = async (retryAuth: boolean): Promise<unknown> => {
      const response = await fetch(`${this.base()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken(!retryAuth)}`,
          "Content-Type": "application/json",
          ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 && retryAuth) return send(false);
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (!response.ok) throw new PayPalError(response.status, json);
      return json;
    };
    return send(true);
  }

  async requestWithRetry(method: string, path: string, body: unknown, requestId: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.request(method, path, body, requestId);
      } catch (error) {
        last = error;
        const status = error instanceof PayPalError ? error.status : 0;
        if (status !== 429 && status < 500) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
      }
    }
    throw last;
  }
}

export const paypal = new PayPalRest();
