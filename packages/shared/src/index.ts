export const AGENTS = ["cs", "inventory", "pricing", "orchestrator", "supplier"] as const;
export type AgentId = (typeof AGENTS)[number];

export const PROPOSAL_TYPES = ["refund", "reply", "price_change", "purchase_order", "payout"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_STATUSES = [
  "proposed",
  "auto_approved",
  "pending_approval",
  "blocked",
  "approved",
  "rejected",
  "executing",
  "submitted",
  "confirmed",
  "failed",
  "superseded",
  "rolled_back",
  "rollback_failed",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  proposed: ["auto_approved", "pending_approval", "blocked"],
  pending_approval: ["approved", "rejected", "superseded", "blocked"],
  auto_approved: ["executing", "superseded"],
  approved: ["executing"],
  blocked: [],
  rejected: [],
  executing: ["submitted", "confirmed", "failed"],
  submitted: ["confirmed", "failed", "rolled_back", "rollback_failed"],
  confirmed: ["rolled_back", "rollback_failed"],
  failed: [],
  superseded: [],
  rolled_back: [],
  rollback_failed: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const OPEN_STATUSES: ProposalStatus[] = [
  "proposed",
  "pending_approval",
  "auto_approved",
  "approved",
  "executing",
  "submitted",
];

export const TERMINAL_STATUSES: ProposalStatus[] = [
  "blocked",
  "rejected",
  "confirmed",
  "failed",
  "superseded",
  "rolled_back",
  "rollback_failed",
];

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PolicyDecision = "auto_approved" | "pending_approval" | "blocked";

export interface PolicyResult {
  decision: PolicyDecision;
  reasons: string[];
  risk: number;
}

export interface LiveEvent {
  type: string;
  [key: string]: unknown;
}
