import "server-only"

import { getValidatedRandomSeed, satisfiesV1GenerationPolicy } from "./gameLogic"
import { createSupabaseServerClient } from "./supabase/server"

import { parseDailyPuzzle, type DailyPuzzle } from "./dailyPuzzleRecord"
export type { DailyPuzzle } from "./dailyPuzzleRecord"

const PUZZLE_COLUMNS = "id,puzzle_date,row_criteria,column_criteria,created_at"

function assertPuzzleDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Puzzle date must be a valid YYYY-MM-DD date")
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
  if (!satisfiesV1GenerationPolicy(seed, validation)) {
    throw new Error("Daily Puzzle generator returned a seed outside V1 policy")
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

