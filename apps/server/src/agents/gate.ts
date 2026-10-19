import { and, eq, inArray } from "drizzle-orm";
import { OPEN_STATUSES, money, type AgentId, type PolicyResult, type ProposalType } from "@shopcrew/shared";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { policies, proposals, simState } from "../db/schema.js";
import { proposalView } from "../db/views.js";
import { executeProposal } from "../executor/executor.js";
import { evaluatePolicy, type PolicyInput } from "../policy/engine.js";

export async function spentToday(agent: string, simDay: number): Promise<number> {
  const rows = await db()
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.agent, agent),
        eq(proposals.simDay, simDay),
        inArray(proposals.status, ["auto_approved", "approved", "executing", "submitted", "confirmed"]),
      ),
    );
  return rows.reduce((sum, row) => sum + (row.type === "price_change" || row.type === "reply" ? 0 : row.amount ?? 0), 0);
}

export interface ProposeInput {
  agent: AgentId;
  type: ProposalType;
  targetRef: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  reasoning: string;
  summary: string;
  reason?: string;
  inputs?: unknown;
  trace?: unknown;
  confidenceModel: number;
  confidenceLlm: number;
  amount: number;
  policyExtra?: Partial<PolicyInput>;
}

export async function propose(input: ProposeInput): Promise<{ proposalId: string; status: string }> {
  const database = db();
  const [sim] = await database.select().from(simState);
  const [policy] = await database.select().from(policies).where(eq(policies.agent, input.agent));
  const extra = (policy?.extraJson ?? {}) as { autoApprovePct?: number };
  const spent = await spentToday(input.agent, sim?.simDay ?? 0);
  const result: PolicyResult = evaluatePolicy({
    agent: input.agent,
    type: input.type,
    amount: input.type === "price_change" || input.type === "reply" ? 0 : input.amount,
    pausedAll: sim?.pausedAll ?? false,
    agentEnabled: policy?.enabled ?? true,
    autoApproveMax: policy?.autoApproveMax ?? 0,
    dailyBudget: policy?.dailyBudget ?? 0,
    spentToday: spent,
    maxPctOfOrder: policy?.maxPctOfOrder ?? 1,
    maxPriceChangePct: policy?.maxPriceChangePct ?? 20,
    minMarginPct: policy?.minMarginPct ?? 0,
    autoApprovePct: extra.autoApprovePct ?? 5,
    ...input.policyExtra,
  });

  const open = await database
    .select()
    .from(proposals)
    .where(and(eq(proposals.targetRef, input.targetRef), eq(proposals.type, input.type), inArray(proposals.status, OPEN_STATUSES)));
  for (const row of open) {
    await database.update(proposals).set({ status: "superseded" }).where(eq(proposals.id, row.id));
    await writeAudit({
      actor: "system",
      agent: input.agent,
      event: "proposal.superseded",
      proposalId: row.id,
      correlationId: row.correlationId,
      message: "A newer proposal replaced this one.",
    });
  }

  const id = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  await database.insert(proposals).values({
    id,
    agent: input.agent,
    type: input.type,
    targetRef: input.targetRef,
    toolName: input.toolName,
    toolArgsJson: input.toolArgs,
    editedArgsJson: null,
    reasoning: input.reasoning,
    summary: input.summary,
    reason: input.reason ?? null,
    inputsJson: input.inputs ?? null,
    traceJson: input.trace ?? [{ tool: input.toolName, args: input.toolArgs }],
    confidenceModel: input.confidenceModel,
    confidenceLlm: input.confidenceLlm,
    riskScore: result.risk,
    amount: money(input.amount),
    status: result.decision,
    policyResultJson: result,
    conflictWithId: null,
    correlationId,
    createdAt: nowIso(),
    decidedBy: result.decision === "auto_approved" ? "policy" : null,
    decidedAt: result.decision === "auto_approved" ? nowIso() : null,
    simDay: sim?.simDay ?? 0,
  });
  await writeAudit({
    actor: "agent",
    agent: input.agent,
    event: "proposal.created",
    proposalId: id,
    correlationId,
    after: result,
    message: `${input.summary} Policy: ${result.decision}. ${result.reasons.join(" ")}`,
  });
  bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
  if (result.decision === "auto_approved") await executeProposal(id, "policy");
  const view = await proposalView(id);
  return { proposalId: id, status: String(view?.status ?? result.decision) };
}
