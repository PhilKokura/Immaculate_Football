import {
  attachGameSession,
  markGuessEventPersisted,
  markGuessPersistenceFailed,
  type DailyGameRun,
} from "./dailyGameRun"
import type { GuessEventRequest } from "./guessEvent"

export interface RunPersistenceDependencies {
  getRun(): DailyGameRun | null
  setRun(run: DailyGameRun): void
  createSession(puzzleId: string, anonymousSessionId: string): Promise<{ id: string }>
  persistGuess(input: GuessEventRequest): Promise<unknown>
  onFailure?(): void
}

/** Serializes this run's queued events; a failed event stays queued with its original ID. */
export function createRunPersistenceCoordinator(deps: RunPersistenceDependencies) {
  const tasks = new Map<string, Promise<void>>()

  async function process(anonymousSessionId: string): Promise<void> {
    try {
      while (true) {
        let run = deps.getRun()
        if (!run || run.anonymousSessionId !== anonymousSessionId || !run.pendingGuessEvents.length) return

        let sessionId = run.gameSessionId
        if (!sessionId) {
          const session = await deps.createSession(String(run.dailyGame.puzzle.id), anonymousSessionId)
          run = deps.getRun()
          if (!run || run.anonymousSessionId !== anonymousSessionId) return
          const attached = attachGameSession(run, anonymousSessionId, session.id)
          deps.setRun(attached)
          sessionId = session.id
        }

        run = deps.getRun()
        if (!run || run.anonymousSessionId !== anonymousSessionId) return
        const event = run.pendingGuessEvents[0]
        if (!event) continue
        await deps.persistGuess({
          eventId: event.eventId,
          sessionId,
          puzzleId: String(run.dailyGame.puzzle.id),
          cellIndex: event.cellIndex,
          playerId: event.playerId,
        })

        run = deps.getRun()
        if (!run || run.anonymousSessionId !== anonymousSessionId) return
        deps.setRun(markGuessEventPersisted(run, anonymousSessionId, event.eventId))
      }
    } catch {
      const run = deps.getRun()
      if (run && run.anonymousSessionId === anonymousSessionId) {
        deps.setRun(markGuessPersistenceFailed(run, anonymousSessionId))
        deps.onFailure?.()
      }
    }
  }

  function flush(anonymousSessionId: string): Promise<void> {
    const existing = tasks.get(anonymousSessionId)
    if (existing) return existing
    const task = Promise.resolve().then(() => process(anonymousSessionId))
    tasks.set(anonymousSessionId, task)
    void task.finally(() => {
      tasks.delete(anonymousSessionId)
      const run = deps.getRun()
      if (run?.anonymousSessionId === anonymousSessionId &&
          run.pendingGuessEvents.length > 0 && !run.guessPersistenceError) {
        void flush(anonymousSessionId)
      }
    })
    return task
  }

  return { flush }
}
