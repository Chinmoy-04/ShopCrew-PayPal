export interface PublicConfig {
  paypalClientId?: string;
  paypalEnv?: string;
  agGridLicenseKey?: string;
  agStudioLicenseKey?: string;
  dryRun?: boolean;
  llmProvider?: string;
  studioAiEnabled?: boolean;
  studioAiModels?: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body as T;
}

export const api = {
  products: () => request<Product[]>("/api/products"),
  product: (sku: string) => request<Product>(`/api/products/${sku}`),
  orders: () => request<OrderRow[]>("/api/orders"),
  proposals: () => request<Proposal[]>("/api/proposals"),
  inventory: () => request<InventoryRow[]>("/api/inventory"),
  payouts: () => request<PayoutRow[]>("/api/payouts"),
  audit: () => request<AuditRow[]>("/api/audit"),
  policies: () => request<Policy[]>("/api/policies"),
  sim: () => request<SimState>("/api/sim"),
  kpis: () => request<Kpis>("/api/kpis"),
  insights: () => request<{
    kpis: Kpis;
    policies: Policy[];
    proposals: Proposal[];
    orders: OrderRow[];
    inventory: InventoryRow[];
    payouts: { id: string; amount: number; status: string; receiver: string; sku: string; createdAt: string }[];
  }>("/api/insights"),
  advance: () => request<{ simDay: number; summary: string }>("/api/sim/advance", { method: "POST", body: "{}" }),
  autorun: (enabled: boolean) => request<SimState>("/api/sim/autorun", { method: "POST", body: JSON.stringify({ enabled }) }),
  pause: (paused: boolean) => request<SimState>("/api/sim/pause", { method: "POST", body: JSON.stringify({ paused }) }),
  reset: (token: string) => request<SimState>("/api/sim/reset", { method: "POST", body: "{}", headers: { "x-admin-token": token } }),
  approve: (id: string) => request<Proposal>(`/api/proposals/${id}/approve`, { method: "POST", body: "{}" }),
  reject: (id: string) => request<Proposal>(`/api/proposals/${id}/reject`, { method: "POST", body: "{}" }),
  rollback: (id: string) => request<{ status: string; message: string }>(`/api/proposals/${id}/rollback`, { method: "POST", body: "{}" }),
  edit: (id: string, amount: number) => request<Proposal>(`/api/proposals/${id}`, { method: "PATCH", body: JSON.stringify({ amount }) }),
  approveSelected: (ids: string[], maxAmount: number) => request<{ approved: string[] }>("/api/proposals/approve-selected", { method: "POST", body: JSON.stringify({ ids, maxAmount }) }),
  savePolicy: (agent: string, patch: Partial<Policy>) => request<Policy>(`/api/policies/${agent}`, { method: "PUT", body: JSON.stringify(patch) }),
  saveLeadTime: (sku: string, leadTimeDays: number) => request(`/api/products/${sku}`, { method: "PATCH", body: JSON.stringify({ leadTimeDays }) }),
  checkout: (items: { sku: string; qty: number }[]) => request<{ id: string; dryRun: boolean }>("/api/checkout/orders", { method: "POST", body: JSON.stringify({ items }) }),
  capture: (id: string) => request<{ id: string }>(`/api/checkout/orders/${id}/capture`, { method: "POST", body: "{}" }),
  nl: (query: string, grid: string, state: unknown, schema: unknown) =>
    request<NlResult>("/api/nl/grid", { method: "POST", body: JSON.stringify({ query, grid, state, schema }) }),
  messages: () => request<MessageRow[]>("/api/messages"),
  ask: (id: string, question: string) => request<{ answer: string; source: string }>(`/api/proposals/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) }),
  capturePool: (token: string) => request<{ ok: boolean; mapping: { id: string; paypalOrderId: string | null; paypalCaptureId: string | null }[] }>("/api/admin/capture-pool", { method: "POST", body: "{}", headers: { "x-admin-token": token } }),
};

export interface Product { id: string; sku: string; name: string; price: number; blurb: string; hue: string; stock: number; }
export interface OrderRow { id: string; customer: string; source: string; paypalOrderId: string | null; paypalCaptureId: string | null; status: string; total: number; refundedTotal: number; simDay: number; createdAt: string; }
export interface InventoryRow { id: string; sku: string; name: string; stock: number; daysOfCover: number; forecast: number; lower: number; upper: number; reorderPoint: number; mape: number; price: number; competitorMin: number | null; elasticity: number; r2: number; leadTimeDays: number; spark: number[]; }
export interface PayoutRow { id: string; senderBatchId: string; payoutBatchId: string | null; payoutItemId: string | null; receiver: string; amount: number; status: string; sku: string; createdAt: string; negotiation?: NegoStep[] | null; qty?: number | null; quote?: number | null; }
export interface NegoStep { from: string; type: string; unitCost: number; round: number; }
export interface MessageRow {
  id: string; simDay: number; customer: string; customerId: string; orderId: string | null;
  channel: string; body: string; category: string; sentiment: string; status: string; templateId: string | null;
  proposalId: string | null; proposalType: string | null; proposalStatus: string | null;
  proposalSummary: string | null; proposalAmount: number | null; agentReasoning: string | null;
  agentAction: string | null; draftReply: string | null; policyReasons: string[]; decidedBy: string | null;
  correlationId: string | null;
}
export interface Proposal {
  id: string; createdAt: string; simDay: number; agent: string; type: string; targetRef: string; summary: string;
  amount: number | null; confidenceModel: number | null; confidenceLlm: number | null; riskScore: number | null;
  policyResult: string; policy: unknown; status: string; paypalRef: string | null; payoutStatus: string | null; reasoning: string;
  toolName: string; toolArgs: unknown; trace: unknown; inputs: unknown; correlationId: string; reason: string | null; decidedBy: string | null;
}
export interface AuditRow { id: string; ts: string; actor: string; agent: string | null; event: string; proposalId: string | null; correlationId: string | null; message: string; }
export interface Policy { agent: string; enabled: boolean; autoApproveMax: number; dailyBudget: number; maxPctOfOrder: number; maxPriceChangePct: number; minMarginPct: number; }
export interface SimState { simDay: number; autorun: boolean; pausedAll: boolean; lastSummary: string | null; seed: number; }
export interface Kpis { simDay: number; revenueToday: number; decisions: number; autoApproved: number; manualApproved: number; pending: number; spendToday: number; budget: number; hoursSaved: number; summary: string; paused: boolean; }
export interface NlResult { grid: string; explanation: string; simple?: { filterModel: Record<string, unknown>; rowGroupCols: string[] }; gridState?: unknown; propertiesToIgnore?: string[]; }
