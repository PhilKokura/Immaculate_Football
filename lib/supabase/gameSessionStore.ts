import "server-only"

import {
  DuplicateGameSessionError,
  parseGameSessionRow,
  type GameSessionRequest,
  type GameSessionStore,
} from "../gameSession"
import { createSupabaseServerClient } from "./server"

const SESSION_COLUMNS = "id,puzzle_id,anonymous_session_id,guesses_used,correct_cells,completed,completed_at"

export function createGameSessionStore(): GameSessionStore {
  const supabase = createSupabaseServerClient()

  return {
    async puzzleExists(puzzleId: string): Promise<boolean> {
      const { data, error, status } = await supabase.schema("public")
        .from("daily_puzzles")
        .select("id")
        .eq("id", puzzleId)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle()
      if (error) {
        throw new Error(`Game session puzzle lookup failed (HTTP ${status}, code ${error.code || "unknown"})`)
      }
      return data !== null
    },

    async findSession(request: GameSessionRequest) {
      const { data, error, status } = await supabase.schema("public")
        .from("game_sessions")
        .select(SESSION_COLUMNS)
        .eq("puzzle_id", request.puzzleId)
        .eq("anonymous_session_id", request.anonymousSessionId)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle()
      if (error) {
        throw new Error(`Game session lookup failed (HTTP ${status}, code ${error.code || "unknown"})`)
      }
      return data ? parseGameSessionRow(data, request) : null
    },

    async insertSession(request: GameSessionRequest) {
      const { data, error, status } = await supabase.schema("public")
        .from("game_sessions")
        .insert({
          puzzle_id: request.puzzleId,
          anonymous_session_id: request.anonymousSessionId,
        })
        .select(SESSION_COLUMNS)
        .abortSignal(AbortSignal.timeout(15_000))
        .single()
      if (error?.code === "23505") throw new DuplicateGameSessionError()
      if (error) {
        throw new Error(`Game session insert failed (HTTP ${status}, code ${error.code || "unknown"})`)
      }
      return parseGameSessionRow(data, request)
    },
  }
}
