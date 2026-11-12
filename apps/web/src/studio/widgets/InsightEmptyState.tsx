export function InsightEmptyState({
  source,
  context,
  filtered = false,
}: {
  source: "payouts" | "studio_ai_runs";
  context: Record<string, any>;
  filtered?: boolean;
}) {
  if (filtered)
    return (
      <div className="insight-empty-state">
        <strong>No payouts match these filters</strong>
        <p>
          Payout records exist. Clear the widget or page filters to see them.
        </p>
      </div>
    );
  if (source === "studio_ai_runs")
    return (
      <div className="insight-empty-state">
        <strong>No Studio AI investigations yet</strong>
        <p>
          This log records questions sent through Ask Studio. Automated
          shop-agent decisions appear in the decision ticker and agent roster.
        </p>
        {context.aiEnabled ? (
          <button
            type="button"
            className="btn"
            onClick={() => context.openStudioAi?.()}
          >
            Open Ask Studio
          </button>
        ) : (
          <span>Studio AI is not enabled for this session.</span>
        )}
      </div>
    );
  const pending = context.pendingPayouts ?? [];
  return (
    <div className="insight-empty-state">
      <strong>No payout records yet</strong>
      <p>
        Payout proposals are tracked separately. This section fills when
        execution creates a payout record.
      </p>
      {pending.length > 0 ? (
        <a
          className="btn"
          href={`/control?tab=decisions&focus=${encodeURIComponent(pending[0].id)}`}
        >
          Review {pending.length} pending payout{" "}
          {pending.length === 1 ? "approval" : "approvals"}
        </a>
      ) : (
        <a className="btn" href="/control?tab=decisions">
          Review agent decisions
        </a>
      )}
    </div>
  );
}
