/** Shared NL → AG Grid rule parser (demo phrases + LLM fallback). */
export function ruleGrid(query: string, simDay: number, current?: string) {
  const q = query.toLowerCase();
  const filterModel: Record<string, unknown> = {};
  if (q.includes("refund")) filterModel.type = { filterType: "set", values: ["refund"] };
  const over = q.match(/over \$?(\d+(?:\.\d+)?)/);
  if (over) filterModel.amount = { filterType: "number", type: "greaterThan", filter: Number(over[1]) };
  if (q.includes("approved by me") || q.includes("i approved") || q.includes("edited by me")) {
    filterModel.decidedBy = { filterType: "set", values: ["owner"] };
  }
  if (q.includes("pending") || q.includes("needs approval")) {
    filterModel.status = { filterType: "set", values: ["pending_approval"] };
  }
  if (q.includes("blocked by policy") || (q.includes("blocked") && !q.includes("unblocked"))) {
    filterModel.status = { filterType: "set", values: ["blocked"] };
  }
  if (q.includes("auto approved") || q.includes("auto-approved")) {
    filterModel.status = { filterType: "set", values: ["auto_approved", "confirmed", "submitted"] };
    filterModel.decidedBy = { filterType: "set", values: ["policy"] };
  }
  if (q.includes("today")) filterModel.simDay = { filterType: "number", type: "equals", filter: simDay };
  const rowGroupCols = q.includes("group by agent") || (q.includes("group") && q.includes("agent"))
    ? ["agent"]
    : q.includes("reason")
      ? ["reason"]
      : [];
  const grid = q.includes("payout")
    ? "payouts"
    : q.includes("inventory") || q.includes("stock")
      ? "inventory"
      : q.includes("order")
        ? "orders"
        : q.includes("audit")
          ? "audit"
          : current || "decisions";
  return {
    grid,
    explanation: `Filtered ${grid}${over ? ` to amounts over $${over[1]}` : ""}${q.includes("refund") ? " to refunds" : ""}${rowGroupCols.length ? ` grouped by ${rowGroupCols.join(", ")}` : ""}.`,
    simple: { filterModel, rowGroupCols },
    gridState: null,
    propertiesToIgnore: [],
  };
}
