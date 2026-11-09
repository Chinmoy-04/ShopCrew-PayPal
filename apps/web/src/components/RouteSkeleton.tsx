export function RouteSkeleton({ label }: { label: string }) {
  return (
    <main className="page">
      <div className="route-skeleton" aria-busy="true" aria-label={`Loading ${label}`}>
        <p className="note">Loading {label}…</p>
        <div className="skeleton-bar" />
        <div className="skeleton-bar skeleton-bar--short" />
        <div className="skeleton-bar skeleton-bar--medium" />
      </div>
    </main>
  );
}
