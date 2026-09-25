import "server-only"

import { getValidatedRandomSeed, validatePuzzle } from "./gameLogic"
import { createSupabaseServerClient } from "./supabase/server"

export interface DailyPuzzle {
  id: string | number
  puzzle_date: string
  row_criteria: string[]
  column_criteria: string[]
  created_at: string
}

const PUZZLE_COLUMNS = "id,puzzle_date,row_criteria,column_criteria,created_at"

function assertPuzzleDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Puzzle date must be a valid YYYY-MM-DD date")
  }
}

function parseDailyPuzzle(value: unknown, date: string): DailyPuzzle {
  if (!value || typeof value !== "object") {
    throw new Error("Daily puzzle row is malformed")
  }

  const row = value as Record<string, unknown>
  if (
    (typeof row.id !== "string" && typeof row.id !== "number") ||
    row.puzzle_date !== date ||
    !Array.isArray(row.row_criteria) ||
    !row.row_criteria.every(key => typeof key === "string") ||
    !Array.isArray(row.column_criteria) ||
    !row.column_criteria.every(key => typeof key === "string") ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("Daily puzzle row is malformed")
  }

  const rows = row.row_criteria as string[]
  const cols = row.column_criteria as string[]
  if (!validatePuzzle({ rows, cols }).isValid) {
    throw new Error("Stored daily puzzle is not playable with the current runtime data")
  }

  return {
    id: row.id as string | number,
    puzzle_date: date,
    row_criteria: rows,
    column_criteria: cols,
    created_at: row.created_at,
  }
}

/** Reads or creates one validated puzzle for a UTC calendar date. */
export async function getOrCreateDailyPuzzle(date: string): Promise<DailyPuzzle> {
  assertPuzzleDate(date)
  const supabase = createSupabaseServerClient()

  const readExisting = async (): Promise<DailyPuzzle | null> => {
    const { data, error, status } = await supabase
      .schema("public")
      .from("daily_puzzles")
      .select(PUZZLE_COLUMNS)
      .eq("puzzle_date", date)
      .abortSignal(AbortSignal.timeout(15_000))
      .maybeSingle()

    if (error) {
      throw new Error(`Daily puzzle lookup failed (HTTP ${status}, code ${error.code || "unknown"})`)
    }
    return data ? parseDailyPuzzle(data, date) : null
  }

  const existing = await readExisting()
  if (existing) return existing

  const { seed, validation } = getValidatedRandomSeed()
  if (!validation.isValid) {
    throw new Error("Validated puzzle generator returned an invalid seed")
  }

  const { data, error, status } = await supabase
    .schema("public")
    .from("daily_puzzles")
    .insert({
      puzzle_date: date,
      row_criteria: seed.rows,
      column_criteria: seed.cols,
    })
    .select(PUZZLE_COLUMNS)
    .abortSignal(AbortSignal.timeout(15_000))
    .single()

  if (error) {
    if (error.code === "23505") {
      const concurrentPuzzle = await readExisting()
      if (concurrentPuzzle) return concurrentPuzzle
      throw new Error("Daily puzzle was created concurrently but could not be read back")
    }
    throw new Error(`Daily puzzle insert failed (HTTP ${status}, code ${error.code || "unknown"})`)
  }

  return parseDailyPuzzle(data, date)
}

