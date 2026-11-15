import "server-only";
import OpenAI from "openai";
import type { z } from "zod";

/**
 * Gemini through its OpenAI-compatible endpoint (any OpenAI-compatible provider works:
 * set AI_BASE_URL / AI_API_KEY / AI_MODEL). Every call returns schema-checked JSON or null,
 * so callers always have a deterministic fallback.
 */
const BASE_URL = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = () => process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
export const aiModel = () => process.env.AI_MODEL || "gemini-3-flash-preview";
export const aiEnabled = () => !!API_KEY();

let client: OpenAI | null = null;
const ai = () => (client ??= new OpenAI({ apiKey: API_KEY(), baseURL: BASE_URL, timeout: 45_000, maxRetries: 1 }));

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Primary model first, then fallbacks (used when a model is rate-limited or unavailable). */
export const aiModels = () =>
  Array.from(new Set([aiModel(), ...(process.env.AI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-3.1-flash-lite-preview").split(",").map((m) => m.trim()).filter(Boolean)]));

/** Models that just returned 429/404 are skipped for a while instead of being hammered. */
const cooling = new Map<string, number>();

export async function askJson<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  user: string,
  opts: { images?: string[]; maxTokens?: number; temperature?: number; onModel?: (model: string) => void } = {}
): Promise<z.output<S> | null> {
  if (!aiEnabled()) return null;
  const content: OpenAI.ChatCompletionContentPart[] = [{ type: "text", text: user }, ...(opts.images ?? []).map((url) => ({ type: "image_url" as const, image_url: { url } }))];
  const models = aiModels();
  const ready = models.filter((m) => (cooling.get(m) ?? 0) < Date.now());
  for (const model of ready.length ? ready : models) {
    let jsonMode = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai().chat.completions.create({
          model,
          temperature: opts.temperature ?? 0.2,
          max_tokens: Math.max(opts.maxTokens ?? 1200, 2000),
          ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
          messages: [
            { role: "system", content: system + "\n\nReply with only a JSON object." },
            { role: "user", content },
          ],
        });
        const text = res.choices[0]?.message?.content ?? "";
        if (!text.trim()) continue;
        const parsed = schema.safeParse(extractJson(text));
        if (parsed.success) {
          opts.onModel?.(model);
          return parsed.data;
        }
      } catch (e) {
        if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
          console.error("AI key rejected:", (e as Error).message);
          return null;
        }
        if (e instanceof OpenAI.RateLimitError || e instanceof OpenAI.NotFoundError) {
          console.warn(`AI model ${model} unavailable (${(e as { status?: number }).status}); trying the next one`);
          cooling.set(model, Date.now() + (e instanceof OpenAI.RateLimitError ? 60_000 : 3_600_000));
          break;
        }
        if (e instanceof OpenAI.BadRequestError && jsonMode) {
          jsonMode = false;
          continue;
        }
        if (attempt === 1) console.error(`AI request to ${model} failed:`, (e as Error).message);
      }
    }
  }
  return null;
}
