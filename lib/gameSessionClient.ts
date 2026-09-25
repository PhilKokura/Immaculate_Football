export interface ClientGameSession {
  id: string
  puzzleId: string
  anonymousSessionId: string
  guessesUsed: number
  correctCells: number
  completed: boolean
  completedAt: string | null
}

/** Starts or retrieves this gameplay run on its first consumed guess. */
export async function createClientGameSession(
  puzzleId: string,
  anonymousSessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ClientGameSession> {
  const response = await fetcher("/api/game-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ puzzleId, anonymousSessionId }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Could not save the game session.")

  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Game session response is malformed.")
  }
  const session = value as Record<string, unknown>
  if (
    typeof session.id !== "string" ||
    session.puzzleId !== puzzleId ||
    session.anonymousSessionId !== anonymousSessionId ||
    typeof session.guessesUsed !== "number" ||
    typeof session.correctCells !== "number" ||
    typeof session.completed !== "boolean" ||
    (session.completedAt !== null && typeof session.completedAt !== "string")
  ) {
    throw new Error("Game session response is malformed.")
  }
  return session as unknown as ClientGameSession
}
