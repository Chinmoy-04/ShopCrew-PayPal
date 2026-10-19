import { useState } from "react";
import { api } from "../api/client";

interface Answer { question: string; answer: string; source: string; }

const CHIPS_BY_TYPE: Record<string, string[]> = {
  reply: ["Why no refund?", "Why this reply?", "What happens if I approve?"],
  refund: ["Why this amount?", "Why did the policy decide this?", "What happens in PayPal?"],
  payout: ["Why this supplier price?", "What was negotiated?", "What happens in PayPal?"],
  price_change: ["Why this price?", "Why did the policy decide this?", "Can I roll this back?"],
  discount: ["Why this discount?", "Why did the policy decide this?", "What happens if I approve?"],
};

const DEFAULT_CHIPS = ["Why did the agent decide this?", "Why did the policy decide this?", "What happens next?"];

interface Props {
  proposalId: string;
  proposalType?: string | null;
}

export function AskAgent({ proposalId, proposalType }: Props) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chips = (proposalType && CHIPS_BY_TYPE[proposalType]) || DEFAULT_CHIPS;

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.ask(proposalId, q);
      setAnswers((prev) => [{ question: q, answer: result.answer, source: result.source }, ...prev]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get an answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-agent">
      <div className="ask-agent-title">Ask the agent why</div>
      <p className="note ask-agent-hint">
        Questions about this decision only — answers come from the proposal facts above.
      </p>
      <div className="ask-agent-chips">
        {chips.map((chip) => (
          <button key={chip} type="button" className="btn ask-chip" onClick={() => void ask(chip)} disabled={busy}>
            {chip}
          </button>
        ))}
      </div>
      <form
        className="ask-agent-form"
        onSubmit={(e) => { e.preventDefault(); void ask(question); }}
      >
        <input
          className="ask-agent-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a follow-up…"
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={busy || !question.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      <div className="ask-agent-answers">
        {answers.map((item, i) => (
          <div key={i} className="ask-answer">
            <div className="ask-q">{item.question}</div>
            <div className="ask-a">{item.answer}</div>
            {item.source === "replay" && <div className="note">answered from stored data</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
