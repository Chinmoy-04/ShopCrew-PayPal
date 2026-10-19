import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
    path.resolve(here, "../../.."),
    path.resolve(here, "../../../.."),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "fixtures", "products.json"))) return candidate;
  }
  return process.cwd();
}

export function loadEnv(): void {
  const root = repoRoot();
  dotenv.config({ path: path.join(root, ".env") });
}

export function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const settings = {
  port: () => Number(env("PORT", "8787")),
  adminToken: () => env("ADMIN_TOKEN", "shopcrew-demo"),
  demoSeed: () => Number(env("DEMO_SEED", "42")),
  publicBaseUrl: () => env("PUBLIC_BASE_URL", "http://localhost:8787"),
  llmProvider: () => env("LLM_PROVIDER", "replay"),
  llmModel: () => env("LLM_MODEL", "gemini-2.5-flash"),
  llmFallback: () => env("LLM_FALLBACK_PROVIDER", "groq"),
  paypal: () => ({
    clientId: env("PAYPAL_CLIENT_ID"),
    clientSecret: env("PAYPAL_CLIENT_SECRET"),
    env: env("PAYPAL_ENV", "sandbox"),
    webhookId: env("PAYPAL_WEBHOOK_ID"),
  }),
  supplierEmail: () => env("SUPPLIER_EMAILS", "acme-supplies@personal.example.com").split(",")[0].trim(),
  unclaimedEmail: () => env("UNCLAIMED_SUPPLIER_EMAIL", "unclaimed-supplier@shopcrew.test"),
  agGridLicense: () => env("AG_GRID_LICENSE_KEY"),
  agStudioLicense: () => env("AG_STUDIO_LICENSE_KEY"),
  /** OpenAI key for AG Studio AI (prefer AG_STUDIO_OPENAI_API_KEY, else OPENAI_API_KEY). */
  studioOpenAiKey: () => env("AG_STUDIO_OPENAI_API_KEY") || env("OPENAI_API_KEY"),
  studioOpenAiModels: () =>
    env("OPENAI_MODELS", "gpt-4.1-mini")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  databaseUrl: () => env("DATABASE_URL"),
};
