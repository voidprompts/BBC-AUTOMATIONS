import "server-only";

import sharp from "sharp";
import { PLATFORM_SPECS, type Platform } from "@/lib/schemas";

/**
 * Server-side canvas pipeline (sharp):
 *
 * 1. Build a "hero" composite — the model/base image (or an AI backdrop)
 *    fills the canvas, and the product image is composited on top with a
 *    soft drop shadow so it looks placed into the scene.
 * 2. Render that hero at each platform's exact aspect ratio:
 *      Facebook  → 1080 × 1080 (1:1)
 *      Pinterest → 1000 × 1500 (2:3)
 *    using an attention-based cover crop, with padding fallback.
 */

const FETCH_TIMEOUT_MS = 30_000;

export class ImageFetchError extends Error {
  constructor(url: string, detail: string) {
    super(`Failed to fetch image from ${url}: ${detail}`);
    this.name = "ImageFetchError";
  }
}

/** Download a remote image (e.g. a Vercel Blob URL) into a Buffer. */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new ImageFetchError(url, `HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      throw new ImageFetchError(url, `unexpected content-type "${type}"`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof ImageFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ImageFetchError(url, "request timed out");
    }
    throw new ImageFetchError(url, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

interface HeroOptions {
  /** Base/backdrop image bytes (model photo or AI-generated scene). */
  backdrop: Buffer;
  /** Product image bytes, composited on top. */
  product: Buffer;
}

const HERO_SIZE = 1600; // master square canvas the crops are cut from

/**
 * Merge the product onto the backdrop:
 * - backdrop is cover-resized onto a 1600×1600 master canvas
 * - product is trimmed, resized to ~62% of canvas, given a soft shadow,
 *   and anchored slightly below center (classic product-ad framing).
 */
export async function buildHeroComposite({
  backdrop,
  product,
}: HeroOptions): Promise<Buffer> {
  const base = await sharp(backdrop)
    .rotate() // respect EXIF orientation
    .resize(HERO_SIZE, HERO_SIZE, { fit: "cover", position: "attention" })
    .modulate({ brightness: 0.96, saturation: 1.05 })
    .toBuffer();

  // Trim flat borders so the product fills its bounding box, then scale.
  const productSize = Math.round(HERO_SIZE * 0.62);
  let productLayer: Buffer;
  try {
    productLayer = await sharp(product)
      .rotate()
      .trim({ threshold: 12 })
      .resize(productSize, productSize, {
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
  } catch {
    // trim() throws on fully-uniform images — retry without it.
    productLayer = await sharp(product)
      .rotate()
      .resize(productSize, productSize, { fit: "inside" })
      .png()
      .toBuffer();
  }

  const meta = await sharp(productLayer).metadata();
  const pw = meta.width ?? productSize;
  const ph = meta.height ?? productSize;

  // Soft drop shadow: blurred dark ellipse rendered from SVG beneath the product.
  const shadowW = pw + 120;
  const shadowH = Math.max(Math.round(ph * 0.28), 90);
  const shadowSvg = Buffer.from(
    `<svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <radialGradient id="g" cx="50%" cy="50%" r="50%">
           <stop offset="0%" stop-color="black" stop-opacity="0.45"/>
           <stop offset="70%" stop-color="black" stop-opacity="0.18"/>
           <stop offset="100%" stop-color="black" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2 - 4}" ry="${shadowH / 2 - 4}" fill="url(#g)"/>
     </svg>`
  );

  const left = Math.round((HERO_SIZE - pw) / 2);
  const top = Math.round((HERO_SIZE - ph) / 2 + HERO_SIZE * 0.06);
  const shadowLeft = Math.round((HERO_SIZE - shadowW) / 2);
  const shadowTop = Math.min(
    top + ph - Math.round(shadowH / 2),
    HERO_SIZE - shadowH
  );

  return sharp(base)
    .composite([
      { input: shadowSvg, left: shadowLeft, top: Math.max(shadowTop, 0) },
      { input: productLayer, left, top },
    ])
    .png()
    .toBuffer();
}

export interface RenderedVariation {
  platform: Platform;
  buffer: Buffer;
  width: number;
  height: number;
  contentType: "image/jpeg";
}

/**
 * Cut a platform-specific variation from the hero composite.
 * Uses a smart "attention" cover crop; if that fails for any reason we
 * fall back to a padded (contain) canvas with a blurred fill.
 */
export async function renderPlatformVariation(
  hero: Buffer,
  platform: Platform
): Promise<RenderedVariation> {
  const { width, height } = PLATFORM_SPECS[platform];

  let buffer: Buffer;
  try {
    buffer = await sharp(hero)
      .resize(width, height, { fit: "cover", position: "attention" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    // Padded fallback: blurred cover backdrop + contained foreground.
    const blurred = await sharp(hero)
      .resize(width, height, { fit: "cover" })
      .blur(30)
      .toBuffer();
    const contained = await sharp(hero)
      .resize(width, height, { fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(contained).metadata();
    buffer = await sharp(blurred)
      .composite([
        {
          input: contained,
          left: Math.round((width - (meta.width ?? width)) / 2),
          top: Math.round((height - (meta.height ?? height)) / 2),
        },
      ])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  return { platform, buffer, width, height, contentType: "image/jpeg" };
}
