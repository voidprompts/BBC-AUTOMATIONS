"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Facebook,
  Link2,
  Loader2,
  Pin,
  Sparkles,
  Tags,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  campaignFormSchema,
  type CampaignFormValues,
  type GenerateImagesResponse,
  type MarketingCopy,
  type PinterestPublishResponse,
  type PinterestStatusResponse,
  type Platform,
  type ResearchKeywordsResponse,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageDropzone, type UploadedBlob } from "@/components/image-dropzone";
import {
  ResultsPanel,
  type GenerationResult,
} from "@/components/results-panel";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string; detail?: string })
    | null;

  if (!res.ok) {
    const message =
      data?.error ?? `Request to ${url} failed with HTTP ${res.status}`;
    const detail = data?.detail;
    throw new Error(detail ? `${message} — ${detail}` : message);
  }
  if (data === null) throw new Error(`Empty response from ${url}`);
  return data;
}

export function CampaignDashboard() {
  const [productBlob, setProductBlob] = React.useState<UploadedBlob | null>(null);
  const [modelBlob, setModelBlob] = React.useState<UploadedBlob | null>(null);
  const [result, setResult] = React.useState<GenerationResult | null>(null);
  const [progressLabel, setProgressLabel] = React.useState<string | null>(null);
  const [pinterestStatus, setPinterestStatus] =
    React.useState<PinterestStatusResponse | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);

  // Check Pinterest connectivity once on mount.
  React.useEffect(() => {
    fetch("/api/pinterest/status")
      .then((r) => r.json())
      .then((data: PinterestStatusResponse) => setPinterestStatus(data))
      .catch(() => setPinterestStatus(null));
  }, []);

  const pinterestConnected = pinterestStatus?.connected ?? false;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      productTitle: "",
      shortDescription: "",
      primaryKeywords: "",
      affiliateLink: "",
      platforms: ["facebook", "pinterest"],
    },
  });

  const onSubmit = async (values: CampaignFormValues) => {
    if (!productBlob || !modelBlob) {
      toast.error("Both images are required", {
        description:
          "Upload a Product Image and a Model/Base Image before generating.",
      });
      return;
    }

    setResult(null);

    const sharedInput = {
      productTitle: values.productTitle,
      shortDescription: values.shortDescription,
      primaryKeywords: values.primaryKeywords,
      platforms: values.platforms,
    };

    try {
      // Phase 1 — live keyword research (Google Autocomplete / Trends /
      // DuckDuckGo). Best-effort: an empty result never blocks generation.
      setProgressLabel("Researching live keyword demand (Google Trends)");
      const seeds = [
        ...values.primaryKeywords
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
        values.productTitle,
      ].slice(0, 5);

      let research: ResearchKeywordsResponse = {
        keywords: [],
        activeSources: [],
      };
      try {
        research = await postJson<ResearchKeywordsResponse>(
          "/api/research-keywords",
          { seeds }
        );
        if (research.keywords.length > 0) {
          toast.success(
            `Found ${research.keywords.length} trending keywords`,
            {
              description: `Sources: ${research.activeSources.join(", ")} — captions will target these.`,
            }
          );
        } else {
          toast.info("Keyword research returned no extra terms", {
            description: "Continuing with your primary keywords only.",
          });
        }
      } catch (err) {
        toast.warning("Keyword research unavailable", {
          description:
            err instanceof Error ? err.message : "Continuing without it.",
        });
      }

      // Phase 2 — fire both generation pipelines in parallel.
      setProgressLabel("Merging images with NVIDIA SDXL + sharp");

      const imagesPromise = postJson<GenerateImagesResponse>(
        "/api/generate-images",
        {
          ...sharedInput,
          productImageUrl: productBlob.url,
          modelImageUrl: modelBlob.url,
        }
      );
      const copyPromise = postJson<MarketingCopy>("/api/generate-text", {
        ...sharedInput,
        affiliateLink: values.affiliateLink,
        researchedKeywords: research.keywords.map((k) => ({
          term: k.term,
          score: k.score,
          rising: k.rising,
        })),
      });

      copyPromise
        .then(() => setProgressLabel("Finalizing platform image crops"))
        .catch(() => {});

      const [imagesSettled, copySettled] = await Promise.allSettled([
        imagesPromise,
        copyPromise,
      ]);

      if (
        imagesSettled.status === "rejected" &&
        copySettled.status === "rejected"
      ) {
        throw new Error(
          `Both pipelines failed. Images: ${imagesSettled.reason?.message}. Copy: ${copySettled.reason?.message}`
        );
      }

      if (imagesSettled.status === "rejected") {
        toast.error("Image pipeline failed", {
          description: String(imagesSettled.reason?.message ?? "Unknown error"),
        });
      }
      if (copySettled.status === "rejected") {
        toast.error("Caption pipeline failed", {
          description: String(copySettled.reason?.message ?? "Unknown error"),
        });
      }

      const imagesResult =
        imagesSettled.status === "fulfilled" ? imagesSettled.value : null;
      const copyResult =
        copySettled.status === "fulfilled" ? copySettled.value : null;

      const generation: GenerationResult = {
        images: imagesResult?.images ?? [],
        aiBackdropUsed: imagesResult?.aiBackdropUsed ?? false,
        copy: copyResult,
        affiliateLink: values.affiliateLink,
        platforms: values.platforms,
        researchedKeywords: research.keywords,
        pinterestPin: null,
      };
      setResult(generation);

      if (imagesResult && copyResult) {
        toast.success("Marketing assets generated!", {
          description: "Images and captions are ready below.",
        });
      } else {
        toast.warning("Partial result", {
          description:
            "One pipeline failed — the successful output is shown below. Retry for the rest.",
        });
      }
    } catch (err) {
      console.error("[generate] fatal:", err);
      toast.error("Generation failed", {
        description:
          err instanceof Error
            ? err.message
            : "Unexpected error. Check server logs and API keys.",
      });
    } finally {
      setProgressLabel(null);
    }
  };

  /** Manual publish from the Pinterest tab (auto-post off or failed). */
  const publishPinterest = async () => {
    if (!result) return;
    const pinImage = result.images.find((img) => img.platform === "pinterest");
    if (!pinImage || !result.copy) {
      toast.error("Nothing to publish", {
        description: "Generate a Pinterest creative and caption first.",
      });
      return;
    }
    setIsPublishing(true);
    try {
      const published = await postJson<PinterestPublishResponse>(
        "/api/pinterest/publish",
        {
          title: result.copy.pinterestDescription.slice(0, 100),
          description: [
            result.copy.pinterestDescription,
            result.copy.pinterestHashtags.join(" "),
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 800),
          link: result.affiliateLink,
          imageUrl: pinImage.url,
        }
      );
      setResult({ ...result, pinterestPin: published.pin });
      toast.success("Pin published to Pinterest! 📌", {
        description: published.pin.url,
        action: {
          label: "View Pin",
          onClick: () => window.open(published.pin.url, "_blank"),
        },
      });
    } catch (err) {
      toast.error("Pinterest publish failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const platformOptions: Array<{
    id: Platform;
    label: string;
    sub: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "facebook",
      label: "Facebook",
      sub: "1080×1080 · 1:1",
      icon: <Facebook className="h-4 w-4 text-[#1877F2]" />,
    },
    {
      id: "pinterest",
      label: "Pinterest",
      sub: "1000×1500 · 2:3",
      icon: <Pin className="h-4 w-4 text-[#E60023]" />,
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
      {/* ---------------- Input form ---------------- */}
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Campaign Inputs</CardTitle>
          <CardDescription>
            Upload your source images and describe the product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            noValidate
          >
            {/* Upload zones */}
            <div className="grid grid-cols-2 gap-4">
              <ImageDropzone
                label="Product Image"
                hint="The item you're promoting"
                kind="product"
                value={productBlob}
                onChange={setProductBlob}
                disabled={isSubmitting}
              />
              <ImageDropzone
                label="Model / Base Image"
                hint="Lifestyle or model backdrop"
                kind="model"
                value={modelBlob}
                onChange={setModelBlob}
                disabled={isSubmitting}
              />
            </div>

            {/* Text inputs */}
            <div className="space-y-1.5">
              <Label htmlFor="productTitle" className="flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
                Product Title
              </Label>
              <Input
                id="productTitle"
                placeholder="e.g. LumaGlow Vitamin C Serum"
                disabled={isSubmitting}
                {...register("productTitle")}
              />
              {errors.productTitle && (
                <p className="text-xs text-destructive">
                  {errors.productTitle.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shortDescription">Short Description</Label>
              <Textarea
                id="shortDescription"
                rows={3}
                placeholder="What it does, who it's for, and the #1 benefit…"
                disabled={isSubmitting}
                {...register("shortDescription")}
              />
              {errors.shortDescription && (
                <p className="text-xs text-destructive">
                  {errors.shortDescription.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="primaryKeywords"
                className="flex items-center gap-1.5"
              >
                <Tags className="h-3.5 w-3.5 text-muted-foreground" />
                Primary Keywords
              </Label>
              <Input
                id="primaryKeywords"
                placeholder="skincare, vitamin c serum, glowing skin"
                disabled={isSubmitting}
                {...register("primaryKeywords")}
              />
              <p className="text-[11px] text-muted-foreground">
                Comma-separated — used for SEO captions and hashtags.
              </p>
              {errors.primaryKeywords && (
                <p className="text-xs text-destructive">
                  {errors.primaryKeywords.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="affiliateLink"
                className="flex items-center gap-1.5"
              >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                Affiliate Link
              </Label>
              <Input
                id="affiliateLink"
                type="url"
                inputMode="url"
                placeholder="https://your-affiliate-link.com/product?ref=you"
                disabled={isSubmitting}
                {...register("affiliateLink")}
              />
              {errors.affiliateLink && (
                <p className="text-xs text-destructive">
                  {errors.affiliateLink.message}
                </p>
              )}
            </div>

            {/* Platforms */}
            <div className="space-y-2">
              <Label>Target Platforms</Label>
              <Controller
                control={control}
                name="platforms"
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-3">
                    {platformOptions.map((opt) => {
                      const checked = field.value.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                            checked
                              ? "border-primary/50 bg-primary/5"
                              : "hover:bg-accent/50"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isSubmitting}
                            onCheckedChange={(state) => {
                              field.onChange(
                                state === true
                                  ? [...field.value, opt.id]
                                  : field.value.filter((p) => p !== opt.id)
                              );
                            }}
                          />
                          <div className="flex items-center gap-2">
                            {opt.icon}
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {opt.label}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {opt.sub}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {errors.platforms && (
                <p className="text-xs text-destructive">
                  {errors.platforms.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles />
                  Generate Marketing Assets
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ---------------- Results ---------------- */}
      <div className="min-w-0">
        <ResultsPanel
          result={result}
          isGenerating={isSubmitting}
          progressLabel={progressLabel}
          pinterestConnected={pinterestConnected}
          onPublishPinterest={publishPinterest}
          isPublishing={isPublishing}
        />
      </div>
    </div>
  );
}
