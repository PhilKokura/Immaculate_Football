import { createDailyGameState, resetDailyGameState, type DailyGameState } from "./dailyPuzzleClient"
import type { ResolvedDailyPuzzle } from "./dailyPuzzleContract"
import { submitPlayerSelection } from "./gameSubmission"
import type { PlayerWithImage } from "./gameLogic"

export type SessionPersistenceStatus = "idle" | "pending" | "ready" | "error"

export interface PendingGuessEvent {
  eventId: string
  cellIndex: number
  playerId: string
}

export interface DailyGameRun {
  dailyGame: DailyGameState
  anonymousSessionId: string
  gameSessionId: string | null
  sessionPersistenceStatus: SessionPersistenceStatus
  pendingGuessEvents: PendingGuessEvent[]
  guessPersistenceError: boolean
}

export function createDailyGameRun(
  puzzle: ResolvedDailyPuzzle,
  newId: () => string = () => crypto.randomUUID(),
): DailyGameRun {
  return {
    dailyGame: createDailyGameState(puzzle),
    anonymousSessionId: newId(),
    gameSessionId: null,
    sessionPersistenceStatus: "idle",
    pendingGuessEvents: [],
    guessPersistenceError: false,
  }
}

export function resetDailyGameRun(
  run: DailyGameRun,
  newId: () => string = () => crypto.randomUUID(),
): DailyGameRun {
  return {
    dailyGame: resetDailyGameState(run.dailyGame),
    anonymousSessionId: newId(),
    gameSessionId: null,
    sessionPersistenceStatus: "idle",
    pendingGuessEvents: [],
    guessPersistenceError: false,
  }
}

export function submitDailyGameRunGuess(
  run: DailyGameRun,
  player: PlayerWithImage,
  cellId: string,
  newEventId: () => string = () => crypto.randomUUID(),
): { run: DailyGameRun; attemptConsumed: boolean; shouldCreateSession: boolean } {
  const { puzzle, progress } = run.dailyGame
  const nextProgress = submitPlayerSelection(
    progress,
    {
      rows: puzzle.rows.map(criterion => criterion.key),
      cols: puzzle.columns.map(criterion => criterion.key),
    },
    player,
    cellId,
  )
  const attemptConsumed = nextProgress.guesses > progress.guesses
  const shouldCreateSession = attemptConsumed && !run.gameSessionId &&
    (run.sessionPersistenceStatus === "idle" || run.sessionPersistenceStatus === "error")
  const [row, column] = cellId.split("-").map(Number)
  const pendingGuessEvents = attemptConsumed
    ? [...run.pendingGuessEvents, { eventId: newEventId(), cellIndex: row * 3 + column, playerId: player.id }]
    : run.pendingGuessEvents

  return {
    run: {
      ...run,
      dailyGame: { puzzle, progress: nextProgress },
      sessionPersistenceStatus: shouldCreateSession ? "pending" : run.sessionPersistenceStatus,
      pendingGuessEvents,
      guessPersistenceError: attemptConsumed ? false : run.guessPersistenceError,
    },
    attemptConsumed,
    shouldCreateSession,
  }
}

export function attachGameSession(
  run: DailyGameRun,
  anonymousSessionId: string,
  gameSessionId: string,
): DailyGameRun {
  if (run.anonymousSessionId !== anonymousSessionId) return run
  return { ...run, gameSessionId, sessionPersistenceStatus: "ready" }
}

export function markGameSessionPersistenceFailed(
  run: DailyGameRun,
  anonymousSessionId: string,
): DailyGameRun {
  if (run.anonymousSessionId !== anonymousSessionId) return run
  return { ...run, sessionPersistenceStatus: "error" }
}

export function markGuessEventPersisted(
  run: DailyGameRun,
  anonymousSessionId: string,
  eventId: string,
): DailyGameRun {
  if (run.anonymousSessionId !== anonymousSessionId) return run
  return {
    ...run,
    pendingGuessEvents: run.pendingGuessEvents.filter(event => event.eventId !== eventId),
    guessPersistenceError: false,
  }
}

export function markGuessPersistenceFailed(run: DailyGameRun, anonymousSessionId: string): DailyGameRun {
  if (run.anonymousSessionId !== anonymousSessionId) return run
  return {
    ...run,
    sessionPersistenceStatus: run.gameSessionId ? run.sessionPersistenceStatus : "error",
    guessPersistenceError: true,
  }
}
