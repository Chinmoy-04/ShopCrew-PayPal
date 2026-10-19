import { loadEnv, repoRoot, settings } from "./config.js";

loadEnv();

import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { db, dbDriver, initDb } from "./db/client.js";
import { products } from "./db/schema.js";
import { seed } from "./db/seed.js";
import { startReconciler } from "./executor/reconciler.js";
import { registerRoutes } from "./routes/register.js";
import { resumeAutorunIfNeeded } from "./sim/clock.js";

const app = Fastify({ logger: false });

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
  try {
    const text = typeof body === "string" ? body : body.toString();
    (request as { rawBody?: string }).rawBody = text;
    done(null, text ? JSON.parse(text) : {});
  } catch (error) {
    done(error as Error, undefined);
  }
});

await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
await registerRoutes(app);
app.setErrorHandler((error, _request, reply) => {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  reply.code(statusCode >= 400 ? statusCode : 500).send({ error: error instanceof Error ? error.message : "Request failed" });
});

const webDist = path.join(repoRoot(), "apps", "web", "dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/healthz")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

await initDb();
const existing = await db().select().from(products);
if (!existing.length) await seed();
startReconciler();
await resumeAutorunIfNeeded();

const port = settings.port();
await app.listen({ port, host: "0.0.0.0" });
console.log(`ShopCrew listening on ${port} (${dbDriver()})`);
