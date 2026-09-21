# BBC-AUTOMATIONS — AI Social Asset Studio

Production-ready web app that turns a **product image + model image + affiliate link** into high-converting **Facebook (1:1)** and **Pinterest (2:3)** marketing assets using **NVIDIA NIM** endpoints.

## ✨ Features

- **Dashboard** — dual drag-and-drop upload zones (Product / Model image), campaign text inputs, platform checkboxes, loading states, toast alerts.
- **Serverless uploads** (`/api/upload`) — secure client → Vercel Blob uploads with short-lived scoped tokens; any image format (PNG, JPEG, WebP, GIF, AVIF, HEIC…), 12 MB max — `sharp` normalizes formats downstream.
- **AI image pipeline** (`/api/generate-images`) — NVIDIA SDXL NIM generates a lifestyle backdrop, `sharp` composites the product with a soft drop shadow, then renders:
  - Facebook: **1080×1080** (1:1) smart cover crop
  - Pinterest: **1000×1500** (2:3) smart cover crop
  - Finals uploaded back to Vercel Blob with permanent URLs.
  - Graceful fallback: if the image NIM is unavailable, the model image alone is used as the backdrop — the pipeline never hard-fails on that step.
- **SEO caption pipeline** (`/api/generate-text`) — OpenAI SDK pointed at `https://integrate.api.nvidia.com/v1` with `nvidia/llama-3.1-405b-instruct`. Strict JSON contract validated with Zod:
  - `facebookAdCopy` (hook → benefits → CTA → affiliate link)
  - `pinterestDescription` (keyword-optimized + hashtags)
  - `facebookHashtags[]` / `pinterestHashtags[]`
- **Results canvas** — tabbed Facebook/Pinterest previews, Copy Text buttons, Download Image buttons, clickable affiliate-link preview.
- **Live keyword research** (`/api/research-keywords`) — scrapes real-time search demand from **Google Autocomplete**, **Google Trends related queries** (top + rising/breakout), and **DuckDuckGo Suggest**; terms are scored, cross-source corroborated, and injected into the LLM prompt so captions/hashtags target what people search **right now**. The used keywords are shown as a ranked insight panel under the results.
- **Pinterest auto-posting** (`/api/pinterest/publish` + `/status`) — publishes the generated 1000×1500 creative as a real pin (title, SEO description + hashtags, affiliate link) via the **Pinterest API v5**. Auto-posts right after generation (toggleable) or manually from the Pinterest tab; returns the live pin URL.

## 🧱 Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS · shadcn/ui (Radix) · Lucide · React Hook Form + Zod · `@vercel/blob` · `sharp` · OpenAI SDK → NVIDIA NIM · Sonner toasts.

## 🚀 Getting started

```bash
npm install
cp .env.example .env.local   # fill in the two required secrets
npm run dev
```

### Required environment variables

| Variable | Where to get it |
| --- | --- |
| `NVIDIA_API_KEY` | Free at [build.nvidia.com](https://build.nvidia.com/) — format `nvapi-…` |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Project → Storage → Blob (free tier) |

### Optional — Pinterest auto-posting

| Variable | Purpose |
| --- | --- |
| `PINTEREST_ACCESS_TOKEN` | Token from [developers.pinterest.com](https://developers.pinterest.com/) with `boards:read`, `pins:read`, `pins:write` scopes |
| `PINTEREST_BOARD_ID` | Target board (defaults to the account's first board) |
| `PINTEREST_API_BASE` | Set to `https://api-sandbox.pinterest.com/v5` for sandbox testing |

Other overrides: `NVIDIA_BASE_URL`, `NVIDIA_TEXT_MODEL`, `NVIDIA_IMAGE_MODEL` (see `.env.example`).

> **Local dev note:** client-side Blob uploads use your deployed `/api/upload` token mint. Locally they work as long as `BLOB_READ_WRITE_TOKEN` is set in `.env.local`.

## 🗂️ Project structure

```
app/
  page.tsx                     # Dashboard page
  layout.tsx                   # Root layout + Sonner toaster
  api/
    upload/route.ts            # Vercel Blob client-upload token mint
    generate-images/route.ts   # SDXL NIM → sharp → Blob pipeline
    generate-text/route.ts     # Llama 3.1 405B NIM → JSON captions
    research-keywords/route.ts # Google Trends / Autocomplete / DDG research
    pinterest/status/route.ts  # Pinterest connection + boards
    pinterest/publish/route.ts # Create real pins via Pinterest API v5
components/
  campaign-dashboard.tsx       # Form + orchestration (RHF + Zod)
  image-dropzone.tsx           # Drag-and-drop uploader
  results-panel.tsx            # Tabbed previews, copy/download
  ui/                          # shadcn/ui primitives
lib/
  env.ts                       # Type-safe env access (server-only)
  schemas.ts                   # Shared Zod schemas & platform specs
  nvidia.ts                    # NIM text + image clients
  image-processing.ts          # sharp composite & platform crops
  keyword-research.ts          # Multi-source keyword demand aggregation
  pinterest.ts                 # Pinterest API v5 client (boards + pins)
```

## 🔒 Error handling

- Every API route validates input with Zod and returns a `{ error, detail }` envelope.
- NIM timeouts (90s text / 120s image) surface as user-friendly toasts.
- Image and caption pipelines run in parallel; if one fails you still get the other (partial-result toast).

## ☁️ Deploy

One-click on Vercel: connect the repo, add the two env vars, create a Blob store, deploy. `maxDuration` is set on the generation routes for Pro-plan long-running functions.
