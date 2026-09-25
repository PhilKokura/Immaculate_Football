import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DuplicateGameSessionError,
  handleGameSessionPost,
  type GameSessionRequest,
  type GameSessionRow,
  type GameSessionStore,
} from "../lib/gameSession"

const puzzleId = "11111111-1111-4111-8111-111111111111"
const anonymousSessionId = "22222222-2222-4222-8222-222222222222"
const sessionId = "33333333-3333-4333-8333-333333333333"
const input = { puzzleId, anonymousSessionId }

function post(body: unknown): Request {
  return new Request("http://localhost/api/game-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function memoryStore(puzzleIsKnown = true) {
  const sessions = new Map<string, GameSessionRow>()
  let insertAttempts = 0
  const store: GameSessionStore = {
    async puzzleExists(id) { return puzzleIsKnown && id === puzzleId },
    async findSession(request) { return sessions.get(request.anonymousSessionId) ?? null },
    async insertSession(request: GameSessionRequest) {
      insertAttempts++
      // Let two concurrent requests both finish their initial lookup before insertion.
      await Promise.resolve()
      if (sessions.has(request.anonymousSessionId)) throw new DuplicateGameSessionError()
      const row = {
        id: sessionId,
        puzzle_id: request.puzzleId,
        anonymous_session_id: request.anonymousSessionId,
        guesses_used: 0,
        correct_cells: 0,
        completed: false,
        completed_at: null,
      }
      sessions.set(request.anonymousSessionId, row)
      return row
    },
  }
  return { store, sessions, get insertAttempts() { return insertAttempts } }
}

test("POST rejects invalid UUIDs and malformed JSON with 400", async () => {
  const { store } = memoryStore()
  for (const body of [
    {},
    { puzzleId: "not-a-uuid", anonymousSessionId },
    { puzzleId, anonymousSessionId: "not-a-uuid" },
    { puzzleId, anonymousSessionId: 12 },
  ]) {
    const response = await handleGameSessionPost(post(body), store)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: "Invalid game session request." })
  }
  const malformed = new Request("http://localhost/api/game-session", { method: "POST", body: "{" })
  assert.equal((await handleGameSessionPost(malformed, store)).status, 400)
})

test("POST returns 404 when the Daily Puzzle does not exist", async () => {
  const { store, insertAttempts } = memoryStore(false)
  const response = await handleGameSessionPost(post(input), store)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: "Daily Puzzle not found." })
  assert.equal(insertAttempts, 0)
})

test("first request creates a default session and repeated request returns its ID", async () => {
  const state = memoryStore()
  const first = await handleGameSessionPost(post(input), state.store)
  assert.equal(first.status, 200)
  assert.equal(first.headers.get("Cache-Control"), "no-store")
  assert.deepEqual(await first.json(), {
    id: sessionId,
    puzzleId,
    anonymousSessionId,
    guessesUsed: 0,
    correctCells: 0,
    completed: false,
    completedAt: null,
  })
  const second = await handleGameSessionPost(post(input), state.store)
  assert.equal(second.status, 200)
  assert.equal((await second.json()).id, sessionId)
  assert.equal(state.insertAttempts, 1)
  assert.equal(state.sessions.size, 1)
})

test("concurrent duplicate insert re-reads the row selected by the unique constraint", async () => {
  const state = memoryStore()
  const [first, second] = await Promise.all([
    handleGameSessionPost(post(input), state.store),
    handleGameSessionPost(post(input), state.store),
  ])
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal((await first.json()).id, sessionId)
  assert.equal((await second.json()).id, sessionId)
  assert.equal(state.insertAttempts, 2)
  assert.equal(state.sessions.size, 1)
})
