import type { ICellRendererParams } from "ag-grid-community";

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

export function PolicyVerdict(props: ICellRendererParams) {
  const status = String(props.data?.status ?? "");
  const reasons = (props.data?.policy as { reasons?: string[] } | null)?.reasons?.join(" ")
    || props.data?.policyResult
    || "";
  let label = status.replace(/_/g, " ");
  let kind = status;
  if (status === "auto_approved" || (status === "confirmed" && props.data?.decidedBy === "policy")) {
    label = "auto";
    kind = "auto_approved";
  } else if (status === "pending_approval") {
    label = "needs you";
    kind = "pending_approval";
  } else if (status === "blocked") {
    label = "blocked";
    kind = "blocked";
  }
  return (
    <span className={`badge ${kind}`} title={reasons || label}>
      {label}
    </span>
  );
}

export function PayPalRef(props: ICellRendererParams) {
  const id = props.value as string | null | undefined;
  if (!id) return <span className="note">—</span>;
  const dry = String(id).startsWith("DRY");
  if (dry) return <span className="badge dry" title="Dry-run id">{id}</span>;
  const href = `https://www.sandbox.paypal.com/activities/?q=${encodeURIComponent(id)}`;
  return (
    <a className="paypal-ref" href={href} target="_blank" rel="noreferrer" title="Open in PayPal sandbox activity">
      {id}
    </a>
  );
}

export function MoneyCell(props: ICellRendererParams) {
  return <span>{formatMoney(props.value as number | null)}</span>;
}
