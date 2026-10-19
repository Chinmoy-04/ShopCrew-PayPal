import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { products, proposals, salesDaily, simState } from "../../db/schema.js";
import { proposalView } from "../../db/views.js";
import { writeAudit } from "../../db/audit.js";
import { bus } from "../../bus/events.js";
import { holtWinters } from "../../ml/holtWinters.js";
import { narrate } from "../llm.js";

export async function runOrchestrator(day: number): Promise<string> {
  const catalog = await db().select().from(products);
  const sales = await db().select().from(salesDaily);
  const open = await db()
    .select()
    .from(proposals)
    .where(and(eq(proposals.simDay, day), inArray(proposals.status, ["pending_approval", "auto_approved", "approved", "confirmed", "submitted"])));

  for (const row of open) {
    if (row.type !== "price_change" || row.reason !== "discount") continue;
    const product = catalog.find((item) => item.sku === row.targetRef);
    if (!product) continue;
    const series = sales.filter((item) => item.productId === product.id).sort((a, b) => a.simDay - b.simDay).map((item) => item.units);
    const daily = holtWinters(series).forecast[0] || product.baseDemand;
    const cover = daily > 0 ? product.stock / daily : 999;
    if (cover >= product.leadTimeDays + 2) continue;
    const inventory = open.find((item) => item.agent === "inventory" && item.targetRef === product.sku);
    await db().update(proposals).set({
      status: "blocked",
      conflictWithId: inventory?.id ?? null,
      policyResultJson: { decision: "blocked", reasons: [`Only ${cover.toFixed(1)} days of cover. No discount while stock is inside the lead time.`], risk: 80 },
    }).where(eq(proposals.id, row.id));
    await writeAudit({
      actor: "agent",
      agent: "orchestrator",
      event: "conflict.blocked",
      proposalId: row.id,
      correlationId: row.correlationId,
      message: `Blocked the ${product.sku} discount. Cover is ${cover.toFixed(1)} days, lead time is ${product.leadTimeDays}.`,
    });
    const view = await proposalView(row.id);
    if (view) bus.emit({ type: "proposal.upserted", proposal: view });
  }

  const latest = await db().select().from(proposals).where(eq(proposals.simDay, day));
  const counts = latest.map((row) => `${row.agent} ${row.type} ${row.status}`).join("; ");
  const fallback = latest.length
    ? `Day ${day}: ${latest.length} decisions. ${counts}.`
    : `Day ${day}: the crew had nothing that needed a decision.`;
  const summary = await narrate("Write a three-sentence shop operations summary for the owner.", fallback, fallback);
  await db().update(simState).set({ lastSummary: summary }).where(eq(simState.id, 1));
  await writeAudit({ actor: "agent", agent: "orchestrator", event: "day.summary", message: summary });
  return summary;
}
