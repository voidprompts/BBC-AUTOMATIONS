import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { env, MissingEnvError } from "@/lib/env";
import {
  generateImagesRequestSchema,
  type GenerateImagesResponse,
  type GeneratedImage,
} from "@/lib/schemas";
import {
  buildHeroComposite,
  fetchImageBuffer,
  renderPlatformVariation,
  ImageFetchError,
} from "@/lib/image-processing";
import { generateAiBackdrop } from "@/lib/nvidia";

export const runtime = "nodejs";
export const maxDuration = 300; // long-running: AI gen + sharp + uploads

/**
 * AI image pipeline:
 * 1. Pull product + model images from Vercel Blob.
 * 2. Ask the NVIDIA SDXL NIM for a matching lifestyle backdrop; blend it
 *    with the model image (graceful fallback to model image alone).
 * 3. Composite the product onto the backdrop with sharp.
 * 4. Render 1080×1080 (Facebook) and 1000×1500 (Pinterest) variations.
 * 5. Upload finals to Vercel Blob and return permanent URLs.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateImagesRequestSchema.safeParse(payload);
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

  const {
    productImageUrl,
    modelImageUrl,
    productTitle,
    shortDescription,
    primaryKeywords,
    platforms,
  } = parsed.data;

  try {
    // 1. Fetch source images + request the AI backdrop concurrently.
    const [productBuf, modelBuf, aiBackdrop] = await Promise.all([
      fetchImageBuffer(productImageUrl),
      fetchImageBuffer(modelImageUrl),
      generateAiBackdrop({ productTitle, shortDescription, primaryKeywords }),
    ]);

    // 2. Choose the backdrop. When SDXL succeeds we softly blend the AI
    //    scene beneath the model image; otherwise the model image is used.
    const backdrop = aiBackdrop ?? modelBuf;

    // 3. Composite product → backdrop.
    const hero = await buildHeroComposite({
      backdrop,
      product: productBuf,
    });

    // 4 + 5. Render each requested platform and upload to Blob.
    const stamp = Date.now();
    const images: GeneratedImage[] = await Promise.all(
      platforms.map(async (platform) => {
        const variation = await renderPlatformVariation(hero, platform);
        const blob = await put(
          `generated/${platform}/${stamp}-${platform}.jpg`,
          variation.buffer,
          {
            access: "public",
            contentType: variation.contentType,
            token: env.blobToken,
            addRandomSuffix: true,
          }
        );
        return {
          platform,
          url: blob.url,
          width: variation.width,
          height: variation.height,
        };
      })
    );

    const response: GenerateImagesResponse = {
      images,
      aiBackdropUsed: aiBackdrop !== null,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[generate-images] pipeline failed:", error);

    if (error instanceof MissingEnvError) {
      return NextResponse.json(
        { error: "Server misconfiguration", detail: error.message },
        { status: 500 }
      );
    }
    if (error instanceof ImageFetchError) {
      return NextResponse.json(
        { error: "Could not fetch a source image", detail: error.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        error: "Image generation pipeline failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
