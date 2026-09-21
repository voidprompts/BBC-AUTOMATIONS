import { NextResponse } from "next/server";
import {
  defaultBoardId,
  isPinterestConfigured,
  listBoards,
  PinterestError,
} from "@/lib/pinterest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pinterest connection status + available boards.
 * Used by the dashboard to decide whether to show the auto-post UI.
 */
export async function GET(): Promise<NextResponse> {
  if (!isPinterestConfigured()) {
    return NextResponse.json({
      connected: false,
      boards: [],
      defaultBoardId: null,
    });
  }

  try {
    const boards = await listBoards();
    return NextResponse.json({
      connected: true,
      boards,
      defaultBoardId: defaultBoardId(),
    });
  } catch (error) {
    console.error("[pinterest/status] failed:", error);
    const detail =
      error instanceof PinterestError ? error.message : "Unknown error";
    // Token present but invalid/expired — report as disconnected with a hint.
    return NextResponse.json({
      connected: false,
      boards: [],
      defaultBoardId: null,
      detail,
    });
  }
}
