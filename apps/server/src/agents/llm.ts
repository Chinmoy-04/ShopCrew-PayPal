import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { repoRoot, settings } from "../config.js";

export async function narrate(system: string, prompt: string, fallback: string): Promise<string> {
  const provider = settings.llmProvider();
  if (provider === "replay" || provider === "heuristic") return lookup(system, prompt) ?? fallback;
  try {
    const text = await liveText(provider, system, prompt);
    if (process.env.LLM_RECORD === "1") remember(system, prompt, text);
    return text || fallback;
  } catch {
    if (settings.llmFallback() && settings.llmFallback() !== provider) {
      try {
        return (await liveText(settings.llmFallback(), system, prompt)) || fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export const csToolChoiceSchema = z.object({
  action: z.enum(["create_refund", "send_reply", "escalate_to_owner"]),
  amount: z.number().nonnegative().optional(),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type CsToolChoice = z.infer<typeof csToolChoiceSchema>;

export async function chooseTool(
  system: string,
  prompt: string,
  fallback: CsToolChoice,
): Promise<CsToolChoice> {
  const provider = settings.llmProvider();
  if (provider === "replay" || provider === "heuristic") {
    const recorded = lookupObject(system, prompt);
    if (recorded) {
      const parsed = csToolChoiceSchema.safeParse(recorded);
      if (parsed.success) return parsed.data;
    }
    return fallback;
  }
  try {
    const { generateObject } = await import("ai");
    const model = await languageModel(provider);
    const result = await generateObject({
      model,
      system,
      prompt,
      schema: csToolChoiceSchema,
    } as never);
    const value = (result.object as CsToolChoice) ?? fallback;
    if (process.env.LLM_RECORD === "1") rememberObject(system, prompt, value);
    return value;
  } catch {
    if (settings.llmFallback() && settings.llmFallback() !== provider) {
      try {
        const { generateObject } = await import("ai");
        const model = await languageModel(settings.llmFallback());
        const result = await generateObject({
          model,
          system,
          prompt,
          schema: csToolChoiceSchema,
        } as never);
        return (result.object as CsToolChoice) ?? fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function key(system: string, prompt: string): string {
  return createHash("sha256").update(`${system}\n${prompt}`).digest("hex");
}

function replayFile(): string {
  return path.join(repoRoot(), "fixtures", "llm-replay.json");
}

function lookup(system: string, prompt: string): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(replayFile(), "utf8")) as { entries?: { hash: string; text?: string; object?: unknown }[] };
    const entry = data.entries?.find((item) => item.hash === key(system, prompt));
    return entry?.text ?? null;
  } catch {
    return null;
  }
}

function lookupObject(system: string, prompt: string): unknown | null {
  try {
    const data = JSON.parse(fs.readFileSync(replayFile(), "utf8")) as { entries?: { hash: string; object?: unknown }[] };
    return data.entries?.find((item) => item.hash === key(system, prompt))?.object ?? null;
  } catch {
    return null;
  }
}

function remember(system: string, prompt: string, text: string) {
  const file = replayFile();
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { entries: { hash: string; text?: string; object?: unknown }[] };
  data.entries = data.entries ?? [];
  data.entries.push({ hash: key(system, prompt), text });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function rememberObject(system: string, prompt: string, object: unknown) {
  const file = replayFile();
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { entries: { hash: string; text?: string; object?: unknown }[] };
  data.entries = data.entries ?? [];
  data.entries.push({ hash: key(system, prompt), object });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function liveText(provider: string, system: string, prompt: string): Promise<string> {
  const { generateText } = await import("ai");
  const model = await languageModel(provider);
  const result = await generateText({ model, system, prompt, maxRetries: 1 } as never);
  return result.text;
}

async function languageModel(provider: string) {
  if (provider === "groq") {
    const { createGroq } = await import("@ai-sdk/groq");
    return createGroq({ apiKey: process.env.GROQ_API_KEY })(process.env.LLM_MODEL || "llama-3.3-70b-versatile");
  }
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(settings.llmModel());
}

export async function completeObject<T>(system: string, prompt: string, schema: unknown, fallback: T): Promise<T> {
  if (settings.llmProvider() === "replay" || settings.llmProvider() === "heuristic") return fallback;
  try {
    const { generateObject, jsonSchema } = await import("ai");
    const model = await languageModel(settings.llmProvider());
    const wrapped =
      schema && typeof schema === "object" && "jsonSchema" in (schema as object)
        ? schema
        : jsonSchema(schema as Record<string, unknown>);
    const result = await generateObject({ model, system, prompt, schema: wrapped } as never);
    return (result.object as T) ?? fallback;
  } catch {
    return fallback;
  }
}
