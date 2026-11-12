import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Check, ShoppingCart } from "lucide-react";
import { CART_CHANGED, useCartCount } from "../lib/cart";

export function CartLink({ className = "" }: { className?: string }) {
  const count = useCartCount();
  const descriptionId = useId();
  const description = `${count} ${count === 1 ? "item" : "items"} in your cart`;
  return <NavLink to="/cart" className={({ isActive }) => `cart-icon-link ${className}${isActive ? " active" : ""}`} aria-label="Cart" aria-describedby={descriptionId} title={description}>
    <ShoppingCart aria-hidden="true" />
    <span key={count} className="cart-count-badge" aria-hidden="true">{count}</span>
    <span id={descriptionId} className="cart-accessible-description">{description}</span>
  </NavLink>;
}

export function CartNotice() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const notify = (event: Event) => {
      const name = (event as CustomEvent<{ addedProduct?: string }>).detail?.addedProduct;
      if (!name) { setMessage(""); clearTimeout(timer.current); return; }
      setMessage(`${name} added to cart`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 3500);
    };
    window.addEventListener(CART_CHANGED, notify);
    return () => { window.removeEventListener(CART_CHANGED, notify); clearTimeout(timer.current); };
  }, []);
  return <div className="cart-notice-region" role="status" aria-live="polite" aria-atomic="true">
    {message && <div className="cart-notice"><Check aria-hidden="true" /><span>{message}</span></div>}
  </div>;
}
