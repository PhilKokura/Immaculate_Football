import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { PLAYER_BY_ID } from "../components/data/gameData"
import { GuessPersistenceError, handleGuessEventPost, type GuessEventRequest, type GuessEventStore } from "../lib/guessEvent"
import { MAX_GAME_GUESSES } from "../lib/gameRules"
import { getValidatedFallbackSeed, validatePlayerSelection, validatePuzzle } from "../lib/gameLogic"

const puzzleId = "11111111-1111-4111-8111-111111111111"
const otherPuzzleId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const seed = getValidatedFallbackSeed().seed
const solution = validatePuzzle(seed).solution!
const eventId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${n.toString(16).padStart(12, "0")}`

function playerFor(cellIndex: number, correct: boolean): string {
  const row = Math.floor(cellIndex / 3)
  const col = cellIndex % 3
  if (correct) return solution[`${row}-${col}`]
  const candidate = [...PLAYER_BY_ID.values()].find(player =>
    !validatePlayerSelection(player, seed.rows[row], seed.cols[col]).isValid,
  )
  assert.ok(candidate)
  return candidate.id
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/guess-event", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  })
}

function input(n: number, cellIndex: number, correct: boolean): GuessEventRequest {
  return { eventId: eventId(n), sessionId, puzzleId, cellIndex, playerId: playerFor(cellIndex, correct) }
}

function memoryStore(options: { session?: boolean; puzzle?: boolean } = {}) {
  const session = { puzzleId, guessesUsed: 0, correctCells: 0, completed: false, completedAt: null as string | null }
  const events = new Map<string, { input: GuessEventRequest; correct: boolean }>()
  const receivedCorrect: boolean[] = []
  const store: GuessEventStore = {
    async getSession(id) { return options.session === false || id !== sessionId ? null : { puzzleId: session.puzzleId } },
    async getPuzzle(id) { return options.puzzle === false || id !== puzzleId ? null : { rows: seed.rows, columns: seed.cols } },
    async recordGuess(request, correct) {
      receivedCorrect.push(correct)
      const existing = events.get(request.eventId)
      if (existing) {
        if (JSON.stringify(existing.input) !== JSON.stringify(request)) throw new GuessPersistenceError(409)
        return { eventId: request.eventId, correct: existing.correct, ...session }
      }
      if (session.completed) throw new GuessPersistenceError(409)
      if ([...events.values()].some(event => event.correct && (
        event.input.cellIndex === request.cellIndex || event.input.playerId === request.playerId
      ))) throw new GuessPersistenceError(409)
      events.set(request.eventId, { input: request, correct })
      session.guessesUsed++
      if (correct) session.correctCells++
      session.completed = session.correctCells === 9 || session.guessesUsed === MAX_GAME_GUESSES
      if (session.completed) session.completedAt = "2026-09-25T12:00:00Z"
      return { eventId: request.eventId, correct, ...session }
    },
  }
  return { store, session, events, receivedCorrect }
}

test("guess API rejects malformed IDs and cell indices", async () => {
  const state = memoryStore()
  for (const body of [
    {},
    { ...input(1, 0, true), eventId: "not-a-uuid" },
    { ...input(1, 0, true), playerId: "44" },
    { ...input(1, 0, true), cellIndex: -1 },
    { ...input(1, 0, true), cellIndex: 9 },
    { ...input(1, 0, true), cellIndex: 1.5 },
  ]) {
    const response = await handleGuessEventPost(post(body), state.store)
    assert.equal(response.status, 400)
  }
  assert.equal(state.events.size, 0)
})

test("guess API rejects unknown or mismatched session, puzzle, and player UUID", async () => {
  const valid = input(1, 0, true)
  assert.equal((await handleGuessEventPost(post(valid), memoryStore({ session: false }).store)).status, 404)
  assert.equal((await handleGuessEventPost(post({ ...valid, puzzleId: otherPuzzleId }), memoryStore().store)).status, 409)
  assert.equal((await handleGuessEventPost(post(valid), memoryStore({ puzzle: false }).store)).status, 404)
  const unknownPlayer = { ...valid, playerId: "99999999-9999-4999-8999-999999999999" }
  assert.equal((await handleGuessEventPost(post(unknownPlayer), memoryStore().store)).status, 404)
})

test("server recomputes correct and incorrect guesses from FootGrid player IDs", async () => {
  const state = memoryStore()
  const right = await handleGuessEventPost(post({ ...input(1, 0, true), correct: false }), state.store)
  assert.equal(right.status, 200)
  assert.deepEqual(await right.json(), {
    eventId: eventId(1), correct: true, guessesUsed: 1, correctCells: 1,
    completed: false, completedAt: null,
  })
  const wrong = await handleGuessEventPost(post({ ...input(2, 1, false), correct: true }), state.store)
  assert.equal(wrong.status, 200)
  assert.equal((await wrong.json()).correct, false)
  assert.deepEqual(state.receivedCorrect, [true, false])
  assert.equal(state.session.guessesUsed, 2)
  assert.equal(state.session.correctCells, 1)
})

test("duplicate event ID returns the persisted result without double counting", async () => {
  const state = memoryStore()
  const guess = input(1, 0, true)
  await handleGuessEventPost(post(guess), state.store)
  const retry = await handleGuessEventPost(post(guess), state.store)
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).correct, true)
  assert.equal(state.events.size, 1)
  assert.equal(state.session.guessesUsed, 1)
  assert.equal(state.session.correctCells, 1)
  assert.equal((await handleGuessEventPost(post({ ...guess, cellIndex: 1 }), state.store)).status, 409)
})

test("nine distinct correct cells complete the session; new requests cannot mutate it", async () => {
  const state = memoryStore()
  let last: Response | null = null
  for (let i = 0; i < 9; i++) last = await handleGuessEventPost(post(input(i + 1, i, true)), state.store)
  assert.equal(last?.status, 200)
  assert.equal((await last!.json()).completed, true)
  assert.equal(state.session.guessesUsed, 9)
  assert.equal(state.session.correctCells, 9)
  assert.ok(state.session.completedAt)
  const later = await handleGuessEventPost(post(input(20, 0, false)), state.store)
  assert.equal(later.status, 409)
  assert.equal(state.events.size, 9)
  assert.equal(state.session.guessesUsed, 9)
  const duplicate = await handleGuessEventPost(post(input(1, 0, true)), state.store)
  assert.equal(duplicate.status, 200)
  assert.equal(state.events.size, 9)
})

test("nine incorrect attempts complete the session without adding correct cells", async () => {
  const state = memoryStore()
  for (let i = 0; i < 9; i++) {
    const response = await handleGuessEventPost(post(input(i + 1, i, false)), state.store)
    assert.equal(response.status, 200)
  }
  assert.equal(state.session.guessesUsed, 9)
  assert.equal(state.session.correctCells, 0)
  assert.equal(state.session.completed, true)
  assert.ok(state.session.completedAt)
  assert.equal((await handleGuessEventPost(post(input(20, 0, false)), state.store)).status, 409)
})

test("database migration serializes events and limits RPC access to the server role", () => {
  const sql = readFileSync("supabase/migrations/record-guess-event.sql", "utf8")
  assert.equal(MAX_GAME_GUESSES, 9)
  assert.match(sql, /for update/i)
  assert.match(sql, /on conflict \(id\) do nothing/i)
  assert.match(sql, /guesses_used = gs\.guesses_used \+ 1/i)
  assert.match(sql, /v_session\.guesses_used \+ 1 >= 9/i)
  assert.match(sql, /grant execute [\s\S]*?to service_role/i)
})
