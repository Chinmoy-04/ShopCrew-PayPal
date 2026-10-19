import { loadEnv } from "../config.js";

loadEnv();

import { initDb } from "../db/client.js";
import { resetDatabase } from "../db/seed.js";

await initDb();
await resetDatabase();
console.log("Demo database reset.");
