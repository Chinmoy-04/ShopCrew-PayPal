import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BrowsingMotion } from "./BrowsingMotion";
import { OperationsShell } from "./OperationsShell";

export function Shell() {
  const { pathname } = useLocation();
  if (pathname === "/control" || pathname === "/insights") return <OperationsShell />;
  return (
    <div className="shell">
      <BrowsingMotion />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <nav className="nav" aria-label="Main navigation">
        <Link to="/" className="brand"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M7 24V11l9-5 9 5v13H7Z M7 14h18 M12 24v-6h8v6" /></svg>ShopCrew</Link>
        <div className="nav-links">
          <NavLink to="/shop" className={({ isActive }) => (isActive ? "active" : "")}>Shop</NavLink>
          <NavLink to="/control" className={({ isActive }) => (isActive ? "active" : "")}>Control room</NavLink>
          <NavLink to="/insights" className={({ isActive }) => (isActive ? "active" : "")}>Insights</NavLink>
          <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}>Cart</NavLink>
        </div>
      </nav>
      <div id="main-content" tabIndex={-1}><Outlet /></div>
    </div>
  );
}
