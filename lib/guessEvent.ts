import { PLAYER_BY_ID, getCriterion, type PlayerWithImage } from "@/components/data/gameData"
import { checkInvalidPairing, validatePlayerSelection } from "./gameLogic"
import { isUuidString } from "./gameSession"

export interface GuessEventRequest {
  eventId: string
  sessionId: string
  puzzleId: string
  cellIndex: number
  playerId: string
}

export interface StoredGuessEvent {
  eventId: string
  correct: boolean
  guessesUsed: number
  correctCells: number
  completed: boolean
  completedAt: string | null
}

export interface GuessEventStore {
  getSession(sessionId: string): Promise<{ puzzleId: string } | null>
  getPuzzle(puzzleId: string): Promise<{ rows: string[]; columns: string[] } | null>
  recordGuess(input: GuessEventRequest, correct: boolean): Promise<StoredGuessEvent>
}

export class GuessPersistenceError extends Error {
  constructor(readonly status: 400 | 404 | 409) {
    super("Guess persistence rejected")
  }
}

const noStore = { "Cache-Control": "no-store" }

export function parseGuessEventRequest(value: unknown): GuessEventRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (
    !isUuidString(body.eventId) || !isUuidString(body.sessionId) ||
    !isUuidString(body.puzzleId) || !isUuidString(body.playerId) ||
    !Number.isInteger(body.cellIndex) || (body.cellIndex as number) < 0 ||
    (body.cellIndex as number) > 8
  ) return null
  return {
    eventId: body.eventId.toLowerCase(),
    sessionId: body.sessionId.toLowerCase(),
    puzzleId: body.puzzleId.toLowerCase(),
    playerId: body.playerId.toLowerCase(),
    cellIndex: body.cellIndex as number,
  }
}

/** Reuses the exact criterion pairing and player matcher used by local submission. */
export function serverGuessCorrectness(
  puzzle: { rows: string[]; columns: string[] },
  cellIndex: number,
  player: PlayerWithImage,
): boolean {
  if (puzzle.rows.length !== 3 || puzzle.columns.length !== 3) {
    throw new Error("Stored Daily Puzzle criteria are malformed")
  }
  const rowKey = puzzle.rows[Math.floor(cellIndex / 3)]
  const columnKey = puzzle.columns[cellIndex % 3]
  if (!getCriterion(rowKey) || !getCriterion(columnKey) ||
      checkInvalidPairing(rowKey, columnKey).isInvalid) {
    throw new Error("Stored Daily Puzzle cell is invalid")
  }
  return validatePlayerSelection(player, rowKey, columnKey).isValid
}

export async function handleGuessEventPost(
  request: Request,
  store: GuessEventStore,
  players: ReadonlyMap<string, PlayerWithImage> = PLAYER_BY_ID,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid guess event request." }, { status: 400, headers: noStore })
  }
  const input = parseGuessEventRequest(body)
  if (!input) {
    return Response.json({ error: "Invalid guess event request." }, { status: 400, headers: noStore })
  }

  try {
    const session = await store.getSession(input.sessionId)
    if (!session) {
      return Response.json({ error: "Game session not found." }, { status: 404, headers: noStore })
    }
    if (session.puzzleId !== input.puzzleId) {
      return Response.json({ error: "Game session does not match the puzzle." }, { status: 409, headers: noStore })
    }
    const puzzle = await store.getPuzzle(input.puzzleId)
    if (!puzzle) {
      return Response.json({ error: "Daily Puzzle not found." }, { status: 404, headers: noStore })
    }
    const player = players.get(input.playerId)
    if (!player) {
      return Response.json({ error: "Player not found." }, { status: 404, headers: noStore })
    }
    const correct = serverGuessCorrectness(puzzle, input.cellIndex, player)
    const persisted = await store.recordGuess(input, correct)
    return Response.json({
      eventId: persisted.eventId,
      correct: persisted.correct,
      guessesUsed: persisted.guessesUsed,
      correctCells: persisted.correctCells,
      completed: persisted.completed,
      completedAt: persisted.completedAt,
    }, { headers: noStore })
  } catch (error) {
    if (error instanceof GuessPersistenceError) {
      const message = error.status === 404 ? "Guess reference not found." :
        error.status === 409 ? "Guess cannot be recorded for this session." :
          "Invalid guess event request."
      return Response.json({ error: message }, { status: error.status, headers: noStore })
    }
    return Response.json(
      { error: "Guess persistence is temporarily unavailable. Please retry." },
      { status: 500, headers: noStore },
    )
  }
}
