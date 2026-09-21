import { NextResponse } from "next/server";
import { z } from "zod";
import { researchKeywords } from "@/lib/keyword-research";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  seeds: z
    .array(z.string().min(2).max(80))
    .min(1, "Provide at least one seed keyword")
    .max(6),
});

/**
 * Keyword research endpoint.
 * Expands seed keywords against live search-demand sources
 * (Google Autocomplete, DuckDuckGo Suggest, Google Trends related
 * queries) and returns a ranked, de-duplicated list.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        detail: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 }
    );
  }

  try {
    const result = await researchKeywords(parsed.data.seeds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[research-keywords] failed:", error);
    return NextResponse.json(
      {
        error: "Keyword research failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
