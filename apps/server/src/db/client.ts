import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import pg from "pg";
import { repoRoot } from "../config.js";
import * as schema from "./schema.js";
import { SCHEMA_SQL } from "./sql.js";

export type AppDb = ReturnType<typeof drizzlePglite<typeof schema>>;

let database: AppDb | null = null;
let driver: "pglite" | "postgres" = "pglite";
let pool: pg.Pool | null = null;
let embedded: PGlite | null = null;

async function runSchema(exec: (sql: string) => Promise<unknown>) {
  const parts = SCHEMA_SQL.split(/;\s*\n/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) await exec(part);
}

export async function initDb(): Promise<AppDb> {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (url) {
    pool = new pg.Pool({ connectionString: url });
    await runSchema((sql) => pool!.query(sql));
    database = drizzleNode(pool, { schema }) as unknown as AppDb;
    driver = "postgres";
    return database;
  }
  const dir = process.env.PGLITE_DIR || path.join(repoRoot(), "apps", "server", ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  embedded = client;
  await runSchema((sql) => client.exec(sql));
  database = drizzlePglite(client, { schema });
  driver = "pglite";
  return database;
}

export function db(): AppDb {
  if (!database) throw new Error("Database is not ready");
  return database;
}

export function dbDriver(): "pglite" | "postgres" {
  return driver;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  await embedded?.close();
  embedded = null;
  pool = null;
  database = null;
}

/** Consistent PGlite archive: do not copy an open database's raw directory. */
export async function exportEmbeddedDatabase(): Promise<Buffer> {
  if (!embedded) throw Object.assign(new Error("Use pg_dump for a Postgres deployment."), { statusCode: 409 });
  const archive = await embedded.dumpDataDir("gzip");
  return Buffer.from(await archive.arrayBuffer());
}
