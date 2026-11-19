import { gte, sql } from "drizzle-orm";
import { db } from "./client.js";
import { competitorPrices, salesDaily, simState } from "./schema.js";

// Match the 180 days of history supplied with a fresh demo.
const historyStart = sql`(select sim_day from ${simState} where id = 1) - 180`;

export function recentSales() {
  return db().select().from(salesDaily).where(gte(salesDaily.simDay, historyStart));
}

export function recentCompetitorPrices() {
  return db().select().from(competitorPrices).where(gte(competitorPrices.simDay, historyStart));
}
