export interface GameSessionRequest {
  puzzleId: string
  anonymousSessionId: string
}

export interface GameSessionRow {
  id: string
  puzzle_id: string
  anonymous_session_id: string
  guesses_used: number
  correct_cells: number
  completed: boolean
  completed_at: string | null
}

export interface GameSessionStore {
  puzzleExists(puzzleId: string): Promise<boolean>
  findSession(request: GameSessionRequest): Promise<GameSessionRow | null>
  insertSession(request: GameSessionRequest): Promise<GameSessionRow>
}

export class DuplicateGameSessionError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuidString(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value)
}
const noStore = { "Cache-Control": "no-store" }

export function parseGameSessionRequest(value: unknown): GameSessionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (
    typeof body.puzzleId !== "string" || !uuid.test(body.puzzleId) ||
    typeof body.anonymousSessionId !== "string" || !uuid.test(body.anonymousSessionId)
  ) return null
  return {
    puzzleId: body.puzzleId.toLowerCase(),
    anonymousSessionId: body.anonymousSessionId.toLowerCase(),
  }
}

export function parseGameSessionRow(value: unknown, request: GameSessionRequest): GameSessionRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Game session row is malformed")
  }
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== "string" || !uuid.test(row.id) ||
    typeof row.puzzle_id !== "string" || row.puzzle_id.toLowerCase() !== request.puzzleId ||
    typeof row.anonymous_session_id !== "string" ||
    row.anonymous_session_id.toLowerCase() !== request.anonymousSessionId ||
    typeof row.guesses_used !== "number" || !Number.isInteger(row.guesses_used) || row.guesses_used < 0 ||
    typeof row.correct_cells !== "number" || !Number.isInteger(row.correct_cells) || row.correct_cells < 0 ||
    typeof row.completed !== "boolean" ||
    (row.completed_at !== null && typeof row.completed_at !== "string")
  ) {
    throw new Error("Game session row is malformed")
  }
  return row as unknown as GameSessionRow
}

export function toGameSessionPayload(row: GameSessionRow) {
  return {
    id: row.id,
    puzzleId: row.puzzle_id,
    anonymousSessionId: row.anonymous_session_id,
    guessesUsed: row.guesses_used,
    correctCells: row.correct_cells,
    completed: row.completed,
    completedAt: row.completed_at,
  }
}

/** The unique (puzzle_id, anonymous_session_id) constraint resolves concurrent creates. */
export async function getOrCreateGameSession(
  request: GameSessionRequest,
  store: GameSessionStore,
): Promise<GameSessionRow | null> {
  if (!await store.puzzleExists(request.puzzleId)) return null
  const existing = await store.findSession(request)
  if (existing) return existing

  try {
    return await store.insertSession(request)
  } catch (error) {
    if (!(error instanceof DuplicateGameSessionError)) throw error
    const concurrent = await store.findSession(request)
    if (concurrent) return concurrent
    throw new Error("Concurrent game session could not be read back")
  }
}

export async function handleGameSessionPost(
  request: Request,
  store: GameSessionStore,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid game session request." }, { status: 400, headers: noStore })
  }
  const input = parseGameSessionRequest(body)
  if (!input) {
    return Response.json({ error: "Invalid game session request." }, { status: 400, headers: noStore })
  }

  try {
    const session = await getOrCreateGameSession(input, store)
    if (!session) {
      return Response.json({ error: "Daily Puzzle not found." }, { status: 404, headers: noStore })
    }
    return Response.json(toGameSessionPayload(session), { headers: noStore })
  } catch {
    return Response.json(
      { error: "Game session is temporarily unavailable. Please retry." },
      { status: 500, headers: noStore },
    )
  }
}

