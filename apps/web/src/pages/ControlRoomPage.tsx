import { useEffect, useMemo, useState } from "react";
import { ensureAgGrid } from "../grids/ensureAgGrid";
import type { GridApi } from "ag-grid-community";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { CommandBar } from "../components/CommandBar";
import { SimControls } from "../components/SimControls";
import { SimTimeProvider } from "../hooks/SimTimeContext";
import { onLive } from "../hooks/useLiveEvents";
import { AuditGrid } from "../grids/audit/AuditGrid";
import { DecisionsGrid } from "../grids/decisions/DecisionsGrid";
import { InboxGrid } from "../grids/inbox/InboxGrid";
import { InventoryGrid } from "../grids/inventory/InventoryGrid";
import { OrdersGrid } from "../grids/orders/OrdersGrid";
import { PayoutsGrid } from "../grids/payouts/PayoutsGrid";
import { PoliciesGrid } from "../grids/policies/PoliciesGrid";

const TABS = ["decisions", "inbox", "orders", "payouts", "inventory", "policies", "audit"] as const;
type Tab = (typeof TABS)[number];

const TAB_HINT: Record<Tab, string> = {
  decisions: "Approve, edit, or reject agent proposals",
  inbox: "Customer messages and draft replies",
  orders: "Shop orders as sim time advances",
  payouts: "Supplier payments and negotiations",
  inventory: "Stock, cover, and reorder signals",
  policies: "Auto-approve limits and budgets",
  audit: "Immutable event log",
};

function isTab(value: string | null): value is Tab {
  return Boolean(value && (TABS as readonly string[]).includes(value));
}

export function ControlRoomPage({
  dryRun,
  agGridLicenseKey,
  demoPublicReset,
}: {
  dryRun?: boolean;
  agGridLicenseKey?: string;
  demoPublicReset?: boolean;
}) {
  useEffect(() => {
    ensureAgGrid(agGridLicenseKey);
  }, [agGridLicenseKey]);
  const [params, setParams] = useSearchParams();
  const initialTab = isTab(params.get("tab")) ? params.get("tab")! : "decisions";
  const [tab, setTab] = useState<Tab>(initialTab as Tab);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDollars, setPendingDollars] = useState(0);
  const [autoToday, setAutoToday] = useState(0);
  const [budgetBurn, setBudgetBurn] = useState("");
  const [paused, setPaused] = useState(false);
  const [payoutPending, setPayoutPending] = useState(0);
  const focusId = params.get("focus");

  async function refreshStrip() {
    const [kpis, proposals, payouts] = await Promise.all([api.kpis(), api.proposals(), api.payouts()]);
    const pending = proposals.filter((row) => row.status === "pending_approval");
    setPendingCount(pending.length);
    setPendingDollars(pending.reduce((sum, row) => sum + (row.amount ?? 0), 0));
    setAutoToday(kpis.autoApproved);
    setPaused(kpis.paused);
    setBudgetBurn(`$${kpis.spendToday.toFixed(0)} / $${kpis.budget.toFixed(0)}`);
    setPayoutPending(payouts.filter((row) => ["PENDING", "UNCLAIMED", "SUCCESS"].includes(row.status) === false ? row.status === "PENDING" : row.status === "PENDING" || row.status === "UNCLAIMED").length
      || payouts.filter((row) => row.status === "PENDING" || row.status === "UNCLAIMED").length);
  }

  useEffect(() => {
    void refreshStrip();
    return onLive((event) => {
      if (
        event.type === "proposal.upserted"
        || event.type === "payout.upserted"
        || event.type === "sim.reset"
        || event.type === "sim.advanced"
        || event.type === "policy.updated"
      ) {
        void refreshStrip();
      }
    });
  }, []);

  useEffect(() => {
    const next = isTab(params.get("tab")) ? (params.get("tab") as Tab) : tab;
    if (next !== tab) setTab(next);
  }, [params]);

  function selectTab(name: Tab) {
    setTab(name);
    const next = new URLSearchParams(params);
    next.set("tab", name);
    setParams(next, { replace: true });
  }

  function reviewNextPending() {
    selectTab("decisions");
    void api.proposals().then((rows) => {
      const pending = rows
        .filter((row) => row.status === "pending_approval")
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const target = pending[0];
      if (!target || !gridApi) return;
      const node = gridApi.getRowNode(target.id);
      if (!node) return;
      node.setExpanded(true);
      gridApi.ensureNodeVisible(node, "middle");
      node.setSelected(true);
    });
  }

  const badges = useMemo(() => ({
    decisions: pendingCount,
    payouts: payoutPending,
  }), [pendingCount, payoutPending]);

  return (
    <SimTimeProvider>
      <main className="page control-room">
        {demoPublicReset && (
          <div className="banner banner-demo">Shared demo — data resets on cold start and after Reset (60s cooldown).</div>
        )}
        {dryRun && <div className="banner">Sandbox credentials are empty, so refunds and payouts are dry-run and labeled DRY. Add keys in .env to hit PayPal.</div>}
        <SimControls demoPublicReset={demoPublicReset} />
        <div className="supervision-strip">
          <div><strong>{pendingCount}</strong> pending · ${pendingDollars.toFixed(2)}</div>
          <div>Auto-approved today: <strong>{autoToday}</strong></div>
          <div>Budget burn: <strong>{budgetBurn}</strong></div>
          <div>{paused ? <span className="badge blocked">paused</span> : <span className="badge confirmed">agents live</span>}</div>
          <button type="button" className="btn primary" onClick={reviewNextPending}>Review next pending</button>
        </div>
        <div className="control-nav">
          <div className="tabs">
            {TABS.map((name) => (
              <button key={name} className="btn" aria-selected={tab === name} onClick={() => selectTab(name)}>
                {name}
                {!!badges[name as keyof typeof badges] && (
                  <span className="tab-badge">{badges[name as keyof typeof badges]}</span>
                )}
              </button>
            ))}
          </div>
          <CommandBar grid={tab} getApi={() => gridApi} onGrid={(name) => selectTab(name as Tab)} />
        </div>
        <p className="control-tab-hint note">{TAB_HINT[tab]}</p>
        <div className="control-grid-area">
          <div className="grid-panel" key={tab}>
            {tab === "inbox" && <InboxGrid onGrid={setGridApi} />}
            {tab === "decisions" && <DecisionsGrid onGrid={setGridApi} focusId={focusId} />}
            {tab === "orders" && <OrdersGrid onGrid={setGridApi} focusId={focusId} />}
            {tab === "inventory" && <InventoryGrid />}
            {tab === "payouts" && <PayoutsGrid onGrid={setGridApi} />}
            {tab === "audit" && <AuditGrid />}
            {tab === "policies" && <PoliciesGrid />}

          </div>
        </div>
      </main>
    </SimTimeProvider>
  );
}
