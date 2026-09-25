import { NextResponse } from "next/server"
import { getOrCreateDailyPuzzle } from "@/lib/dailyPuzzle"
import {
  getUtcDailyPuzzleDate,
  toDailyPuzzlePayload,
} from "@/lib/dailyPuzzleContract"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const puzzle = await getOrCreateDailyPuzzle(getUtcDailyPuzzleDate())
    return NextResponse.json(toDailyPuzzlePayload(puzzle), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "Daily Puzzle is temporarily unavailable. Please retry." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}
