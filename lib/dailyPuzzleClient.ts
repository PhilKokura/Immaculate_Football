import { createGameProgress, type GameProgress } from "./gameSubmission"
import {
  resolveDailyPuzzlePayload,
  type ResolvedDailyPuzzle,
} from "./dailyPuzzleContract"

export interface DailyGameState {
  puzzle: ResolvedDailyPuzzle
  progress: GameProgress
}

/** Fetches only the persisted Daily Puzzle; there is no local generation path. */
export async function loadDailyPuzzle(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedDailyPuzzle> {
  const response = await fetcher("/api/daily-puzzle", {
    cache: "no-store",
    signal,
  })
  if (!response.ok) {
    throw new Error("Could not load the Daily Puzzle. Please try again.")
  }
  return resolveDailyPuzzlePayload(await response.json())
}

export function createDailyGameState(puzzle: ResolvedDailyPuzzle): DailyGameState {
  return { puzzle, progress: createGameProgress() }
}

export function resetDailyGameState(state: DailyGameState): DailyGameState {
  return { puzzle: state.puzzle, progress: createGameProgress() }
}
