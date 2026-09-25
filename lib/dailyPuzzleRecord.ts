import { validatePuzzle } from "./gameLogic"

export interface DailyPuzzle {
  id: string | number
  puzzle_date: string
  row_criteria: string[]
  column_criteria: string[]
  created_at: string
}

export function parseDailyPuzzle(value: unknown, date: string): DailyPuzzle {
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

