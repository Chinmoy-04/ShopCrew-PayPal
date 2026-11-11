import type { GridApi } from "ag-grid-community";

export type NamedView = "needs" | "money" | "blocked" | "edited" | "everything";

const VIEWS: { id: NamedView; label: string }[] = [
  { id: "needs", label: "Needs approval" },
  { id: "money", label: "Money out" },
  { id: "blocked", label: "Blocked by policy" },
  { id: "edited", label: "Edited by me" },
  { id: "everything", label: "Everything" },
];

export function filterModelForView(view: NamedView): Record<string, unknown> | null {
  if (view === "everything") return null;
  if (view === "needs") return { status: { filterType: "set", values: ["pending_approval"] } };
  if (view === "money") return { type: { filterType: "set", values: ["refund", "payout"] } };
  if (view === "blocked") return { status: { filterType: "set", values: ["blocked"] } };
  if (view === "edited") return { editedByOwner: { filterType: "set", values: ["true"] } };
  return null;
}

export function ViewMenu({
  api,
  active,
  onSelect,
}: {
  api: GridApi | null;
  active: NamedView;
  onSelect: (view: NamedView) => void;
}) {
  function select(view: NamedView) {
    onSelect(view);
    api?.setFilterModel(filterModelForView(view));
  }

  return (
    <div className="preset-chips" role="group" aria-label="Named views">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`preset-chip${active === view.id ? " active" : ""}`}
          disabled={!api}
          aria-pressed={active === view.id}
          onClick={() => select(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
