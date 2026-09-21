import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPin,
  defaultBoardId,
  listBoards,
  PinterestError,
  PinterestNotConfiguredError,
} from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  boardId: z.string().min(1).optional(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(800),
  link: z.string().url(),
  imageUrl: z.string().url(),
  altText: z.string().max(500).optional(),
});

/**
 * Publish a generated Pinterest creative as a real pin via the
 * Pinterest API v5. Board resolution order:
 *   1. explicit boardId in the request
 *   2. PINTEREST_BOARD_ID env default
 *   3. first board on the account
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
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 }
    );
  }

  try {
    let boardId = parsed.data.boardId ?? defaultBoardId();
    if (!boardId) {
      const boards = await listBoards();
      if (boards.length === 0) {
        return NextResponse.json(
          {
            error: "No Pinterest board found",
            detail:
              "Create a board on your Pinterest account (or set PINTEREST_BOARD_ID) and retry.",
          },
          { status: 400 }
        );
      }
      boardId = boards[0].id;
    }

    const pin = await createPin({ ...parsed.data, boardId });
    return NextResponse.json({ pin });
  } catch (error) {
    console.error("[pinterest/publish] failed:", error);

    if (error instanceof PinterestNotConfiguredError) {
      return NextResponse.json(
        { error: "Pinterest not connected", detail: error.message },
        { status: 501 }
      );
    }
    if (error instanceof PinterestError) {
      const status =
        error.status === 401 || error.status === 403
          ? 401
          : error.status === 429
            ? 429
            : 502;
      return NextResponse.json(
        { error: "Pinterest publish failed", detail: error.message },
        { status }
      );
    }
    return NextResponse.json(
      {
        error: "Pinterest publish failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
