import assert from "node:assert/strict"
import { test } from "node:test"
import { PLAYERS_DATABASE } from "../components/data/gameData"
import { createDailyGameRun, resetDailyGameRun, submitDailyGameRunGuess, type DailyGameRun } from "../lib/dailyGameRun"
import { resolveDailyPuzzlePayload } from "../lib/dailyPuzzleContract"
import { getValidatedFallbackSeed } from "../lib/gameLogic"
import { createRunPersistenceCoordinator } from "../lib/runPersistenceCoordinator"
import { persistGuessEvent } from "../lib/guessEventClient"
import type { GuessEventRequest } from "../lib/guessEvent"

const puzzleId = "11111111-1111-4111-8111-111111111111"
const runA = "22222222-2222-4222-8222-222222222222"
const runB = "33333333-3333-4333-8333-333333333333"
const sessionA = "44444444-4444-4444-8444-444444444444"
const sessionB = "55555555-5555-4555-8555-555555555555"
const eventA = "66666666-6666-4666-8666-666666666666"
const eventB = "77777777-7777-4777-8777-777777777777"
const seed = getValidatedFallbackSeed().seed
const puzzle = resolveDailyPuzzlePayload({
  id: puzzleId, puzzleDate: "2026-09-25",
  rowCriteria: seed.rows, columnCriteria: seed.cols,
})

function stateHarness(
  createSession: (puzzleId: string, runId: string) => Promise<{ id: string }>,
  persistGuess: (request: GuessEventRequest) => Promise<unknown>,
) {
  let run: DailyGameRun = createDailyGameRun(puzzle, () => runA)
  const coordinator = createRunPersistenceCoordinator({
    getRun: () => run,
    setRun: next => { run = next },
    createSession,
    persistGuess,
  })
  return {
    get run() { return run },
    guess(playerIndex: number, cell: string, eventId: string) {
      const result = submitDailyGameRunGuess(run, PLAYERS_DATABASE[playerIndex], cell, () => eventId)
      run = result.run
      return result
    },
    reset() { run = resetDailyGameRun(run, () => runB) },
    flush(runId: string) { return coordinator.flush(runId) },
  }
}

test("only consumed guesses receive an event ID; the local transition is immediate", () => {
  const h = stateHarness(async () => ({ id: sessionA }), async () => ({}))
  let generated = 0
  const rejected = submitDailyGameRunGuess(h.run, PLAYERS_DATABASE[0], "3-0", () => {
    generated++
    return eventA
  })
  assert.equal(rejected.attemptConsumed, false)
  assert.equal(generated, 0)
  assert.equal(rejected.run.pendingGuessEvents.length, 0)
  const first = h.guess(0, "0-0", eventA)
  assert.equal(first.attemptConsumed, true)
  assert.equal(h.run.dailyGame.progress.guesses, 1)
  assert.deepEqual(h.run.pendingGuessEvents.map(event => event.eventId), [eventA])
})

test("failed POST retains the local guess and retries its original event ID", async () => {
  const sessions: string[] = []
  const posts: GuessEventRequest[] = []
  let fail = true
  const h = stateHarness(
    async (_puzzle, runId) => { sessions.push(runId); return { id: sessionA } },
    async input => {
      posts.push(input)
      if (fail) throw new Error("offline")
      return { eventId: input.eventId }
    },
  )
  h.guess(0, "0-0", eventA)
  await h.flush(runA)
  assert.equal(h.run.dailyGame.progress.guesses, 1)
  assert.equal(h.run.guessPersistenceError, true)
  assert.deepEqual(h.run.pendingGuessEvents.map(event => event.eventId), [eventA])
  assert.equal(h.run.gameSessionId, sessionA)

  fail = false
  h.guess(1, "0-1", eventB)
  await h.flush(runA)
  assert.equal(h.run.dailyGame.progress.guesses, 2)
  assert.deepEqual(posts.map(post => post.eventId), [eventA, eventA, eventB])
  assert.ok(posts.every(post => post.sessionId === sessionA))
  assert.deepEqual(sessions, [runA])
  assert.deepEqual(h.run.pendingGuessEvents, [])
})

test("queued guesses wait for one lazy session creation and reuse its ID", async () => {
  let release!: (value: { id: string }) => void
  const pendingSession = new Promise<{ id: string }>(resolve => { release = resolve })
  const sessions: string[] = []
  const posts: GuessEventRequest[] = []
  const h = stateHarness(async (_puzzle, id) => {
    sessions.push(id)
    return pendingSession
  }, async input => { posts.push(input) })
  h.guess(0, "0-0", eventA)
  const flushing = h.flush(runA)
  await Promise.resolve()
  h.guess(1, "0-1", eventB)
  release({ id: sessionA })
  await flushing
  assert.deepEqual(sessions, [runA])
  assert.deepEqual(posts.map(post => post.eventId), [eventA, eventB])
  assert.ok(posts.every(post => post.sessionId === sessionA))
  assert.deepEqual(h.run.pendingGuessEvents, [])
})

test("Reset keeps the puzzle and never attaches a delayed old-run session or guess", async () => {
  let release!: (value: { id: string }) => void
  const pendingSession = new Promise<{ id: string }>(resolve => { release = resolve })
  const posts: GuessEventRequest[] = []
  const h = stateHarness(async (_puzzle, id) => id === runA ? pendingSession : { id: sessionB },
    async input => { posts.push(input) })
  h.guess(0, "0-0", eventA)
  const oldFlush = h.flush(runA)
  await Promise.resolve()
  h.reset()
  assert.strictEqual(h.run.dailyGame.puzzle, puzzle)
  assert.equal(h.run.anonymousSessionId, runB)
  assert.equal(h.run.gameSessionId, null)
  assert.deepEqual(h.run.pendingGuessEvents, [])
  release({ id: sessionA })
  await oldFlush
  assert.equal(h.run.gameSessionId, null)
  assert.equal(posts.length, 0)

  h.guess(0, "0-0", eventB)
  await h.flush(runB)
  assert.equal(h.run.gameSessionId, sessionB)
  assert.deepEqual(posts.map(post => post.eventId), [eventB])
  assert.equal(posts[0].sessionId, sessionB)
})

test("guess client sends only the stable event payload and rejects failed responses", async () => {
  const request: GuessEventRequest = {
    eventId: eventA, sessionId: sessionA, puzzleId, cellIndex: 0,
    playerId: PLAYERS_DATABASE[0].id,
  }
  const calls: unknown[] = []
  const fetcher = (async (url: string, options: RequestInit) => {
    calls.push({ url, options })
    return Response.json({
      eventId: eventA, correct: false, guessesUsed: 1, correctCells: 0,
      completed: false, completedAt: null,
    })
  }) as typeof fetch
  const result = await persistGuessEvent(request, fetcher)
  assert.equal(result.eventId, eventA)
  const call = calls[0] as { url: string; options: RequestInit }
  assert.equal(call.url, "/api/guess-event")
  assert.deepEqual(JSON.parse(call.options.body as string), request)
  await assert.rejects(() => persistGuessEvent(request, (async () =>
    Response.json({ error: "unavailable" }, { status: 500 })) as typeof fetch))
})

