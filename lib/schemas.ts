import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared platform constants                                           */
/* ------------------------------------------------------------------ */

export const PLATFORMS = ["facebook", "pinterest"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_SPECS: Record<
  Platform,
  { label: string; width: number; height: number; ratioLabel: string }
> = {
  facebook: { label: "Facebook Ad", width: 1080, height: 1080, ratioLabel: "1:1" },
  pinterest: { label: "Pinterest Pin", width: 1000, height: 1500, ratioLabel: "2:3" },
};

/* ------------------------------------------------------------------ */
/* Dashboard form (client-side, validated with react-hook-form + zod)  */
/* ------------------------------------------------------------------ */

export const campaignFormSchema = z
  .object({
    productTitle: z
      .string()
      .min(3, "Product title must be at least 3 characters")
      .max(120, "Keep the title under 120 characters"),
    shortDescription: z
      .string()
      .min(10, "Give the AI at least 10 characters of context")
      .max(600, "Keep the description under 600 characters"),
    primaryKeywords: z
      .string()
      .min(2, "Add at least one keyword")
      .max(300, "Keep keywords under 300 characters"),
    affiliateLink: z
      .string()
      .url("Enter a valid URL (including https://)")
      .refine((v) => v.startsWith("http"), "Link must start with http(s)://"),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "Select at least one platform"),
  })
  .strict();

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

/* ------------------------------------------------------------------ */
/* /api/generate-images                                                */
/* ------------------------------------------------------------------ */

export const generateImagesRequestSchema = z.object({
  productImageUrl: z.string().url("productImageUrl must be a valid URL"),
  modelImageUrl: z.string().url("modelImageUrl must be a valid URL"),
  productTitle: z.string().min(1),
  shortDescription: z.string().min(1),
  primaryKeywords: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
});

export type GenerateImagesRequest = z.infer<typeof generateImagesRequestSchema>;

export const generatedImageSchema = z.object({
  platform: z.enum(PLATFORMS),
  url: z.string().url(),
  width: z.number(),
  height: z.number(),
});

export type GeneratedImage = z.infer<typeof generatedImageSchema>;

export const generateImagesResponseSchema = z.object({
  images: z.array(generatedImageSchema),
  /** True when the NVIDIA image model contributed an AI backdrop. */
  aiBackdropUsed: z.boolean(),
});

export type GenerateImagesResponse = z.infer<typeof generateImagesResponseSchema>;

/* ------------------------------------------------------------------ */
/* /api/generate-text                                                  */
/* ------------------------------------------------------------------ */

export const generateTextRequestSchema = z.object({
  productTitle: z.string().min(1),
  shortDescription: z.string().min(1),
  primaryKeywords: z.string().min(1),
  affiliateLink: z.string().url(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
});

export type GenerateTextRequest = z.infer<typeof generateTextRequestSchema>;

/** The strict JSON contract the LLM must return. */
export const marketingCopySchema = z.object({
  facebookAdCopy: z.string().min(1),
  pinterestDescription: z.string().min(1),
  facebookHashtags: z.array(z.string()).default([]),
  pinterestHashtags: z.array(z.string()).default([]),
});

export type MarketingCopy = z.infer<typeof marketingCopySchema>;

/* ------------------------------------------------------------------ */
/* Standard API error envelope                                         */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  detail?: string;
}
