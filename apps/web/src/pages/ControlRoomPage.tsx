import { useState } from "react";
import type { GridApi } from "ag-grid-community";
import { CommandBar } from "../components/CommandBar";
import { SimControls } from "../components/SimControls";
import { SimTimeProvider } from "../hooks/SimTimeContext";
import { AuditGrid } from "../grids/audit/AuditGrid";
import { DecisionsGrid } from "../grids/decisions/DecisionsGrid";
import { InboxGrid } from "../grids/inbox/InboxGrid";
import { InventoryGrid } from "../grids/inventory/InventoryGrid";
import { OrdersGrid } from "../grids/orders/OrdersGrid";
import { PayoutsGrid } from "../grids/payouts/PayoutsGrid";
import { PoliciesGrid } from "../grids/policies/PoliciesGrid";

const TABS = ["inbox", "decisions", "orders", "inventory", "payouts", "audit", "policies"] as const;

const TAB_HINT: Record<(typeof TABS)[number], string> = {
  inbox: "Customer messages and draft replies",
  decisions: "Approve, edit, or reject agent proposals",
  orders: "Shop orders as sim time advances",
  inventory: "Stock, cover, and reorder signals",
  payouts: "Supplier payments and negotiations",
  audit: "Immutable event log",
  policies: "Auto-approve limits and budgets",
};

export function ControlRoomPage({ dryRun }: { dryRun?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("decisions");
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  return (
    <SimTimeProvider>
      <main className="page control-room">
        {dryRun && <div className="banner">Sandbox credentials are empty, so refunds and payouts are dry-run and labeled DRY. Add keys in .env to hit PayPal.</div>}
        <SimControls />
        <div className="control-nav">
          <div className="tabs">
            {TABS.map((name) => (
              <button key={name} className="btn" aria-selected={tab === name} onClick={() => setTab(name)}>
                {name}
              </button>
            ))}
          </div>
          <CommandBar grid={tab} getApi={() => gridApi} onGrid={(name) => setTab(name as (typeof TABS)[number])} />
        </div>
        <p className="control-tab-hint note">{TAB_HINT[tab]}</p>
        <div className="control-grid-area">
          <div className="grid-panel" key={tab}>
            {tab === "inbox" && <InboxGrid onGrid={setGridApi} />}
            {tab === "decisions" && <DecisionsGrid onGrid={setGridApi} />}
            {tab === "orders" && <OrdersGrid />}
            {tab === "inventory" && <InventoryGrid />}
            {tab === "payouts" && <PayoutsGrid />}
            {tab === "audit" && <AuditGrid />}
            {tab === "policies" && <PoliciesGrid />}
          </div>
        </div>
      </main>
    </SimTimeProvider>
  );
}
