import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { env, MissingEnvError } from "@/lib/env";

export const runtime = "nodejs";

// Accept any image type (PNG, JPEG, WebP, GIF, AVIF, TIFF, SVG, BMP, HEIC…).
// sharp normalizes formats downstream in the generation pipeline.
const ALLOWED_CONTENT_TYPES = ["image/*"];
const MAX_SIZE_BYTES = 12 * 1024 * 1024; // 12 MB per upload

/**
 * Client → cloud uploads via Vercel Blob.
 *
 * The browser calls `upload()` from `@vercel/blob/client`, which POSTs
 * here twice:
 *  1. `blob.generate-client-token` — we validate the request and mint a
 *     short-lived, scoped upload token (the RW token never leaves the server).
 *  2. `blob.upload-completed` — webhook-style completion callback.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: env.blobToken,
      onBeforeGenerateToken: async (pathname) => {
        // Only allow uploads into our namespaced folders.
        const allowedPrefix = /^uploads\/(product|model)\//;
        if (!allowedPrefix.test(pathname)) {
          throw new Error(
            "Uploads must target uploads/product/* or uploads/model/*"
          );
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uploadedAt: Date.now() }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Runs after the browser finishes uploading (only reachable in
        // deployed environments; locally it is skipped by Vercel Blob).
        console.log("[blob] upload completed:", blob.pathname);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "Server misconfiguration", detail: error.message },
        { status: 500 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Upload handler failed";
    // handleUpload throws for validation failures (bad type, too large…)
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
