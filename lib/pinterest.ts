import "server-only";

/**
 * Pinterest API v5 client — board listing + pin creation.
 * Docs: https://developers.pinterest.com/docs/api/v5/
 *
 * Requires PINTEREST_ACCESS_TOKEN with scopes:
 *   boards:read, pins:read, pins:write
 * (Sandbox tokens work against api-sandbox.pinterest.com — override
 *  with PINTEREST_API_BASE if needed.)
 */

const FETCH_TIMEOUT_MS = 20_000;

export class PinterestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "PinterestError";
  }
}

export class PinterestNotConfiguredError extends Error {
  constructor() {
    super(
      "Pinterest is not connected. Set PINTEREST_ACCESS_TOKEN in your environment " +
        "(create an app at developers.pinterest.com with pins:write + boards:read scopes)."
    );
    this.name = "PinterestNotConfiguredError";
  }
}

function apiBase(): string {
  return process.env.PINTEREST_API_BASE ?? "https://api.pinterest.com/v5";
}

function accessToken(): string {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token || token.trim() === "" || token.includes("xxxxxxxx")) {
    throw new PinterestNotConfiguredError();
  }
  return token;
}

/** True when a Pinterest token is configured (placeholder-aware). */
export function isPinterestConfigured(): boolean {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  return Boolean(token && token.trim() !== "" && !token.includes("xxxxxxxx"));
}

async function pinterestFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message =
        (typeof body.message === "string" && body.message) ||
        `Pinterest API responded ${res.status}`;
      throw new PinterestError(message, res.status);
    }
    return body as T;
  } catch (err) {
    if (err instanceof PinterestError || err instanceof PinterestNotConfiguredError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new PinterestError("Pinterest API request timed out.", 408);
    }
    throw new PinterestError(
      err instanceof Error ? err.message : "Pinterest API unreachable"
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Boards                                                              */
/* ------------------------------------------------------------------ */

export interface PinterestBoard {
  id: string;
  name: string;
  privacy: string;
}

export async function listBoards(): Promise<PinterestBoard[]> {
  const data = await pinterestFetch<{
    items?: Array<{ id: string; name: string; privacy?: string }>;
  }>("/boards?page_size=100");
  return (data.items ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    privacy: b.privacy ?? "PUBLIC",
  }));
}

/* ------------------------------------------------------------------ */
/* Pins                                                                */
/* ------------------------------------------------------------------ */

export interface CreatePinInput {
  boardId: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
  altText?: string;
}

export interface CreatedPin {
  id: string;
  url: string;
}

export async function createPin(input: CreatePinInput): Promise<CreatedPin> {
  const data = await pinterestFetch<{ id: string }>("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: input.boardId,
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 800),
      link: input.link,
      alt_text: (input.altText ?? input.title).slice(0, 500),
      media_source: {
        source_type: "image_url",
        url: input.imageUrl,
      },
    }),
  });

  return { id: data.id, url: `https://www.pinterest.com/pin/${data.id}/` };
}

/** Default board from env, if configured. */
export function defaultBoardId(): string | null {
  const id = process.env.PINTEREST_BOARD_ID;
  return id && id.trim() !== "" && !id.includes("xxxxxxxx") ? id : null;
}
