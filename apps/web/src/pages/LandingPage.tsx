import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="brand">ShopCrew</div>
          <h1>Your shop's back office, run by AI agents. You stay in control.</h1>
          <p className="lede">Pricing, inventory, and customer service propose the work. PayPal moves the money. You approve the rest in one grid.</p>
          <div className="cta">
            <Link className="btn primary" to="/control">Open live demo</Link>
            <a className="btn" href="https://render.com/deploy?repo=https://github.com/YOUR_GITHUB/shopcrew">Deploy to Render</a>
          </div>
        </div>
        <div className="feed" aria-hidden="true">
          <div className="feed-row"><span className="badge confirmed">auto</span><span>Refund $8 · cracked lid</span><span>$8</span></div>
          <div className="feed-row"><span className="badge pending">needs you</span><span>Full refund, edit before paying</span><span>$45</span></div>
          <div className="feed-row"><span className="badge blocked">blocked</span><span>15% discount · 3 days of cover</span><span>Night</span></div>
          <div className="feed-row"><span className="badge confirmed">paid</span><span>Supplier payout · Acme</span><span>$182</span></div>
        </div>
      </section>
      <section className="section">
        <h2>One person cannot be the whole back office.</h2>
        <p>Solo sellers lose the morning to tickets, stock-outs, and competitor prices. Tools that only suggest still leave every refund and every supplier payment in human hands.</p>
        <div className="stats">
          <div className="stat"><strong>3 agents</strong>pricing, inventory, service</div>
          <div className="stat"><strong>$0 over budget</strong>the policy gate is the spender</div>
          <div className="stat"><strong>1 grid</strong>approve, edit, or roll back</div>
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
        <p>PayPal Agent Toolkit, Orders v2, Payouts, JavaScript SDK v6, webhooks, AG Grid, and Render.</p>
      </section>
    </main>
  );
}
