import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { customers, messages, orders, payouts, products, proposals, refunds } from "./schema.js";

export async function proposalView(id: string) {
  const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
  if (!row) return null;
  const [views] = await mapProposals([row]);
  return views;
}

export async function listProposalViews() {
  const rows = await db().select().from(proposals);
  return mapProposals(rows);
}

async function mapProposals(rows: (typeof proposals.$inferSelect)[]) {
  const refundRows = await db().select().from(refunds);
  const payoutRows = await db().select().from(payouts);
  return rows
    .map((row) => {
      const refund = refundRows.find((item) => item.proposalId === row.id);
      const payout = payoutRows.find((item) => item.proposalId === row.id);
      const policy = row.policyResultJson as { reasons?: string[]; decision?: string } | null;
      return {
        id: row.id,
        createdAt: row.createdAt,
        simDay: row.simDay,
        agent: row.agent,
        type: row.type,
        targetRef: row.targetRef,
        summary: row.summary,
        amount: row.amount,
        confidenceModel: row.confidenceModel,
        confidenceLlm: row.confidenceLlm,
        riskScore: row.riskScore,
        policyResult: policy?.reasons?.join(" ") ?? "",
        policy,
        status: row.status,
        paypalRef: refund?.paypalRefundId ?? payout?.payoutItemId ?? payout?.payoutBatchId ?? null,
        payoutStatus: payout?.status ?? null,
        reasoning: row.reasoning,
        toolName: row.toolName,
        toolArgs: row.editedArgsJson ?? row.toolArgsJson,
        trace: row.traceJson,
        inputs: row.inputsJson,
        correlationId: row.correlationId,
        conflictWithId: row.conflictWithId,
        reason: row.reason,
        decidedBy: row.decidedBy,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listOrderViews() {
  const rows = await db().select().from(orders);
  const people = await db().select().from(customers);
  return rows
    .map((row) => ({
      ...row,
      customer: people.find((person) => person.id === row.customerId)?.name ?? "Customer",
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listProductRows() {
  return db().select().from(products);
}

export async function listMessageViews() {
  const msgRows = await db().select().from(messages);
  const people = await db().select().from(customers);
  const propRows = await db().select().from(proposals);

  return msgRows
    .map((msg) => {
      const customer = people.find((p) => p.id === msg.customerId);
      // Find proposal linked to this message either via inputsJson.messageId or targetRef
      const proposal = propRows.find((p) => {
        const inputs = p.inputsJson as { messageId?: string } | null;
        return inputs?.messageId === msg.id || p.targetRef === msg.id;
      });
      const toolArgs = (proposal?.editedArgsJson ?? proposal?.toolArgsJson) as { body?: string; message_id?: string } | null;
      const policy = proposal?.policyResultJson as { reasons?: string[] } | null;
      return {
        id: msg.id,
        simDay: msg.simDay,
        customer: customer?.name ?? "Customer",
        customerId: msg.customerId,
        orderId: msg.orderId,
        channel: msg.channel,
        body: msg.body,
        category: msg.category,
        sentiment: msg.sentiment,
        status: msg.status,
        templateId: msg.templateId,
        proposalId: proposal?.id ?? null,
        proposalType: proposal?.type ?? null,
        proposalStatus: proposal?.status ?? null,
        proposalSummary: proposal?.summary ?? null,
        proposalAmount: proposal?.amount ?? null,
        agentReasoning: proposal?.reasoning ?? null,
        agentAction: proposal?.toolName ?? null,
        draftReply: toolArgs?.body ?? null,
        policyReasons: policy?.reasons ?? [],
        decidedBy: proposal?.decidedBy ?? null,
        correlationId: proposal?.correlationId ?? null,
      };
    })
    .sort((a, b) => b.simDay - a.simDay || (a.id < b.id ? 1 : -1));
}
