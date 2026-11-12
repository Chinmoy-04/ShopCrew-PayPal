import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BrowsingMotion } from "./BrowsingMotion";
import { OperationsShell } from "./OperationsShell";
import { CartLink, CartNotice } from "./CartLink";

export function Shell() {
  const { pathname } = useLocation();
  if (pathname === "/control" || pathname === "/insights") return <OperationsShell />;
  return (
    <div className="shell">
      <BrowsingMotion />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <nav className="nav browsing-nav" aria-label="Main navigation">
        <Link to="/" className="brand"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M7 24V11l9-5 9 5v13H7Z M7 14h18 M12 24v-6h8v6" /></svg>ShopCrew</Link>
        <div className="nav-links demo-navigation">
          <div className="demo-nav-group" role="group" aria-labelledby="storefront-nav-label">
            <span className="demo-nav-label" id="storefront-nav-label">Storefront</span>
            <div className="demo-nav-links">
              <NavLink to="/shop" className={({ isActive }) => (isActive ? "active" : "")}>Shop</NavLink>
              <CartLink />
            </div>
          </div>
          <div className="demo-nav-group" role="group" aria-labelledby="operations-nav-label">
            <span className="demo-nav-label" id="operations-nav-label">Operations</span>
            <div className="demo-nav-links">
              <NavLink to="/control" className={({ isActive }) => (isActive ? "active" : "")}>Control room</NavLink>
              <NavLink to="/insights" className={({ isActive }) => (isActive ? "active" : "")}>Insights</NavLink>
            </div>
          </div>
        </div>
      </nav>
      <div id="main-content" tabIndex={-1}><Outlet /></div>
      <CartNotice />
    </div>
  );
}
