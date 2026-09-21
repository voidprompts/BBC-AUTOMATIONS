import "server-only";

import OpenAI from "openai";
import { env } from "@/lib/env";
import { marketingCopySchema, type MarketingCopy } from "@/lib/schemas";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class NvidiaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "NvidiaApiError";
  }
}

const TEXT_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 120_000;

/* ------------------------------------------------------------------ */
/* Text generation — OpenAI SDK pointed at the NIM base URL            */
/* ------------------------------------------------------------------ */

function nimClient(): OpenAI {
  return new OpenAI({
    baseURL: env.nvidiaBaseUrl, // https://integrate.api.nvidia.com/v1
    apiKey: env.nvidiaApiKey,
    timeout: TEXT_TIMEOUT_MS,
    maxRetries: 1,
  });
}

const SYSTEM_PROMPT = `You are a world-class direct-response copywriter and social media SEO strategist.

You MUST respond with a single, valid, minified JSON object and NOTHING else — no markdown fences, no commentary, no preamble. The JSON object must exactly match this TypeScript shape:

{
  "facebookAdCopy": string,       // High-converting Facebook ad copy: open with a scroll-stopping hook line, then 3-5 benefit bullets (use the ✅ emoji), social proof or urgency, and a clear call-to-action. Embed the literal affiliate link on its own line prefixed with "👉 Shop now: ". 500-900 characters.
  "pinterestDescription": string, // SEO-optimized Pinterest pin description, 300-490 characters. Naturally weave in ALL primary keywords plus related long-tail search phrases Pinterest users type. End with 4-6 inline hashtags.
  "facebookHashtags": string[],   // 5-8 high-performing Facebook hashtags, each starting with #, camelCase or lowercase, no spaces.
  "pinterestHashtags": string[]   // 8-12 high-performing Pinterest hashtags, each starting with #, mixing broad and niche tags.
}

Rules:
- Output raw JSON only. Double-quote all keys and strings. Escape newlines inside strings as \\n.
- Never invent a different affiliate link; use exactly the one provided.
- Copy must be brand-safe, compliant with platform ad policies, and free of income claims or medical claims.`;

export interface CopyGenerationInput {
  productTitle: string;
  shortDescription: string;
  primaryKeywords: string;
  affiliateLink: string;
  platforms: string[];
}

/** Extract the first JSON object from a possibly noisy LLM response. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip markdown fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  // Grab the outermost braces
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new NvidiaApiError("The language model returned malformed JSON.");
}

export async function generateMarketingCopy(
  input: CopyGenerationInput
): Promise<MarketingCopy> {
  const client = nimClient();

  const userPrompt = [
    `Product title: ${input.productTitle}`,
    `Short description: ${input.shortDescription}`,
    `Primary keywords: ${input.primaryKeywords}`,
    `Affiliate link (use verbatim): ${input.affiliateLink}`,
    `Target platforms: ${input.platforms.join(", ")}`,
    "",
    "Generate the JSON object now.",
  ].join("\n");

  let raw: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model: env.nvidiaTextModel, // nvidia/llama-3.1-405b-instruct
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 1024,
    });
    raw = completion.choices[0]?.message?.content;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      throw new NvidiaApiError(
        `NVIDIA NIM text endpoint failed (${err.status ?? "network"}): ${err.message}`,
        err.status
      );
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new NvidiaApiError("NVIDIA NIM text request timed out.", 408);
    }
    throw err;
  }

  if (!raw) {
    throw new NvidiaApiError("NVIDIA NIM returned an empty completion.");
  }

  const parsed = marketingCopySchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new NvidiaApiError(
      `LLM JSON did not match the expected schema: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Image generation — Stable Diffusion XL NIM                          */
/*                                                                     */
/* SDXL on NVIDIA's hosted infra lives on the genai surface:           */
/*   POST https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl */
/* It accepts Stability-style text_prompts and returns base64 artifacts. */
/* ------------------------------------------------------------------ */

const GENAI_BASE = "https://ai.api.nvidia.com/v1/genai";

export interface BackdropInput {
  productTitle: string;
  shortDescription: string;
  primaryKeywords: string;
}

/**
 * Generate a photorealistic lifestyle backdrop that matches the product's
 * vibe. Returns raw PNG bytes, or null when the model/endpoint is
 * unavailable so callers can gracefully fall back to the model image.
 */
export async function generateAiBackdrop(
  input: BackdropInput
): Promise<Buffer | null> {
  const prompt =
    `Professional product-marketing lifestyle photograph backdrop for "${input.productTitle}". ` +
    `${input.shortDescription}. Themes: ${input.primaryKeywords}. ` +
    `Softly lit studio scene, shallow depth of field, clean negative space in the center for product placement, ` +
    `high-end commercial photography, 8k, photorealistic.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const res = await fetch(`${GENAI_BASE}/${env.nvidiaImageModel}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.nvidiaApiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text_prompts: [
          { text: prompt, weight: 1 },
          {
            text: "text, watermark, logo, blurry, low quality, distorted, people faces",
            weight: -1,
          },
        ],
        cfg_scale: 5,
        sampler: "K_DPM_2_ANCESTRAL",
        seed: 0,
        steps: 25,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(
        `[nvidia] image NIM responded ${res.status}; falling back to composite-only pipeline.`
      );
      return null;
    }

    const json = (await res.json()) as {
      artifacts?: Array<{ base64?: string }>;
      image?: string;
      b64_json?: string;
    };

    const b64 =
      json.artifacts?.[0]?.base64 ?? json.image ?? json.b64_json ?? null;
    if (!b64) return null;
    return Buffer.from(b64, "base64");
  } catch (err) {
    console.warn("[nvidia] image NIM unreachable, falling back:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
