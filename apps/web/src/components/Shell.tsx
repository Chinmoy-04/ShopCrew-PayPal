import { Link, NavLink, Outlet } from "react-router-dom";

export function Shell() {
  return (
    <div className="shell">
      <nav className="nav">
        <Link to="/" className="brand">ShopCrew</Link>
        <div className="nav-links">
          <NavLink to="/shop" className={({ isActive }) => (isActive ? "active" : "")}>Shop</NavLink>
          <NavLink to="/control" className={({ isActive }) => (isActive ? "active" : "")}>Control room</NavLink>
          <NavLink to="/insights" className={({ isActive }) => (isActive ? "active" : "")}>Insights</NavLink>
          <NavLink to="/cart" className={({ isActive }) => (isActive ? "active" : "")}>Cart</NavLink>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
