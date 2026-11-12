import { useSyncExternalStore } from "react";

const CART_KEY = "shopcrew-cart";
export const CART_CHANGED = "shopcrew:cart-changed";
export type CartItem = { sku: string; qty: number };

export function cartItems(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item.sku === "string" && Number.isInteger(item.qty) && item.qty > 0);
  } catch { return []; }
}

export function saveCart(items: CartItem[], addedProduct?: string) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_CHANGED, { detail: { addedProduct } }));
}

export function subscribeToCart(listener: () => void) {
  const storageChanged = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) listener(); };
  window.addEventListener(CART_CHANGED, listener);
  window.addEventListener("storage", storageChanged);
  return () => { window.removeEventListener(CART_CHANGED, listener); window.removeEventListener("storage", storageChanged); };
}

/** Count units, rather than distinct scents, and keep every cart indicator in sync. */
export function useCartCount(sku?: string) {
  return useSyncExternalStore(subscribeToCart, () => cartItems().reduce((count, item) => count + (!sku || item.sku === sku ? item.qty : 0), 0), () => 0);
}
