import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type Product } from "../api/client";

export function cartItems(): { sku: string; qty: number }[] {
  try { return JSON.parse(localStorage.getItem("shopcrew-cart") || "[]"); }
  catch { return []; }
}
export function saveCart(items: { sku: string; qty: number }[]) {
  localStorage.setItem("shopcrew-cart", JSON.stringify(items));
}

function HowToTest({ hint, email }: { hint?: string; email?: string }) {
  return (
    <details className="how-to-test">
      <summary>How to test (sandbox)</summary>
      <p>{hint || "Use the sandbox personal account Buyer Bob from developer.paypal.com."}</p>
      {email && <p>Buyer login hint: <code>{email}</code></p>}
      <p>Stay on Sandbox. Do not use a real PayPal login.</p>
    </details>
  );
}

export function ShopPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.products().then(setProducts).catch((err) => setError(err.message)); }, []);
  if (error) return <main className="page"><div className="error">{error}. Is the API running?</div></main>;
  if (!products) return <main className="page"><p className="note">Loading the shop…</p></main>;
  if (!products.length) return <main className="page"><div className="empty">No products yet. Reset the demo from the control room.</div></main>;
  return (
    <main className="page">
      <h1>Hearth & Wick</h1>
      <p className="lede">Maya's candle shop. Prices come from the database, so the pricing agent changes what checkout charges.</p>
      <div className="shop-grid">
        {products.map((product) => (
          <Link key={product.sku} to={`/shop/${product.sku}`} className="product-card">
            <div
              className="product-card__swatch"
              style={{
                background: `linear-gradient(165deg, ${product.hue} 0%, color-mix(in srgb, ${product.hue} 55%, #1c1915) 100%)`,
              }}
            />
            <div className="product-card__body">
              <strong>{product.name}</strong>
              <div className="price">${product.price.toFixed(2)} · {product.stock} in stock</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function ProductPage() {
  const { sku = "" } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  useEffect(() => { api.product(sku).then(setProduct).catch((err) => setError(err.message)); }, [sku]);
  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!product) return <main className="page"><p className="note">Loading…</p></main>;
  const atZero = product.stock <= 0;
  return (
    <main className="page">
      <div
        className="product-hero-swatch"
        style={{
          background: `linear-gradient(165deg, ${product.hue} 0%, color-mix(in srgb, ${product.hue} 50%, #1c1915) 100%)`,
        }}
      />
      <h1>{product.name}</h1>
      <p>{product.blurb}</p>
      <p className="price">${product.price.toFixed(2)} · {product.stock} in stock</p>
      {product.priceNote && <p className="note">{product.priceNote}</p>}
      <button
        className="btn primary"
        disabled={atZero}
        title={atZero ? "Out of stock" : "Add to cart"}
        onClick={() => {
          const items = cartItems();
          const found = items.find((item) => item.sku === product.sku);
          if (found) {
            if (found.qty >= product.stock) return;
            found.qty += 1;
          } else {
            items.push({ sku: product.sku, qty: 1 });
          }
          saveCart(items);
          setAdded(true);
        }}
      >
        {atZero ? "Out of stock" : added ? "Added" : "Add to cart"}
      </button>
      <Link className="btn" to="/cart">Cart</Link>
    </main>
  );
}

export function CartPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState(cartItems());
  useEffect(() => { void api.products().then(setProducts); }, []);
  const rows = items.map((item) => ({ ...item, product: products.find((product) => product.sku === item.sku) }));
  const total = rows.reduce((sum, row) => sum + (row.product?.price ?? 0) * row.qty, 0);

  function updateQty(sku: string, qty: number) {
    const stock = products.find((p) => p.sku === sku)?.stock ?? 0;
    const next = items
      .map((item) => (item.sku === sku ? { ...item, qty: Math.max(0, Math.min(stock, Math.floor(qty))) } : item))
      .filter((item) => item.qty > 0);
    saveCart(next);
    setItems(next);
  }

  function remove(sku: string) {
    const next = items.filter((item) => item.sku !== sku);
    saveCart(next);
    setItems(next);
  }

  return (
    <main className="page">
      <h1>Cart</h1>
      {!rows.length && <div className="empty">The cart is empty. <Link to="/shop">Browse the shop.</Link></div>}
      {rows.map((row) => (
        <div key={row.sku} className="feed-row cart-row">
          <span>{row.product?.name ?? row.sku}</span>
          <label>
            Qty
            <input
              type="number"
              min={1}
              max={row.product?.stock ?? 1}
              value={row.qty}
              onChange={(e) => updateQty(row.sku, Number(e.target.value))}
            />
          </label>
          <span>${((row.product?.price ?? 0) * row.qty).toFixed(2)}</span>
          <button type="button" className="btn" onClick={() => remove(row.sku)}>Remove</button>
        </div>
      ))}
      {!!rows.length && (
        <div className="cart-footer">
          <p className="cart-total">Total <strong>${total.toFixed(2)}</strong></p>
          <Link className="btn primary" to="/checkout">Checkout</Link>
        </div>
      )}
      {!!rows.length && <button className="btn" onClick={() => { saveCart([]); setItems([]); }}>Clear</button>}
    </main>
  );
}

export function CheckoutPage({
  clientId,
  dryRun,
  demoBuyerHint,
  demoBuyerEmail,
}: {
  clientId?: string;
  dryRun?: boolean;
  demoBuyerHint?: string;
  demoBuyerEmail?: string;
}) {
  const navigate = useNavigate();
  const items = cartItems();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function payDry() {
    setBusy(true);
    setError("");
    try {
      const created = await api.checkout(items);
      if (!created.dryRun) {
        setError("PayPal is live on the server. Refresh this page and use the PayPal button (Buyer Bob), not Place demo order.");
        return;
      }
      saveCart([]);
      navigate(`/checkout/success?order=${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  const livePayPal = Boolean(clientId && !dryRun);
  const demoOnly = Boolean(dryRun);

  return (
    <main className="page">
      <h1>Checkout</h1>
      <HowToTest hint={demoBuyerHint} email={demoBuyerEmail} />
      {dryRun && <div className="banner">PayPal sandbox credentials are not set. This checkout is labeled DRY and stays inside the demo database.</div>}
      {!items.length && <div className="empty">Nothing to pay for.</div>}
      {!!items.length && livePayPal && <PayPalSlot clientId={clientId!} items={items} onDone={(id) => { saveCart([]); navigate(`/checkout/success?order=${id}`); }} onError={setError} />}
      {!!items.length && livePayPal && <p className="note">Pay with the PayPal button. Log in as sandbox buyer <strong>Buyer Bob</strong> (not your real PayPal).</p>}
      {!!items.length && !livePayPal && !demoOnly && (
        <div className="banner">Sandbox keys are set, but the page loaded without the Client ID. Refresh once — then use the PayPal button.</div>
      )}
      {!!items.length && demoOnly && <button className="btn primary" disabled={busy} onClick={() => void payDry()}>{busy ? "Paying…" : "Place demo order"}</button>}
      {error && <div className="error">{error}</div>}
    </main>
  );
}

function PayPalSlot({ clientId, items, onDone, onError }: { clientId: string; items: { sku: string; qty: number }[]; onDone: (id: string) => void; onError: (m: string) => void }) {
  const [status, setStatus] = useState<"loading-sdk" | "ready" | "opening" | "capturing">("loading-sdk");

  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.async = true;
    script.onload = async () => {
      try {
        const paypal = (window as unknown as { paypal?: { createInstance: (o: unknown) => Promise<Sdk> } }).paypal;
        if (!paypal || cancelled) return;
        const sdk = await paypal.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
        if (cancelled) return;
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }: { orderId: string }) => {
            setStatus("capturing");
            const captured = await api.capture(orderId);
            onDone(captured.id);
          },
          onCancel: () => setStatus("ready"),
          onError: (error: unknown) => {
            setStatus("ready");
            onError(error instanceof Error ? error.message : "PayPal error");
          },
        });
        const button = document.querySelector("paypal-button");
        button?.addEventListener("click", () => {
          setStatus("opening");
          const orderPromise = api.checkout(items).then((order) => ({ orderId: String(order.id) }));
          void session
            .start({ presentationMode: "auto" }, orderPromise)
            .catch((error: unknown) => {
              setStatus("ready");
              onError(error instanceof Error ? error.message : "Could not open PayPal");
            });
        });
        setStatus("ready");
      } catch (error) {
        onError(error instanceof Error ? error.message : "PayPal SDK failed to load");
      }
    };
    script.onerror = () => onError("Could not load PayPal SDK from sandbox.paypal.com — check network / ad blockers.");
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, [clientId]);

  return (
    <div>
      {status === "loading-sdk" && <p className="note">Loading PayPal button…</p>}
      {status === "opening" && <p className="note">Opening PayPal sandbox (often 10–40 seconds)…</p>}
      {status === "capturing" && <p className="note">Capturing payment…</p>}
      <paypal-button type="pay" className="paypal-gold" />
    </div>
  );
}

interface Sdk {
  createPayPalOneTimePaymentSession: (o: unknown) => {
    start: (presentation: unknown, order: Promise<{ orderId: string }>) => Promise<void>;
  };
}

export function SuccessPage() {
  const [params] = useSearchParams();
  const id = params.get("order");
  const [order, setOrder] = useState<(Awaited<ReturnType<typeof api.order>>) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void api.order(id).then(setOrder).catch((err) => setError(err.message));
    const timer = setInterval(() => {
      void api.order(id).then(setOrder).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [id]);

  return (
    <main className="page">
      <h1>Paid</h1>
      {error && <div className="error">{error}</div>}
      {!order && !error && <p className="note">Loading order…</p>}
      {order && (
        <div className="success-card">
          <p>
            <span className={`badge ${order.live ? "confirmed" : "dry"}`}>{order.live ? "LIVE" : "DRY"}</span>
            {order.awaitingWebhook && <span className="badge pending_approval">captured, awaiting webhook</span>}
            {order.confirmedAt && <span className="badge confirmed">confirmed</span>}
          </p>
          <p><strong>Order</strong> {order.id}</p>
          <p><strong>PayPal order</strong> <code>{order.paypalOrderId}</code></p>
          <p><strong>Capture</strong> <code>{order.paypalCaptureId}</code></p>
          <p className="note">Total ${order.total.toFixed(2)}</p>
          <Link className="btn primary" to={`/control?tab=orders&focus=${encodeURIComponent(order.id)}`}>
            Open in control room
          </Link>
        </div>
      )}
      {!order && <Link className="btn primary" to="/control">Open the control room</Link>}
    </main>
  );
}
