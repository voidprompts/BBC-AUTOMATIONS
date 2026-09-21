import { Zap } from "lucide-react";
import { CampaignDashboard } from "@/components/campaign-dashboard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">
                BBC Automations
              </h1>
              <p className="text-xs text-muted-foreground">
                AI Social Asset Studio · NVIDIA NIM
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border px-3 py-1 text-xs text-muted-foreground sm:inline-block">
            Facebook 1:1 · Pinterest 2:3
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Turn one product photo into{" "}
            <span className="text-primary">high-converting</span> social
            assets
          </h2>
          <p className="mt-2 text-muted-foreground">
            Upload a product image and a model backdrop — we merge them with
            NVIDIA Stable Diffusion XL, crop platform-perfect creatives with
            sharp, and write SEO-optimized captions with Llama 3.1 405B.
          </p>
        </div>

        <CampaignDashboard />
      </div>

      <footer className="border-t py-6">
        <p className="text-center text-xs text-muted-foreground">
          Built with Next.js · Vercel Blob · NVIDIA NIM — images are
          AI-generated marketing assets.
        </p>
      </footer>
    </main>
  );
}
