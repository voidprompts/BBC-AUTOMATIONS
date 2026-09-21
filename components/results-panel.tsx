"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  Hash,
  Loader2,
  Pin,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  PLATFORM_SPECS,
  type GeneratedImage,
  type KeywordSuggestionDto,
  type MarketingCopy,
  type Platform,
} from "@/lib/schemas";
import { cn, truncate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface GenerationResult {
  images: GeneratedImage[];
  copy: MarketingCopy | null;
  aiBackdropUsed: boolean;
  affiliateLink: string;
  platforms: Platform[];
  /** Live keywords used to optimize the captions. */
  researchedKeywords: KeywordSuggestionDto[];
  /** Set when the pin was auto-published to Pinterest. */
  pinterestPin: { id: string; url: string } | null;
}

interface ResultsPanelProps {
  result: GenerationResult | null;
  isGenerating: boolean;
  progressLabel: string | null;
  /** Whether a Pinterest token is connected server-side. */
  pinterestConnected: boolean;
  /** Manual publish trigger (used when auto-post is off or failed). */
  onPublishPinterest: () => Promise<void>;
  isPublishing: boolean;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard access denied by the browser.");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="text-green-600" /> : <Copy />}
      {copied ? "Copied" : "Copy Text"}
    </Button>
  );
}

