import assert from "node:assert/strict"
import { test } from "node:test"
import { getCriterion, PLAYERS_DATABASE } from "../components/data/gameData"
import { getValidatedFallbackSeed } from "../lib/gameLogic"
import {
  getUtcDailyPuzzleDate,
  resolveDailyPuzzlePayload,
  toDailyPuzzlePayload,
} from "../lib/dailyPuzzleContract"
import {
  createDailyGameState,
  loadDailyPuzzle,
  resetDailyGameState,
} from "../lib/dailyPuzzleClient"
import { createGameProgress } from "../lib/gameSubmission"

const dailySeed = getValidatedFallbackSeed().seed

const stored = {
  id: "daily-test-id",
  puzzle_date: "2026-09-25",
  row_criteria: dailySeed.rows,
  column_criteria: dailySeed.cols,
}

test("UTC date calculation uses the global midnight boundary", () => {
  assert.equal(
    getUtcDailyPuzzleDate(new Date("2026-09-25T00:30:00+02:00")),
    "2026-09-24",
  )
})

test("API payload exposes only safe fields and preserves canonical criterion keys", () => {
  const rowWithInternalField = { ...stored, created_at: "ignored" }
  assert.deepEqual(toDailyPuzzlePayload(rowWithInternalField), {
    id: stored.id,
    puzzleDate: stored.puzzle_date,
    rowCriteria: stored.row_criteria,
    columnCriteria: stored.column_criteria,
  })
})

test("canonical keys resolve to the existing runtime criterion objects", () => {
  const resolved = resolveDailyPuzzlePayload(toDailyPuzzlePayload(stored))
  assert.deepEqual(resolved.rows.map(criterion => criterion.key), stored.row_criteria)
  assert.deepEqual(resolved.columns.map(criterion => criterion.key), stored.column_criteria)
  assert.strictEqual(resolved.rows[0], getCriterion(stored.row_criteria[0]))
  assert.throws(
    () => resolveDailyPuzzlePayload({
      ...toDailyPuzzlePayload(stored),
      rowCriteria: ["unknown:criterion", ...stored.row_criteria.slice(1)],
    }),
    /Unknown Daily Puzzle criterion/,
  )
})

test("Daily Puzzle rejects obsolete provider-key criteria", () => {
  assert.throws(
    () => resolveDailyPuzzlePayload({
      ...toDailyPuzzlePayload(stored),
      rowCriteria: ["club:158", ...stored.row_criteria.slice(1)],
    }),
    /Unknown Daily Puzzle criterion/,
  )
})

test("initial Daily Puzzle load uses the API response and fails without a local fallback", async () => {
  const payload = toDailyPuzzlePayload(stored)
  const calls: string[] = []
  const fetcher = (async (url: string) => {
    calls.push(url)
    return Response.json(payload)
  }) as typeof fetch

  const puzzle = await loadDailyPuzzle(undefined, fetcher)
  assert.deepEqual(calls, ["/api/daily-puzzle"])
  assert.equal(puzzle.id, stored.id)
  assert.deepEqual(puzzle.rows.map(criterion => criterion.key), stored.row_criteria)

  const failingFetch = (async () => new Response(null, { status: 503 })) as typeof fetch
  await assert.rejects(loadDailyPuzzle(undefined, failingFetch), /Could not load/)
})

test("Reset Game clears attempts and answers while retaining the exact Daily Puzzle", () => {
  const puzzle = resolveDailyPuzzlePayload(toDailyPuzzlePayload(stored))
  const state = createDailyGameState(puzzle)
  state.progress.guesses = 2
  state.progress.remainingAttempts = 7
  state.progress.usedPlayers.add(PLAYERS_DATABASE[0].id)

  const reset = resetDailyGameState(state)
  assert.strictEqual(reset.puzzle, puzzle)
  assert.deepEqual(reset.progress, createGameProgress())
  assert.equal(state.progress.guesses, 2)
})

