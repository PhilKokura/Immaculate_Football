import "server-only"

import {
  GuessPersistenceError,
  type GuessEventRequest,
  type GuessEventStore,
  type StoredGuessEvent,
} from "../guessEvent"
import { isUuidString } from "../gameSession"
import { createSupabaseServerClient } from "./server"

function parseRpcResult(value: unknown, input: GuessEventRequest): StoredGuessEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Guess RPC response is malformed")
  }
  const row = value as Record<string, unknown>
  if (
    row.event_id !== input.eventId || typeof row.correct !== "boolean" ||
    typeof row.guesses_used !== "number" || !Number.isInteger(row.guesses_used) ||
    typeof row.correct_cells !== "number" || !Number.isInteger(row.correct_cells) ||
    typeof row.completed !== "boolean" ||
    (row.completed_at !== null && typeof row.completed_at !== "string")
  ) {
    throw new Error("Guess RPC response is malformed")
  }
  return {
    eventId: input.eventId,
    correct: row.correct,
    guessesUsed: row.guesses_used,
    correctCells: row.correct_cells,
    completed: row.completed,
    completedAt: row.completed_at,
  }
}

export function createGuessEventStore(): GuessEventStore {
  const supabase = createSupabaseServerClient()

  return {
    async getSession(sessionId) {
      const { data, error, status } = await supabase.schema("public")
        .from("game_sessions")
        .select("puzzle_id")
        .eq("id", sessionId)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle()
      if (error) throw new Error(`Guess session lookup failed (HTTP ${status}, code ${error.code || "unknown"})`)
      if (!data) return null
      if (!isUuidString(data.puzzle_id)) throw new Error("Guess session row is malformed")
      return { puzzleId: data.puzzle_id }
    },

    async getPuzzle(puzzleId) {
      const { data, error, status } = await supabase.schema("public")
        .from("daily_puzzles")
        .select("row_criteria,column_criteria")
        .eq("id", puzzleId)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle()
      if (error) throw new Error(`Guess puzzle lookup failed (HTTP ${status}, code ${error.code || "unknown"})`)
      if (!data) return null
      if (!Array.isArray(data.row_criteria) || !Array.isArray(data.column_criteria)) {
        throw new Error("Guess puzzle row is malformed")
      }
      return { rows: data.row_criteria as string[], columns: data.column_criteria as string[] }
    },

    async recordGuess(input, correct) {
      const { data, error, status } = await supabase.schema("public")
        .rpc("record_guess_event", {
          p_event_id: input.eventId,
          p_session_id: input.sessionId,
          p_puzzle_id: input.puzzleId,
          p_cell_index: input.cellIndex,
          p_player_id: input.playerId,
          p_correct: correct,
        })
        .abortSignal(AbortSignal.timeout(15_000))
        .single()
      if (error) {
        const code = error.code
        if (code === "FG001" || code === "23514") throw new GuessPersistenceError(400)
        if (["FG002", "FG006", "FG007", "23503"].includes(code)) throw new GuessPersistenceError(404)
        if (["FG003", "FG004", "FG005", "FG008", "FG009", "23505"].includes(code)) {
          throw new GuessPersistenceError(409)
        }
        throw new Error(`Guess RPC failed (HTTP ${status}, code ${code || "unknown"})`)
      }
      return parseRpcResult(data, input)
    },
  }
}
