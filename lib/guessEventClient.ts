import type { GuessEventRequest, StoredGuessEvent } from "./guessEvent"

export async function persistGuessEvent(
  input: GuessEventRequest,
  fetcher: typeof fetch = fetch,
): Promise<StoredGuessEvent> {
  const response = await fetcher("/api/guess-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Could not save the guess event.")

  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Guess event response is malformed.")
  }
  const event = value as Record<string, unknown>
  if (
    event.eventId !== input.eventId || typeof event.correct !== "boolean" ||
    typeof event.guessesUsed !== "number" || typeof event.correctCells !== "number" ||
    typeof event.completed !== "boolean" ||
    (event.completedAt !== null && typeof event.completedAt !== "string")
  ) {
    throw new Error("Guess event response is malformed.")
  }
  return event as unknown as StoredGuessEvent
}
