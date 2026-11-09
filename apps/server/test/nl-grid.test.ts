import { describe, expect, it } from "vitest";
import { ruleGrid } from "../src/routes/nlGrid.js";

describe("NL grid demo phrases", () => {
  const phrases: { q: string; expect: (r: ReturnType<typeof ruleGrid>) => void }[] = [
    {
      q: "show refunds over $20",
      expect: (r) => {
        expect(r.simple.filterModel.type).toBeTruthy();
        expect((r.simple.filterModel.amount as { filter: number }).filter).toBe(20);
      },
    },
    {
      q: "blocked by policy",
      expect: (r) => {
        expect((r.simple.filterModel.status as { values: string[] }).values).toContain("blocked");
      },
    },
    {
      q: "group by agent",
      expect: (r) => {
        expect(r.simple.rowGroupCols).toContain("agent");
      },
    },
    {
      q: "approved by me",
      expect: (r) => {
        expect((r.simple.filterModel.decidedBy as { values: string[] }).values).toContain("owner");
      },
    },
    {
      q: "show pending approval",
      expect: (r) => {
        expect((r.simple.filterModel.status as { values: string[] }).values).toContain("pending_approval");
      },
    },
    {
      q: "needs approval",
      expect: (r) => {
        expect((r.simple.filterModel.status as { values: string[] }).values).toContain("pending_approval");
      },
    },
    {
      q: "show refunds",
      expect: (r) => {
        expect((r.simple.filterModel.type as { values: string[] }).values).toContain("refund");
      },
    },
    {
      q: "show auto approved today",
      expect: (r) => {
        expect(r.simple.filterModel.simDay).toBeTruthy();
        expect(r.simple.filterModel.decidedBy).toBeTruthy();
      },
    },
    {
      q: "edited by me",
      expect: (r) => {
        expect((r.simple.filterModel.decidedBy as { values: string[] }).values).toContain("owner");
      },
    },
    {
      q: "show payouts",
      expect: (r) => {
        expect(r.grid).toBe("payouts");
      },
    },
  ];

  for (const phrase of phrases) {
    it(phrase.q, () => {
      phrase.expect(ruleGrid(phrase.q, 1, "decisions"));
    });
  }
});
