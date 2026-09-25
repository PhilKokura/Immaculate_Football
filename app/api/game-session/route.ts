import { NextResponse } from "next/server"
import { handleGameSessionPost } from "@/lib/gameSession"
import { createGameSessionStore } from "@/lib/supabase/gameSessionStore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleGameSessionPost(request, createGameSessionStore())
  } catch {
    return NextResponse.json(
      { error: "Game session is temporarily unavailable. Please retry." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
