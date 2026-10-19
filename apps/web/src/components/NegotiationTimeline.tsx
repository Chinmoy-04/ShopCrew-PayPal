import type { NegoStep } from "../api/client";

interface Props {
  transcript: NegoStep[];
  quote: number;
  qty: number;
}

export function NegotiationTimeline({ transcript, quote, qty }: Props) {
  if (!transcript?.length) return null;
  const lastAccept = [...transcript].reverse().find((step) => step.type === "accept");
  const agreed = lastAccept?.unitCost ?? quote;
  const saving = (quote - agreed) * qty;
  const savingPct = quote > 0 ? ((quote - agreed) / quote) * 100 : 0;
  return (
    <div className="nego">
      <div className="nego-header">
        <span>Supplier negotiation</span>
        {saving > 0 && (
          <span className="nego-saving">
            Saved ${saving.toFixed(2)} ({savingPct.toFixed(1)}%) vs. list price
          </span>
        )}
      </div>
      <div className="nego-steps">
        {transcript.map((step, i) => (
          <div key={i} className={`nego-step ${step.from} ${step.type}`}>
            <span className="nego-who">{step.from === "inventory" ? "ShopCrew" : "Supplier"}</span>
            <span className="nego-action">{step.type === "offer" ? "Offer" : step.type === "counter" ? "Counter" : "Accept"}</span>
            <span className="nego-price">${step.unitCost.toFixed(2)}/unit</span>
            <span className="nego-round">round {step.round + 1}</span>
          </div>
        ))}
      </div>
      <div className="nego-footer">
        <span>Agreed: <strong>${agreed.toFixed(2)}/unit</strong> × {qty} = <strong>${(agreed * qty).toFixed(2)}</strong></span>
        <span className="nego-list">List was ${quote.toFixed(2)}/unit</span>
      </div>
    </div>
  );
}
