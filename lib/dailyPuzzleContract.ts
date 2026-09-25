import { getCriterion, type GameCriterion } from "@/components/data/gameData"

export interface DailyPuzzlePayload {
  id: string | number
  puzzleDate: string
  rowCriteria: string[]
  columnCriteria: string[]
}

export interface ResolvedDailyPuzzle {
  id: string | number
  puzzleDate: string
  rows: GameCriterion[]
  columns: GameCriterion[]
}

/** One UTC date boundary for every Daily Puzzle request. */
export function getUtcDailyPuzzleDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function toDailyPuzzlePayload(row: {
  id: string | number
  puzzle_date: string
  row_criteria: string[]
  column_criteria: string[]
}): DailyPuzzlePayload {
  return {
    id: row.id,
    puzzleDate: row.puzzle_date,
    rowCriteria: [...row.row_criteria],
    columnCriteria: [...row.column_criteria],
  }
}

export function resolveDailyPuzzlePayload(value: unknown): ResolvedDailyPuzzle {
  if (!value || typeof value !== "object") {
    throw new Error("Daily Puzzle response is malformed")
  }

  const payload = value as Record<string, unknown>
  if (
    (typeof payload.id !== "string" && typeof payload.id !== "number") ||
    typeof payload.puzzleDate !== "string" ||
    !Array.isArray(payload.rowCriteria) ||
    payload.rowCriteria.length !== 3 ||
    !payload.rowCriteria.every(key => typeof key === "string") ||
    !Array.isArray(payload.columnCriteria) ||
    payload.columnCriteria.length !== 3 ||
    !payload.columnCriteria.every(key => typeof key === "string")
  ) {
    throw new Error("Daily Puzzle response is malformed")
  }

  const resolve = (key: string): GameCriterion => {
    const criterion = getCriterion(key)
    if (!criterion) throw new Error(`Unknown Daily Puzzle criterion: ${key}`)
    return criterion
  }

  return {
    id: payload.id,
    puzzleDate: payload.puzzleDate,
    rows: (payload.rowCriteria as string[]).map(resolve),
    columns: (payload.columnCriteria as string[]).map(resolve),
  }
}
