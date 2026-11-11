import { useEffect, useMemo, useRef, useState } from "react";
import { ensureAgGrid } from "../grids/ensureAgGrid";
import type { GridApi } from "ag-grid-community";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { CommandBar } from "../components/CommandBar";
import { SimControls } from "../components/SimControls";
import { OperationsPortal, operationsTabs } from "../components/OperationsShell";
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
  // Child grids initialize before parent effects; register modules before rendering them.
  ensureAgGrid(agGridLicenseKey);
  const [params, setParams] = useSearchParams();
  const initialTab = isTab(params.get("tab")) ? params.get("tab")! : "decisions";
  const [tab, setTab] = useState<Tab>(initialTab as Tab);
  const gridApi = useRef<GridApi | null>(null);
  const gridWaiter = useRef<((api: GridApi) => void) | null>(null);
  function setGridApi(api: GridApi) { gridApi.current = api; gridWaiter.current?.(api); gridWaiter.current = null; }
  async function commandGrid(name: string): Promise<GridApi | null> {
    if (!isTab(name)) throw new Error("Unknown grid");
    if (name === tab) return gridApi.current;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { gridWaiter.current = null; reject(new Error("Grid did not become ready")); }, 10000);
      gridWaiter.current = (api) => { clearTimeout(timer); resolve(api); };
      selectTab(name);
    });
  }
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDollars, setPendingDollars] = useState(0);
  const [autoToday, setAutoToday] = useState(0);
  const [budgetBurn, setBudgetBurn] = useState("");
  const [paused, setPaused] = useState(false);
  const [payoutPending, setPayoutPending] = useState(0);
  const [stripError, setStripError] = useState("");
  const [stripVersion, setStripVersion] = useState(0);
  const stripAlive = useRef(true);
  const focusId = params.get("focus");

  async function refreshStrip() {
    const [kpis, proposals, payouts] = await Promise.all([api.kpis(), api.proposals(), api.payouts()]);
    if (!stripAlive.current) return;
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
    stripAlive.current = true;
    const onPageHide = () => { stripAlive.current = false; };
    window.addEventListener("pagehide", onPageHide);
    const refresh = () => {
      void refreshStrip().then(() => { if (stripAlive.current) setStripError(""); }).catch((error) => {
        if (stripAlive.current) setStripError(error instanceof Error ? error.message : "Could not load supervision summary");
      });
    };
    refresh();
    const stopLive = onLive((event) => {
      if (
        event.type === "proposal.upserted"
        || event.type === "payout.upserted"
        || event.type === "sim.reset"
        || event.type === "sim.advanced"
        || event.type === "policy.updated"
      ) {
        refresh();
      }
    });
    return () => { stripAlive.current = false; stopLive(); window.removeEventListener("pagehide", onPageHide); };
  }, [stripVersion]);

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
    void api.proposals().then((rows) => {
      const target = rows.filter((row) => row.status === "pending_approval")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const next = new URLSearchParams();
      next.set("tab", "decisions");
      if (target) next.set("focus", target.id);
      setParams(next, { replace: true });
      setTab("decisions");
    });
  }

  const badges = useMemo(() => ({
    decisions: pendingCount,
    payouts: payoutPending,
  }), [pendingCount, payoutPending]);

  return (
    <SimTimeProvider>
      <main className="page control-room">
        <header className="operations-heading"><div><h1>{operationsTabs.find(item => item.name === tab)?.label}</h1><p>{TAB_HINT[tab]}</p></div><span className="workspace-context">Control room</span></header>
        {demoPublicReset && (
          <div className="banner banner-demo">Shared demo — data resets on cold start and after Reset (60s cooldown).</div>
        )}
        {dryRun && <div className="banner">Sandbox credentials are empty, so refunds and payouts are dry-run and labeled DRY. Add keys in .env to hit PayPal.</div>}
        <OperationsPortal slot="simulation"><SimControls demoPublicReset={demoPublicReset} /></OperationsPortal>
        {stripError && <div className="error" role="alert">{stripError} <button type="button" className="btn" onClick={() => setStripVersion((version) => version + 1)}>Retry summary</button></div>}
        <div className="supervision-strip">
          <div className="supervision-pending"><strong>{pendingCount}</strong> pending · ${pendingDollars.toFixed(2)}</div>
          <div>Auto-approved today: <strong>{autoToday}</strong></div>
          <div>Budget burn: <strong>{budgetBurn}</strong></div>
          <div>{paused ? <span className="badge blocked">paused</span> : <span className="badge confirmed">agents live</span>}</div>
          <button type="button" className="btn primary" onClick={reviewNextPending}>Review next pending</button>
        </div>
        <div className="control-nav">
          <OperationsPortal slot="navigation"><div className="tabs" role="tablist" aria-label="Control room sections" aria-orientation="vertical">
            {operationsTabs.map(({ name, label, icon: Icon }) => (
              <button key={name} id={`operations-tab-${name}`} type="button" role="tab" className="btn" title={label} aria-label={label} aria-controls="operations-panel" aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
                onKeyDown={(event) => {
                  const index = TABS.indexOf(name);
                  const next = event.key === "ArrowDown" ? (index + 1) % TABS.length : event.key === "ArrowUp" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
                  if (next >= 0) { event.preventDefault(); selectTab(TABS[next]); document.getElementById(`operations-tab-${TABS[next]}`)?.focus(); }
                }} onClick={() => selectTab(name)}>
                <Icon aria-hidden="true" /><span className="sidebar-label">{name}</span>
                {!!badges[name as keyof typeof badges] && (
                  <span className="tab-badge">{badges[name as keyof typeof badges]}</span>
                )}
              </button>
            ))}
          </div></OperationsPortal>
          <CommandBar grid={tab} getApi={() => gridApi.current} onGrid={commandGrid} />
        </div>
        <div className="control-grid-area" id="operations-panel" role="tabpanel" aria-labelledby={`operations-tab-${tab}`}>
          <div className="grid-panel" key={tab}>
            {tab === "inbox" && <InboxGrid onGrid={setGridApi} />}
            {tab === "decisions" && <DecisionsGrid onGrid={setGridApi} focusId={focusId} />}
            {tab === "orders" && <OrdersGrid onGrid={setGridApi} focusId={focusId} />}
            {tab === "inventory" && <InventoryGrid onGrid={setGridApi} />}
            {tab === "payouts" && <PayoutsGrid onGrid={setGridApi} />}
            {tab === "audit" && <AuditGrid onGrid={setGridApi} />}
            {tab === "policies" && <PoliciesGrid onGrid={setGridApi} />}

          </div>
        </div>
      </main>
    </SimTimeProvider>
  );
}
