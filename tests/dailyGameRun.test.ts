import assert from "node:assert/strict"
import { test } from "node:test"
import { PLAYERS_DATABASE } from "../components/data/gameData"
import { createDailyGameRun, resetDailyGameRun, submitDailyGameRunGuess, attachGameSession, markGameSessionPersistenceFailed } from "../lib/dailyGameRun"
import { loadDailyPuzzle } from "../lib/dailyPuzzleClient"
import { resolveDailyPuzzlePayload } from "../lib/dailyPuzzleContract"
import { createClientGameSession } from "../lib/gameSessionClient"
import { getValidatedFallbackSeed } from "../lib/gameLogic"

const puzzleId = "11111111-1111-4111-8111-111111111111"
const firstRunId = "22222222-2222-4222-8222-222222222222"
const secondRunId = "33333333-3333-4333-8333-333333333333"
const gameSessionId = "44444444-4444-4444-8444-444444444444"
const seed = getValidatedFallbackSeed().seed
const payload = {
  id: puzzleId,
  puzzleDate: "2026-09-25",
  rowCriteria: seed.rows,
  columnCriteria: seed.cols,
}
const puzzle = resolveDailyPuzzlePayload(payload)

test("loading a puzzle creates a stable run ID without starting a server session", async () => {
  const calls: string[] = []
  const fetcher = (async (url: string) => {
    calls.push(url)
    return Response.json(payload)
  }) as typeof fetch
  const loaded = await loadDailyPuzzle(undefined, fetcher)
  const run = createDailyGameRun(loaded, () => firstRunId)
  assert.deepEqual(calls, ["/api/daily-puzzle"])
  assert.equal(run.anonymousSessionId, firstRunId)
  assert.equal(run.gameSessionId, null)
  assert.equal(run.sessionPersistenceStatus, "idle")
  assert.strictEqual(run.dailyGame.puzzle, loaded)
})

test("first consumed guess requests a session; later guesses reuse its database ID", async () => {
  const initial = createDailyGameRun(puzzle, () => firstRunId)
  const first = submitDailyGameRunGuess(initial, PLAYERS_DATABASE[0], "0-0")
  assert.equal(first.shouldCreateSession, true)
  assert.equal(first.run.dailyGame.progress.guesses, 1)
  assert.equal(first.run.anonymousSessionId, firstRunId)
  assert.equal(first.run.sessionPersistenceStatus, "pending")
  const whilePending = submitDailyGameRunGuess(first.run, PLAYERS_DATABASE[1], "0-1")
  assert.equal(whilePending.shouldCreateSession, false)
  assert.equal(whilePending.run.anonymousSessionId, firstRunId)

  const calls: Array<{ url: string; options: RequestInit }> = []
  const fetcher = (async (url: string, options: RequestInit) => {
    calls.push({ url, options })
    return Response.json({
      id: gameSessionId,
      puzzleId,
      anonymousSessionId: firstRunId,
      guessesUsed: 0,
      correctCells: 0,
      completed: false,
      completedAt: null,
    })
  }) as typeof fetch
  const server = await createClientGameSession(puzzleId, firstRunId, fetcher)
  assert.equal(server.id, gameSessionId)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "/api/game-session")
  assert.equal(calls[0].options.method, "POST")
  assert.deepEqual(JSON.parse(calls[0].options.body as string), { puzzleId, anonymousSessionId: firstRunId })

  const saved = attachGameSession(first.run, firstRunId, server.id)
  const second = submitDailyGameRunGuess(saved, PLAYERS_DATABASE[1], "0-1")
  assert.equal(second.shouldCreateSession, false)
  assert.equal(second.run.gameSessionId, gameSessionId)
  assert.equal(second.run.anonymousSessionId, firstRunId)
  assert.equal(second.run.dailyGame.progress.guesses, 2)
  assert.equal(calls.length, 1)
})

test("a rejected local selection does not start a server session", () => {
  const run = createDailyGameRun(puzzle, () => firstRunId)
  const rejected = submitDailyGameRunGuess(run, PLAYERS_DATABASE[0], "3-0")
  assert.equal(rejected.shouldCreateSession, false)
  assert.equal(rejected.run.dailyGame.progress.guesses, 0)
  assert.equal(rejected.run.sessionPersistenceStatus, "idle")
})

test("Reset keeps the exact Daily Puzzle, clears local state and starts a new run ID", () => {
  const first = submitDailyGameRunGuess(createDailyGameRun(puzzle, () => firstRunId), PLAYERS_DATABASE[0], "0-0")
  const saved = attachGameSession(first.run, firstRunId, gameSessionId)
  const reset = resetDailyGameRun(saved, () => secondRunId)
  assert.strictEqual(reset.dailyGame.puzzle, puzzle)
  assert.equal(reset.dailyGame.progress.guesses, 0)
  assert.equal(reset.anonymousSessionId, secondRunId)
  assert.equal(reset.gameSessionId, null)
  assert.equal(reset.sessionPersistenceStatus, "idle")
  assert.strictEqual(attachGameSession(reset, firstRunId, gameSessionId), reset)
  const nextGuess = submitDailyGameRunGuess(reset, PLAYERS_DATABASE[0], "0-0")
  assert.equal(nextGuess.shouldCreateSession, true)
})

test("persistence failure preserves the local guess and allows retry on a later guess", () => {
  const first = submitDailyGameRunGuess(createDailyGameRun(puzzle, () => firstRunId), PLAYERS_DATABASE[0], "0-0")
  const failed = markGameSessionPersistenceFailed(first.run, firstRunId)
  assert.strictEqual(failed.dailyGame.progress, first.run.dailyGame.progress)
  assert.equal(failed.dailyGame.progress.guesses, 1)
  assert.equal(failed.gameSessionId, null)
  assert.equal(failed.sessionPersistenceStatus, "error")
  const nextGuess = submitDailyGameRunGuess(failed, PLAYERS_DATABASE[1], "0-1")
  assert.equal(nextGuess.shouldCreateSession, true)
  assert.equal(nextGuess.run.anonymousSessionId, firstRunId)
  assert.equal(nextGuess.run.dailyGame.progress.guesses, 2)
})