function DownloadButton({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) {
  const [downloading, setDownloading] = React.useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Downloaded ${fileName}`);
    } catch (err) {
      toast.error("Download failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button type="button" size="sm" onClick={download} disabled={downloading}>
      {downloading ? <Loader2 className="animate-spin" /> : <Download />}
      Download Image
    </Button>
  );
}

function HashtagCloud({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="font-normal">
          <Hash className="mr-0.5 h-3 w-3" />
          {tag.replace(/^#/, "")}
        </Badge>
      ))}
    </div>
  );
}

function AffiliatePreview({ link }: { link: string }) {
  let host = link;
  try {
    host = new URL(link).hostname;
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
      className="group flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Destination · {host}
        </p>
        <p className="truncate text-sm text-primary underline-offset-2 group-hover:underline">
          {truncate(link, 64)}
        </p>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
    </a>
  );
}

function PlatformResult({
  platform,
  image,
  copyText,
  hashtags,
  affiliateLink,
}: {
  platform: Platform;
  image: GeneratedImage | undefined;
  copyText: string | undefined;
  hashtags: string[];
  affiliateLink: string;
}) {
  const spec = PLATFORM_SPECS[platform];
  const copyLabel =
    platform === "facebook" ? "Ad copy" : "Pin description";
  const fullText = [copyText, hashtags.join(" ")].filter(Boolean).join("\n\n");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Image column */}
      <div className="space-y-3">
        <div
          className={cn(
            "relative mx-auto w-full overflow-hidden rounded-lg border bg-muted",
            platform === "facebook" ? "max-w-md aspect-square" : "max-w-sm aspect-[2/3]"
          )}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={`${spec.label} creative`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Image not generated for this platform.
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline">
            {spec.width}×{spec.height} · {spec.ratioLabel}
          </Badge>
          {image && (
            <DownloadButton
              url={image.url}
              fileName={`${platform}-creative-${spec.width}x${spec.height}.jpg`}
            />
          )}
        </div>
      </div>

      {/* Copy column */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{copyLabel}</p>
          {fullText && <CopyButton text={fullText} label={copyLabel} />}
        </div>
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
          {copyText ?? (
            <span className="text-muted-foreground">
              No copy generated. Re-run generation to retry the caption
              pipeline.
            </span>
          )}
        </div>
        <HashtagCloud tags={hashtags} />
        <AffiliatePreview link={affiliateLink} />
      </div>
    </div>
  );
}

function KeywordInsights({ keywords }: { keywords: KeywordSuggestionDto[] }) {
  if (!keywords.length) return null;
  return (
    <div className="mt-6 rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <TrendingUp className="h-4 w-4 text-primary" />
        Live keyword research used for this campaign
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.slice(0, 16).map((kw) => (
          <Badge
            key={kw.term}
            variant={kw.rising ? "default" : "secondary"}
            className="gap-1 font-normal"
            title={`score ${kw.score} · sources: ${kw.sources.join(", ")}`}
          >
            {kw.rising && <TrendingUp className="h-3 w-3" />}
            {kw.term}
            <span className="opacity-60">· {kw.score}</span>
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Ranked by real-time demand from Google Autocomplete, Google Trends
        related queries, and DuckDuckGo Suggest.{" "}
        <TrendingUp className="inline h-3 w-3" /> = rising on Google Trends.
      </p>
    </div>
  );
}

export function ResultsPanel({
  result,
  isGenerating,
  progressLabel,
  pinterestConnected,
  onPublishPinterest,
  isPublishing,
}: ResultsPanelProps) {
  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Generating your marketing assets…
          </CardTitle>
          <CardDescription>
            {progressLabel ?? "Contacting NVIDIA NIM endpoints"} — this can
            take up to a minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="mx-auto aspect-square w-full max-w-md rounded-lg" />
            <Skeleton className="mx-auto h-8 w-48" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-6 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <p className="font-medium">Your generated assets will appear here</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload a product image and a model image, fill in the campaign
            details, then hit{" "}
            <span className="font-medium text-foreground">
              Generate Marketing Assets
            </span>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const imageFor = (p: Platform) =>
    result.images.find((img) => img.platform === p);
  const showFacebook = result.platforms.includes("facebook");
  const showPinterest = result.platforms.includes("pinterest");
  const defaultTab = showFacebook ? "facebook" : "pinterest";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Generated Assets</CardTitle>
            <CardDescription>
              Review, copy, and download your platform-ready creatives.
            </CardDescription>
          </div>
          {result.aiBackdropUsed && (
            <Badge className="gap-1">
              <Sparkles className="h-3 w-3" /> AI backdrop
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="facebook" disabled={!showFacebook}>
              <Facebook className="h-4 w-4" /> Facebook Ad
            </TabsTrigger>
            <TabsTrigger value="pinterest" disabled={!showPinterest}>
              <Pin className="h-4 w-4" /> Pinterest Pin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="facebook">
            <PlatformResult
              platform="facebook"
              image={imageFor("facebook")}
              copyText={result.copy?.facebookAdCopy}
              hashtags={result.copy?.facebookHashtags ?? []}
              affiliateLink={result.affiliateLink}
            />
          </TabsContent>

          <TabsContent value="pinterest">
            <PlatformResult
              platform="pinterest"
              image={imageFor("pinterest")}
              copyText={result.copy?.pinterestDescription}
              hashtags={result.copy?.pinterestHashtags ?? []}
              affiliateLink={result.affiliateLink}
            />

            {/* Auto-post status / manual publish */}
            <div className="mt-6 rounded-lg border p-4">
              {result.pinterestPin ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                      <Check className="h-4 w-4 text-green-600" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        Published to Pinterest
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pin ID: {result.pinterestPin.id}
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={result.pinterestPin.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink /> View Pin
                    </a>
                  </Button>
                </div>
              ) : pinterestConnected ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      Post this pin to Pinterest
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Publishes the creative above with its description and
                      affiliate link via the Pinterest API.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void onPublishPinterest()}
                    disabled={isPublishing || !imageFor("pinterest")}
                  >
                    {isPublishing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    {isPublishing ? "Publishing…" : "Publish to Pinterest"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Auto-posting unavailable:
                  </span>{" "}
                  set <code className="rounded bg-muted px-1">PINTEREST_ACCESS_TOKEN</code>{" "}
                  in your environment to publish pins directly from here
                  (create an app at developers.pinterest.com with{" "}
                  <code className="rounded bg-muted px-1">pins:write</code>{" "}
                  scope).
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <KeywordInsights keywords={result.researchedKeywords} />
      </CardContent>
    </Card>
  );
}
