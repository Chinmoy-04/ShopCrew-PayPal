import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const [archivePath, destination] = process.argv.slice(2);
if (!archivePath || !destination) throw new Error("Usage: node scripts/restore-pglite.mjs backup.tar.gz NEW_DATABASE_DIRECTORY");
const target = path.resolve(destination);
if (fs.existsSync(target)) throw new Error("Restore destination must not exist. Restore into a new directory, never over a running database.");
const archive = new Blob([fs.readFileSync(path.resolve(archivePath))]);
const database = new PGlite(target, { loadDataDir: archive });
try {
  await database.waitReady;
  const result = await database.query("SELECT count(*) AS count FROM products");
  console.log(`Restored database at ${target}; products: ${result.rows[0].count}`);
} finally {
  await database.close();
}
