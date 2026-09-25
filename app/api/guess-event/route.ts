import { NextResponse } from "next/server"
import { handleGuessEventPost } from "@/lib/guessEvent"
import { createGuessEventStore } from "@/lib/supabase/guessEventStore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleGuessEventPost(request, createGuessEventStore())
  } catch {
    return NextResponse.json(
      { error: "Guess persistence is temporarily unavailable. Please retry." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
