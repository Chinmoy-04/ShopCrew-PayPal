import type { Proposal } from "../api/client";
import { AskAgent } from "./AskAgent";
import { NegotiationTimeline } from "./NegotiationTimeline";
import type { NegoStep } from "../api/client";

function pathLabel(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path === "toolkit") return "Executed via Agent Toolkit create_refund";
  if (path === "rest") return "Executed via REST fallback";
  if (path === "dry_exhausted") return "DRY: capture exhausted";
  if (path === "dry") return "Dry-run execution";
  return path;
}

export function DecisionCard({ row }: { row: Proposal }) {
  const inputs = row.inputs as { quote?: number; qty?: number } | null;
  const trace = row.trace as { tool?: string; result?: unknown }[] | null;
  const toolArgs = row.toolArgs as { body?: string } | null;
  const draftReply = row.type === "reply" ? toolArgs?.body : null;
  const reasons = (row.policy as { reasons?: string[] } | null)?.reasons ?? [];
  const exec = pathLabel(row.executionPath);

  const timeline: { label: string; at?: string | null }[] = [
    { label: "Submitted", at: row.decidedAt ?? row.createdAt },
  ];
  if (row.refundConfirmedAt || row.status === "confirmed") {
    timeline.push({ label: "Confirmed", at: row.refundConfirmedAt ?? row.decidedAt });
  }
  if (row.status === "failed") timeline.push({ label: "Failed", at: row.decidedAt });
  if (row.status === "rolled_back") timeline.push({ label: "Rolled back", at: row.decidedAt });

  return (
    <div className="detail proposal-detail decision-card">
      <div className="proposal-detail-header">
        <span className={`badge ${row.type}`}>{row.type.replace(/_/g, " ")}</span>
        <span className={`badge ${row.status}`}>{String(row.status).replace(/_/g, " ")}</span>
        {row.editedByOwner && <span className="badge edited">edited by you</span>}
        {row.amount != null && row.type !== "reply" && (
          <span className="proposal-detail-amount">${Number(row.amount).toFixed(2)}</span>
        )}
      </div>

      {row.type === "refund" && <p className="refund-detail-warning">Refunds cannot be reversed.</p>}

      <div className="proposal-detail-block">
        <div className="note">Agent reasoning</div>
        <p><strong>{row.summary}</strong></p>
        <p>{row.reasoning}</p>
      </div>

      {draftReply && (
        <div className="proposal-detail-block inbox-draft">
          <div className="note">Draft customer reply</div>
          <div className="inbox-draft-text">{draftReply}</div>
        </div>
      )}

      {!!reasons.length && (
        <div className="proposal-detail-block">
          <div className="note">Policy</div>
          <div className="policy-chips">
            {reasons.map((reason) => (
              <span key={reason} className="policy-chip">{reason}</span>
            ))}
          </div>
        </div>
      )}

      {!!trace?.length && (
        <div className="proposal-detail-block">
          <div className="note">Tool trace</div>
          <ol className="tool-trace">
            {trace.map((step, index) => (
              <li key={`${step.tool}-${index}`}>
                <code>{step.tool ?? "step"}</code>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(exec || row.paypalRef || row.idempotencyKey) && (
        <div className="proposal-detail-block">
          <div className="note">Execution</div>
          {exec && <p>{exec}</p>}
          {row.paypalRef && <p>PayPal id: <code>{row.paypalRef}</code></p>}
          {row.idempotencyKey && <p className="note">Idempotency: <code>{row.idempotencyKey}</code></p>}
        </div>
      )}

      <div className="proposal-detail-block">
        <div className="note">Status timeline</div>
        <ul className="status-timeline">
          {timeline.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              {item.at && <span className="note"> · {new Date(item.at).toLocaleString()}</span>}
            </li>
          ))}
        </ul>
      </div>

      {row.type === "payout" && Array.isArray(trace) && inputs?.quote != null && inputs?.qty != null && (
        <NegotiationTimeline transcript={trace as NegoStep[]} quote={inputs.quote} qty={inputs.qty} />
      )}

      {row.id && row.id !== "pending-total" && (
        <AskAgent proposalId={row.id} proposalType={row.type} />
      )}
    </div>
  );
}
