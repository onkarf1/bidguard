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

export async function askJson<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  user: string,
  opts: { images?: string[]; maxTokens?: number; temperature?: number } = {}
): Promise<z.output<S> | null> {
  if (!aiEnabled()) return null;
  const content: OpenAI.ChatCompletionContentPart[] = [{ type: "text", text: user }, ...(opts.images ?? []).map((url) => ({ type: "image_url" as const, image_url: { url } }))];
  let jsonMode = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai().chat.completions.create({
        model: aiModel(),
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
      if (parsed.success) return parsed.data;
    } catch (e) {
      if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
        console.error("AI key rejected:", (e as Error).message);
        return null;
      }
      if (e instanceof OpenAI.BadRequestError && jsonMode) {
        jsonMode = false;
        continue;
      }
      if (attempt === 2) console.error("AI request failed:", (e as Error).message);
    }
  }
  return null;
}
