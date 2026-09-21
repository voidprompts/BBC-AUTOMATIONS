import { NextResponse } from "next/server";
import { MissingEnvError } from "@/lib/env";
import { generateTextRequestSchema } from "@/lib/schemas";
import { generateMarketingCopy, NvidiaApiError } from "@/lib/nvidia";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * SEO caption pipeline — queries the NVIDIA NIM chat-completions
 * endpoint (OpenAI SDK + custom baseURL) and returns a validated
 * MarketingCopy JSON object.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateTextRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 }
    );
  }

  try {
    const copy = await generateMarketingCopy(parsed.data);
    return NextResponse.json(copy);
  } catch (error) {
    console.error("[generate-text] failed:", error);

    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "Server misconfiguration", detail: error.message },
        { status: 500 }
      );
    }
    if (error instanceof NvidiaApiError) {
      const status = error.status === 429 ? 429 : 502;
      return NextResponse.json(
        { error: "NVIDIA NIM text generation failed", detail: error.message },
        { status }
      );
    }
    return NextResponse.json(
      {
        error: "Caption generation failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
