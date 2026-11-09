import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Kpis } from "../api/client";

export function LandingPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    void api.kpis().then(setKpis).catch(() => undefined);
  }, []);

  const day = kpis?.simDay ?? 0;
  const pending = kpis?.pending ?? 0;
  const auto = kpis?.autoApproved ?? 0;
  const spend = kpis?.spendToday ?? 0;
  const budget = kpis?.budget ?? 0;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Hearth &amp; Wick · sim day {day}</p>
          <div className="brand">ShopCrew</div>
          <h1>Your shop's back office, run by AI agents. You stay in control.</h1>
          <p className="lede">
            Pricing, inventory, and customer service propose the work. PayPal moves the money. You approve the rest in one grid.
          </p>
          <div className="cta">
            <Link className="btn primary" to="/shop">Try the demo</Link>
            <Link className="btn" to="/control">Open control room</Link>
            <a className="btn" href="https://render.com/deploy?repo=https://github.com/Chinmoy-04/ShopCrew-PayPal">Deploy to Render</a>
          </div>
        </div>
        <div className="feed" aria-label="Live demo snapshot">
          <div className="feed-row">
            <span className="badge confirmed">auto</span>
            <span>Refunds under policy today</span>
            <span>{auto}</span>
          </div>
          <div className="feed-row">
            <span className="badge pending">needs you</span>
            <span>Pending approvals in the queue</span>
            <span>{pending}</span>
          </div>
          <div className="feed-row">
            <span className="badge blocked">budget</span>
            <span>Spend vs daily agent budgets</span>
            <span>${spend.toFixed(0)}/${budget.toFixed(0)}</span>
          </div>
          <div className="feed-row">
            <span className="badge confirmed">live</span>
            <span>Decisions logged this sim day</span>
            <span>{kpis?.decisions ?? "—"}</span>
          </div>
        </div>
      </section>
      <section className="section">
        <h2>One person cannot be the whole back office.</h2>
        <p>Solo sellers lose the morning to tickets, stock-outs, and competitor prices. Tools that only suggest still leave every refund and every supplier payment in human hands.</p>
        <div className="stats">
          <div className="stat"><strong>3 agents</strong>pricing, inventory, service</div>
          <div className="stat">
            <strong>{budget ? `$${Math.max(0, budget - spend).toFixed(0)} headroom` : "$0 over budget"}</strong>
            the policy gate is the spender
          </div>
          <div className="stat"><strong>{pending} waiting</strong>approve, edit, or roll back</div>
        </div>
      </section>
      <section className="section">
        <h2>How it works</h2>
        <div className="steps">
          <div><h3>Agents propose</h3><p>Each one calls a PayPal tool or a shop tool, with the reasoning attached.</p></div>
          <div><h3>Policy decides</h3><p>Thresholds, daily budgets, and a kill switch. Over the line, it waits for you.</p></div>
          <div><h3>PayPal executes</h3><p>Refunds go through the Agent Toolkit. Supplier payments go through Payouts.</p></div>
        </div>
      </section>
      <section className="section">
        <h2>Built with</h2>
        <p>PayPal Agent Toolkit, Orders v2, Payouts, JavaScript SDK v6, webhooks, AG Grid, AG Studio, and Render.</p>
      </section>
    </main>
  );
}
