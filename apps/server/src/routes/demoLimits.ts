import type { FastifyRequest } from "fastify";

const ADVANCE_LIMIT = 6;
const ADVANCE_WINDOW_MS = 60_000;
const RESET_COOLDOWN_MS = 60_000;

const advanceHits = new Map<string, number[]>();
const resetHits = new Map<string, number>();

export function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0]?.trim() || req.ip;
  }
  return req.ip;
}

export function rateLimitSimAdvance(ip: string): void {
  const now = Date.now();
  const hits = (advanceHits.get(ip) ?? []).filter((t) => now - t < ADVANCE_WINDOW_MS);
  if (hits.length >= ADVANCE_LIMIT) {
    const error = new Error("Too many advance requests — max 6 per minute on the shared demo.");
    (error as Error & { statusCode: number }).statusCode = 429;
    throw error;
  }
  hits.push(now);
  advanceHits.set(ip, hits);
}

export function enforcePublicResetCooldown(ip: string): void {
  const last = resetHits.get(ip) ?? 0;
  if (Date.now() - last < RESET_COOLDOWN_MS) {
    const error = new Error("Reset cooldown — wait 60 seconds between resets on the shared demo.");
    (error as Error & { statusCode: number }).statusCode = 429;
    throw error;
  }
  resetHits.set(ip, Date.now());
}

export const POLICY_CLAMP = {
  autoApproveMax: 500,
  dailyBudget: 5000,
} as const;
