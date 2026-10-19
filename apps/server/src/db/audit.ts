import { bus } from "../bus/events.js";
import { db } from "./client.js";
import { auditLog } from "./schema.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export async function writeAudit(entry: {
  actor: "agent" | "owner" | "system" | "paypal";
  agent?: string | null;
  event: string;
  proposalId?: string | null;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
  message: string;
}) {
  const row = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    actor: entry.actor,
    agent: entry.agent ?? null,
    event: entry.event,
    proposalId: entry.proposalId ?? null,
    correlationId: entry.correlationId ?? null,
    beforeJson: entry.before ?? null,
    afterJson: entry.after ?? null,
    message: entry.message,
  };
  await db().insert(auditLog).values(row);
  bus.emit({ type: "audit.appended", entry: row });
}
