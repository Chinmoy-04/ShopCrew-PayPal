import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Boxes, MessagesSquare, ShieldCheck, Tags, Truck, Workflow } from "lucide-react";
import { api, type Kpis } from "../api/client";
import WidgetGrid, { type WidgetGridItem } from "../components/kokonutui/bento-grid";
import { Reveal } from "../components/BrowsingMotion";

const team: WidgetGridItem[] = [
  { id: "cs", title: "Customer service", icon: <MessagesSquare />, defaultSpan: 4, render: () => <><p>A thoughtful reply. A refund within the rules.</p><span>Customer messages, draft replies, refund proposals.</span></> },
  { id: "inventory", title: "Inventory", icon: <Boxes />, render: () => <><p>Keep the shelves ready.</p><span>Stock cover and reorder signals.</span></> },
  { id: "pricing", title: "Pricing", icon: <Tags />, render: () => <><p>Find room to grow.</p><span>Price changes with margin limits.</span></> },
  { id: "supplier", title: "Supplier", icon: <Truck />, render: () => <><p>Work through the quote.</p><span>Supplier negotiations and payment proposals.</span></> },
  { id: "orchestrator", title: "Orchestrator", icon: <Workflow />, render: () => <><p>The whole day, connected.</p><span>Coordinates the work and brings you the summary.</span></> },
];

export function LandingPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  useEffect(() => { void api.kpis().then(setKpis).catch(() => undefined); }, []);
  const day = kpis?.simDay ?? 0;
  const pending = kpis?.pending ?? 0;
  const auto = kpis?.autoApproved ?? 0;
  const spend = kpis?.spendToday ?? 0;
  const budget = kpis?.budget ?? 0;
  return <main className="page marketing-page">
    <section className="hero">
      <div className="hero-copy">
        <h1>Your shop's back office, run by AI agents. <em>You stay in control.</em></h1>
        <p className="lede">Pricing, inventory, and customer service propose the work. PayPal moves the money. You approve the rest in one grid.</p>
        <div className="cta">
          <Link className="btn primary" to="/shop">Try the demo <ArrowUpRight aria-hidden="true" size={16} /></Link>
          <Link className="btn" to="/control">Open control room</Link>
        </div>
        <a className="deploy-link" href="https://render.com/deploy?repo=https://github.com/Chinmoy-04/ShopCrew-PayPal">Deploy to Render <ArrowUpRight aria-hidden="true" size={14} /></a>
      </div>
      <div className="ledger-preview" aria-label="Live demo snapshot">
        <header><span>Hearth &amp; Wick</span><span className="ledger-day">Sim day {day}</span></header>
        <div className="ledger-title"><ShieldCheck aria-hidden="true" /><h2>A little oversight.<br />A lot off your plate.</h2></div>
        <div className="feed">
          <div className="feed-row"><span className="badge confirmed">auto</span><span>Refunds under policy today</span><strong>{auto}</strong></div>
          <div className="feed-row"><span className="badge pending">needs you</span><span>Pending approvals in the queue</span><strong>{pending}</strong></div>
          <div className="feed-row"><span className="badge blocked">budget</span><span>Spend vs daily agent budgets</span><strong>${spend.toFixed(0)}/${budget.toFixed(0)}</strong></div>
          <div className="feed-row"><span className="badge confirmed">live</span><span>Decisions logged this sim day</span><strong>{kpis?.decisions ?? "—"}</strong></div>
        </div>
        <footer>Agents propose. Your rules set the boundary.</footer>
      </div>
    </section>
    <section className="section marketing-intro">
      <h2>One person cannot be the whole back office.</h2>
      <div><p>Solo sellers lose the morning to tickets, stock-outs, and competitor prices. Tools that only suggest still leave every refund and every supplier payment in human hands.</p>
      <div className="ledger-stats"><div><strong>5 agents</strong><span>one connected back office</span></div><div><strong>{budget ? `$${Math.max(0, budget - spend).toFixed(0)} headroom` : "$0 over budget"}</strong><span>the policy gate is the spender</span></div><div><strong>{pending} waiting</strong><span>approve, edit, or roll back</span></div></div></div>
    </section>
    <section className="section workflow-section" id="how-it-works">
      <div className="section-heading"><h2>Context becomes action.<br /><em>With your rules in between.</em></h2><p>How it works: a visible path from the shop to the decision, and a record of what happened next.</p></div>
      <Reveal><ol className="workflow" aria-label="How ShopCrew works">
        <li><span>Shop context</span><p>Orders, messages, prices, and stock.</p></li>
        <li><span>Agents propose</span><p>Shop and PayPal tools, with reasoning attached.</p></li>
        <li><span>Policy checks</span><p>Thresholds, daily budgets, and a kill switch.</p></li>
        <li><span>Owner decides</span><p>Over the line, it waits for you.</p></li>
        <li><span>Execute &amp; record</span><p>PayPal executes refunds and payouts; the audit records the work.</p></li>
      </ol></Reveal>
    </section>
    <section className="section team-section"><div className="section-heading"><h2>Meet your back office.</h2><p>Five roles, working from the same shop context. You set the limits.</p></div><WidgetGrid items={team} /></section>
    <section className="section owner-section"><Reveal className="owner-layout"><ShieldCheck aria-hidden="true" size={36} /><div><h2>The shop is yours.<br /><em>So is the final say.</em></h2><p>Set auto-approval limits and daily budgets. Pause agents when you need to. Review the reasoning, change a pending amount, and follow every decision in the audit log.</p><Link className="text-link" to="/control?tab=policies">See the existing policy controls <ArrowUpRight aria-hidden="true" size={16} /></Link></div></Reveal></section>
    <footer className="marketing-footer"><h2>Built with</h2><p>PayPal Agent Toolkit, Orders v2, Payouts, JavaScript SDK v6, webhooks, AG Grid, AG Studio, and Render.</p><span>ShopCrew · Hearth &amp; Wick demo</span></footer>
  </main>;
}
