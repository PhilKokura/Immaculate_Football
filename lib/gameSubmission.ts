import {
  validatePlayerSelection,
  type PlayerWithImage,
  type Seed,
} from "./gameLogic"

export interface GameProgress {
  gridState: Record<string, PlayerWithImage | null>
  guesses: number
  correctAnswers: number
  remainingAttempts: number
  /** Stable runtime player IDs, not display names. */
  usedPlayers: Set<string>
  lastError: string
}

export function createGameProgress(): GameProgress {
  return {
    gridState: {},
    guesses: 0,
    correctAnswers: 0,
    remainingAttempts: 9,
    usedPlayers: new Set(),
    lastError: "",
  }
}

/** Pure transition used in a functional React update so guards see latest state. */
export function submitPlayerSelection(
  state: GameProgress,
  seed: Seed,
  player: PlayerWithImage,
  cellId: string,
): GameProgress {
  const reject = (lastError: string): GameProgress => ({ ...state, lastError })

  if (!/^[0-2]-[0-2]$/.test(cellId)) return reject("Invalid cell selection")

  const [row, col] = cellId.split("-").map(Number)
  if (!seed.rows[row] || !seed.cols[col]) {
    return reject("Grid not fully loaded, please try again")
  }

  if (state.remainingAttempts <= 0) return reject("No attempts remaining")
  if (state.gridState[cellId]) return reject("This cell is already completed")

  if (
    state.usedPlayers.has(player.id) ||
    Object.values(state.gridState).some(existing => existing?.id === player.id)
  ) {
    return reject(`${player.name} has already been used in the grid`)
  }

  const validation = validatePlayerSelection(
    player,
    seed.rows[row],
    seed.cols[col],
  )

  return {
    ...state,
    guesses: state.guesses + 1,
    remainingAttempts: state.remainingAttempts - 1,
    gridState: validation.isValid
      ? { ...state.gridState, [cellId]: player }
      : state.gridState,
    correctAnswers:
      state.correctAnswers + (validation.isValid ? 1 : 0),
    usedPlayers: validation.isValid
      ? new Set([...state.usedPlayers, player.id])
      : state.usedPlayers,
    lastError: validation.isValid
      ? ""
      : validation.error || "Invalid selection",
  }
}
