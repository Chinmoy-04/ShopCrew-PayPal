import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, BarChart3, Boxes, ChevronLeft, ClipboardCheck, House, Inbox, ListOrdered, Menu, ReceiptText, ScrollText, ShieldCheck, ShoppingBag, ShoppingCart } from "lucide-react";

export const operationsTabs = [
  { name: "decisions", label: "Decisions", icon: ClipboardCheck },
  { name: "inbox", label: "Inbox", icon: Inbox },
  { name: "orders", label: "Orders", icon: ListOrdered },
  { name: "payouts", label: "Payouts", icon: ReceiptText },
  { name: "inventory", label: "Inventory", icon: Boxes },
  { name: "policies", label: "Policies", icon: ShieldCheck },
  { name: "audit", label: "Audit log", icon: ScrollText },
] as const;

const OperationsSlots = createContext<{ navigation: HTMLElement | null; simulation: HTMLElement | null }>({ navigation: null, simulation: null });

/** Portals move the existing controls without moving their state or event handlers. */
export function OperationsPortal({ slot, children }: { slot: "navigation" | "simulation"; children: ReactNode }) {
  const host = useContext(OperationsSlots)[slot];
  return host ? createPortal(children, host) : <>{children}</>;
}

export function OperationsShell() {
  const location = useLocation();
  const control = location.pathname === "/control";
  const [navigation, setNavigation] = useState<HTMLDivElement | null>(null);
  const [simulation, setSimulation] = useState<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);

  useEffect(() => { setExpanded(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".day-log-panel:popover-open")) { setExpanded(false); menu.current?.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  return <OperationsSlots.Provider value={{ navigation, simulation }}>
    <div className="shell operations-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="nav operations-sidebar" data-expanded={expanded} aria-label="Workspace navigation">
        <div className="workspace-brand-row">
          <Link to="/" className="brand" aria-label="ShopCrew"><House aria-hidden="true" /><span className="sidebar-label">ShopCrew</span></Link>
          <button ref={menu} className="workspace-menu" type="button" aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            aria-expanded={expanded} aria-controls="workspace-links" onClick={() => setExpanded(value => !value)}>
            {expanded ? <ChevronLeft aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        <Link to="/shop" className="workspace-store" aria-label="Visit Hearth & Wick shop" title="Visit Hearth & Wick shop">
          <ShoppingBag aria-hidden="true" /><span className="sidebar-label"><strong>Hearth &amp; Wick</strong><small>Your store</small></span><ArrowUpRight className="sidebar-label" aria-hidden="true" />
        </Link>
        <nav className="workspace-links" id="workspace-links" aria-label="Operations">
          <NavLink to="/control" className={({ isActive }) => `workspace-section-link ${isActive ? "active" : ""}`} aria-label="Control room" title="Control room">
            <ClipboardCheck aria-hidden="true" /><span className="sidebar-label">Control room</span>
          </NavLink>
          <div className="workspace-tab-slot" ref={setNavigation}>
            {!control && <div className="workspace-tab-links">
              {operationsTabs.map(({ name, label, icon: Icon }) => <Link key={name} to={`/control?tab=${name}`} title={label} aria-label={label}>
                <Icon aria-hidden="true" /><span className="sidebar-label">{label}</span>
              </Link>)}
            </div>}
          </div>
          <NavLink to="/insights" className={({ isActive }) => `workspace-section-link workspace-insights-link ${isActive ? "active" : ""}`} aria-label="Insights" title="Insights">
            <BarChart3 aria-hidden="true" /><span className="sidebar-label">Insights</span>
          </NavLink>
        </nav>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-simulation-slot" ref={setSimulation} />
          <nav className="workspace-exits" aria-label="Store and home">
            <Link to="/" aria-label="Home" title="Home"><House aria-hidden="true" /><span className="sidebar-label">Home</span></Link>
            <NavLink to="/shop" aria-label="Shop" title="Shop"><ShoppingBag aria-hidden="true" /><span className="sidebar-label">Shop</span></NavLink>
            <NavLink to="/cart" aria-label="Cart" title="Cart"><ShoppingCart aria-hidden="true" /><span className="sidebar-label">Cart</span></NavLink>
          </nav>
          <div className="workspace-owner sidebar-label"><span className="workspace-avatar" aria-hidden="true">M</span><span><strong>Maya's workspace</strong><small>Store operations</small></span></div>
        </div>
      </aside>
      <div className="workspace-content" id="main-content" tabIndex={-1}><Outlet /></div>
    </div>
  </OperationsSlots.Provider>;
}
