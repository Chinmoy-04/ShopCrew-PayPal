import type { AgAiTelemetryEvent, AgAiTelemetryObserver } from "ag-studio";

const queue: AgAiTelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  // Fire-and-forget; never block the harness loop.
  void fetch("/api/studio/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: batch.map((event) => ({
        type: event.type,
        trace: event.trace,
        timestamp: event.timestamp,
        query: "query" in event ? event.query : undefined,
        status: "status" in event ? event.status : undefined,
        error: "error" in event ? event.error : undefined,
        usage: "usage" in event ? event.usage : undefined,
        toolName: "toolName" in event ? (event as { toolName?: string }).toolName : undefined,
      })),
    }),
  }).catch(() => {
    /* swallow — telemetry must not break chat */
  });
}

/** Queue Studio harness telemetry and POST batches to the server. */
export const shopCrewObserver: AgAiTelemetryObserver = {
  onEvent(event) {
    queue.push(event);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 400);
  },
};
