import { narrate } from "./llm.js";

export interface ProposalSnapshot {
  id: string;
  agent: string;
  type: string;
  summary: string;
  reasoning: string;
  policyResult?: string;
  policyReasons?: string[];
  status: string;
  amount?: number | null;
  paypalRef?: string | null;
  inputs?: unknown;
  trace?: unknown;
  correlationId?: string;
}

function replayAnswer(proposal: ProposalSnapshot, question: string): string {
  const q = question.toLowerCase();
  const policy = proposal.policyReasons?.join(" ") ?? proposal.policyResult ?? "";
  const amountStr = proposal.amount != null ? `$${Number(proposal.amount).toFixed(2)}` : "an unknown amount";
  const inputs = proposal.inputs as Record<string, unknown> | null | undefined;
  const isReply = proposal.type === "reply";

  if (q.includes("no refund") || (isReply && q.includes("refund"))) {
    return `This is a reply-only proposal, not a refund. ${proposal.reasoning} Policy: ${policy || "replies do not move money"}.`;
  }
  if (q.includes("this reply") || q.includes("draft")) {
    return `${proposal.reasoning} Approving sends that draft to the customer; no PayPal call is made.`;
  }
  if (q.includes("if i approve") || q.includes("what happens if")) {
    if (isReply) return `If you approve, the draft reply is marked approved. No money moves — replies never call PayPal.`;
    if (proposal.type === "refund") return `If you approve, ShopCrew calls PayPal to refund ${amountStr} on the capture. Status moves to submitted, then confirmed when the webhook arrives.`;
    if (proposal.type === "payout") return `If you approve, ShopCrew creates a PayPal Payout for ${amountStr} to the supplier.`;
    return `If you approve, the executor runs ${proposal.type}. Current status is ${proposal.status}.`;
  }
  if (q.includes("roll") || q.includes("rollback")) {
    return proposal.type === "price_change"
      ? "Yes — approved price changes can be rolled back to the previous price from the Actions column."
      : "Refunds cannot be rolled back. Unclaimed payouts can be cancelled. Price changes can be restored.";
  }
  if (q.includes("negotiat")) {
    return `${proposal.reasoning} Open the negotiation timeline above for each offer and counter.`;
  }
  if (q.includes("policy") || q.includes("limit") || q.includes("auto")) {
    return `Policy decision: ${policy || "no policy reasons stored"}. The auto-approve threshold and daily budget come from the Policies tab.`;
  }
  if (q.includes("amount") || q.includes("price") || q.includes("cost") || q.includes("how much")) {
    if (isReply) return `There is no money amount on a reply. ${proposal.reasoning}`;
    const extra: string[] = [];
    if (inputs?.remaining != null) extra.push(`remaining capturable: $${Number(inputs.remaining).toFixed(2)}`);
    if (inputs?.quote != null) extra.push(`supplier quote: $${Number(inputs.quote).toFixed(2)}`);
    if (inputs?.agreed != null) extra.push(`agreed unit cost: $${Number(inputs.agreed).toFixed(2)}`);
    return `The proposed amount is ${amountStr}. ${extra.join(", ")}. ${proposal.reasoning}`.trim();
  }
  if (q.includes("paypal") || q.includes("status") || q.includes("confirm") || q.includes("submitted")) {
    if (isReply) return `Replies never call PayPal. Status is ${proposal.status}. ${proposal.reasoning}`;
    const ref = proposal.paypalRef ? ` PayPal reference: ${proposal.paypalRef}.` : " No PayPal reference yet.";
    return `Current status is ${proposal.status}.${ref} ${proposal.reasoning}`.trim();
  }
  if (q.includes("why") || q.includes("reason") || q.includes("explain")) {
    return `${proposal.reasoning} ${policy ? `Policy: ${policy}` : ""}`.trim();
  }
  return proposal.reasoning;
}

export async function explainProposal(proposal: ProposalSnapshot, question: string): Promise<{ answer: string; source: "llm" | "replay" }> {
  const system = `You are the ShopCrew ${proposal.agent} agent. Answer the owner in at most 3 sentences using only these facts about proposal ${proposal.id}.`;
  const facts = [
    `Summary: ${proposal.summary}`,
    `Reasoning: ${proposal.reasoning}`,
    `Status: ${proposal.status}`,
    proposal.amount != null ? `Amount: $${Number(proposal.amount).toFixed(2)}` : null,
    proposal.paypalRef ? `PayPal ref: ${proposal.paypalRef}` : null,
    proposal.policyResult ? `Policy: ${proposal.policyResult}` : null,
    proposal.inputs ? `Inputs: ${JSON.stringify(proposal.inputs)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const prompt = `Owner question: "${question}"\n\nFacts:\n${facts}`;
  const fallback = replayAnswer(proposal, question);
  const text = await narrate(system, prompt, fallback);
  const source = text === fallback ? "replay" : "llm";
  return { answer: text, source };
}
