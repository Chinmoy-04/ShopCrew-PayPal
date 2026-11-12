/** Display name only; agent IDs remain unchanged in data and API calls. */
export function agentLabel(value: unknown): string {
  const agent = String(value ?? "");
  return agent.toLowerCase() === "cs" ? "Customer service" : agent;
}

/** Expand the agent abbreviation in owner-facing operations summaries. */
export function agentSummary(value: unknown): string {
  return String(value ?? "").replace(/\bcs\b/gi, "customer service");
}
