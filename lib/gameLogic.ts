import {
  GAME_CRITERIA,
  PLAYERS_DATABASE,
  getCriteriaByType,
  getCriterion,
  getCriterionLabel,
  type CriterionType,
  type PlayerWithImage,
} from "@/components/data/gameData"

export type { PlayerWithImage } from "@/components/data/gameData"

const MIN_GENERATOR_SUPPORT = 9

export const CLUBS = getCriteriaByType("club", MIN_GENERATOR_SUPPORT).map(
  criterion => criterion.key,
)
export const LEAGUES = getCriteriaByType("league", MIN_GENERATOR_SUPPORT).map(
  criterion => criterion.key,
)
export const NATIONS = getCriteriaByType("nation", MIN_GENERATOR_SUPPORT).map(
  criterion => criterion.key,
)
export const POSITIONS = getCriteriaByType("position", MIN_GENERATOR_SUPPORT).map(
  criterion => criterion.key,
)

// Preferred fallback. If the provider-backed dataset ever makes this invalid,
// getValidatedFallbackSeed() deterministically searches for another valid grid.
export const ROWS = [CLUBS[0], LEAGUES[0], NATIONS[0]]
export const COLUMNS = [LEAGUES[1], POSITIONS[0], CLUBS[1]]

export interface Seed {
  rows: string[]
  cols: string[]
}

interface ValidationResult {
  isValid: boolean
  error?: string
  satisfiesRow: boolean
  satisfiesCol: boolean
}

export const allPlayers: PlayerWithImage[] = PLAYERS_DATABASE

export function validatePlayerSelection(
  player: PlayerWithImage,
  rowCriteria: string,
  colCriteria: string,
): ValidationResult {
  const invalidPairing = checkInvalidPairing(rowCriteria, colCriteria)
  if (invalidPairing.isInvalid) {
    return {
      isValid: false,
      error: invalidPairing.reason,
      satisfiesRow: false,
      satisfiesCol: false,
    }
  }

  const satisfiesRow = checkCriteria(player, rowCriteria)
  const satisfiesCol = checkCriteria(player, colCriteria)
  const rowLabel = getCriterionLabel(rowCriteria)
  const colLabel = getCriterionLabel(colCriteria)

  if (!satisfiesRow && !satisfiesCol) {
    return {
      isValid: false,
      error: `${player.name} doesn't satisfy either criteria (${rowLabel} or ${colLabel})`,
      satisfiesRow: false,
      satisfiesCol: false,
    }
  }

  if (!satisfiesRow) {
    return {
      isValid: false,
      error: `${player.name} doesn't satisfy row criteria (${rowLabel})`,
      satisfiesRow: false,
      satisfiesCol: true,
    }
  }

  if (!satisfiesCol) {
    return {
      isValid: false,
      error: `${player.name} doesn't satisfy column criteria (${colLabel})`,
      satisfiesRow: true,
      satisfiesCol: false,
    }
  }

  return {
    isValid: true,
    satisfiesRow: true,
    satisfiesCol: true,
  }
}

export function checkCriteria(
  player: PlayerWithImage,
  criteriaKey: string,
): boolean {
  const criterion = getCriterion(criteriaKey)
  if (!criterion) return false

  switch (criterion.type) {
    case "club":
      return player.clubs.includes(criterion.value)
    case "league":
      return player.leagues.includes(criterion.value)
    case "nation":
      return player.nation === criterion.value
    case "position":
      return player.positions.includes(
        criterion.value as PlayerWithImage["positions"][number],
      )
  }
}

export function checkInvalidPairing(
  rowKey: string,
  colKey: string,
): { isInvalid: boolean; reason?: string } {
  const row = getCriterion(rowKey)
  const col = getCriterion(colKey)

  if (!row || !col) {
    return {
      isInvalid: true,
      reason: "Invalid pairing: unsupported criterion",
    }
  }

  if (row.type === "nation" && col.type === "nation") {
    return {
      isInvalid: true,
      reason: "Invalid pairing: Nation vs Nation is not allowed",
    }
  }

  if (row.type === "position" && col.type === "position") {
    return {
      isInvalid: true,
      reason: "Invalid pairing: Position vs Position is not allowed",
    }
  }

  if (
    row.type === "club" &&
    col.type === "league" &&
    row.currentLeagueKey === col.key
  ) {
    return {
      isInvalid: true,
      reason: `Invalid pairing: ${row.label} currently plays in ${col.label}`,
    }
  }

  if (
    row.type === "league" &&
    col.type === "club" &&
    col.currentLeagueKey === row.key
  ) {
    return {
      isInvalid: true,
      reason: `Invalid pairing: ${col.label} currently plays in ${row.label}`,
    }
  }

  return { isInvalid: false }
}

export function calculateGameStats(
  gridState: { [key: string]: PlayerWithImage | null },
  guesses: number,
  correctAnswers: number,
  remainingAttempts: number,
) {
  const correctPlayers = Object.values(gridState).filter(Boolean) as PlayerWithImage[]

  const averageRarity =
    correctPlayers.length > 0
      ? Math.round(
          correctPlayers.reduce(
            (sum, player) => sum + player.rarity * 100,
            0,
          ) / correctPlayers.length,
        )
      : 0

  const completionPercentage = Math.round((correctAnswers / 9) * 100)
  const accuracy = guesses > 0 ? Math.round((correctAnswers / guesses) * 100) : 0

  return {
    averageRarity,
    completionPercentage,
    accuracy,
    isGameCompleted: correctAnswers === 9,
    isGameOver: remainingAttempts === 0,
    isGameActive: correctAnswers < 9 && remainingAttempts > 0,
    correctPlayers,
  }
}

export function getCellHint(
  rowCriteria: string,
  colCriteria: string,
): string {
  const invalidPairing = checkInvalidPairing(rowCriteria, colCriteria)
  if (invalidPairing.isInvalid) {
    return `❌ ${invalidPairing.reason}`
  }

  const describe = (key: string): string => {
    const criterion = getCriterion(key)
    if (!criterion) return getCriterionLabel(key)

    switch (criterion.type) {
      case "club":
        return `played for ${criterion.label}`
      case "league":
        return `played in ${criterion.label}`
      case "nation":
        return `has nationality ${criterion.label}`
      case "position":
        return `plays ${criterion.label}`
    }
  }

  return `Find a player who ${describe(rowCriteria)} AND ${describe(colCriteria)}`
}

export function generateGridFromSeed(
  seed?: Seed,
): { rows: string[]; columns: string[] } {
  const selected = seed ?? getValidatedFallbackSeed().seed
  return { rows: selected.rows, columns: selected.cols }
}

export interface SeedValidationResult {
  isValid: boolean
  playerCounts: { [key: string]: number }
  invalidCells: string[]
  totalPlayers: number
  minPlayersPerCell: number
  errors: string[]
  /** Witness solution keyed by row-column cell ID; values are stable runtime player IDs. */
  solution: Record<string, string> | null
}

export function findDistinctPlayerAssignment(
  candidates: readonly (readonly string[])[],
): string[] | null {
  const ownerByPlayer = new Map<string, number>()
  const assignment: string[] = []

  function assign(cell: number, visited: Set<string>): boolean {
    for (const playerId of candidates[cell]) {
      if (visited.has(playerId)) continue
      visited.add(playerId)
      const owner = ownerByPlayer.get(playerId)

      if (owner === undefined || assign(owner, visited)) {
        ownerByPlayer.set(playerId, cell)
        assignment[cell] = playerId
        return true
      }
    }

    return false
  }

  for (let cell = 0; cell < candidates.length; cell++) {
    if (!assign(cell, new Set())) return null
  }

  return assignment
}

export function validatePuzzle(
  { rows, cols }: Seed,
  players: readonly PlayerWithImage[] = allPlayers,
  minPlayers = 1,
): SeedValidationResult {
  const playerCounts: { [key: string]: number } = {}
  const invalidCells: string[] = []
  const errors: string[] = []
  const candidates: string[][] = []
  const cellIds: string[] = []
  let totalPlayers = 0
  let minPlayersPerCell = Number.POSITIVE_INFINITY

  if (rows.length !== 3 || cols.length !== 3) {
    errors.push("A puzzle must have exactly 3 rows and 3 columns")
  }

  const criteria = [...rows, ...cols]
  if (new Set(criteria).size !== criteria.length) {
    errors.push("Puzzle criteria must not repeat")
  }

  if (criteria.some(criterion => !getCriterion(criterion))) {
    errors.push("Puzzle contains unsupported criteria")
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      playerCounts,
      invalidCells,
      totalPlayers,
      minPlayersPerCell: 0,
      errors,
      solution: null,
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let colIndex = 0; colIndex < cols.length; colIndex++) {
      const row = rows[rowIndex]
      const col = cols[colIndex]
      const cellLabel = `${getCriterionLabel(row)} × ${getCriterionLabel(col)}`

      const pairing = checkInvalidPairing(row, col)
      if (pairing.isInvalid) {
        errors.push(pairing.reason || `Forbidden pairing: ${cellLabel}`)
      }

      const matches = pairing.isInvalid
        ? []
        : players.filter(
            player =>
              checkCriteria(player, row) &&
              checkCriteria(player, col),
          )

      const playerIds = [...new Set(matches.map(player => player.id))]
      const matchCount = playerIds.length

      candidates.push(playerIds)
      cellIds.push(`${rowIndex}-${colIndex}`)
      playerCounts[cellLabel] = matchCount
      totalPlayers += matchCount
      minPlayersPerCell = Math.min(minPlayersPerCell, matchCount)

      if (matchCount < Math.max(1, minPlayers)) {
        invalidCells.push(cellLabel)
      }
    }
  }

  const assignment =
    errors.length === 0 && invalidCells.length === 0
      ? findDistinctPlayerAssignment(candidates)
      : null

  if (errors.length === 0 && invalidCells.length === 0 && !assignment) {
    errors.push("Puzzle cannot be completed with nine distinct players")
  }

  return {
    isValid:
      errors.length === 0 &&
      invalidCells.length === 0 &&
      assignment !== null,
    playerCounts,
    invalidCells,
    totalPlayers,
    minPlayersPerCell:
      minPlayersPerCell === Number.POSITIVE_INFINITY
        ? 0
        : minPlayersPerCell,
    errors,
    solution: assignment
      ? Object.fromEntries(
          cellIds.map((id, index) => [id, assignment[index]]),
        )
      : null,
  }
}

export function validateSeedWithMinimum(
  rows: string[],
  cols: string[],
  minPlayers = 2,
): boolean {
  return validatePuzzle({ rows, cols }, allPlayers, minPlayers).isValid
}

export function validateSeed(rows: string[], cols: string[]): boolean {
  return validateSeedWithMinimum(rows, cols, 1)
}

export function validateSeedDetailed(
  rows: string[],
  cols: string[],
  minPlayers = 2,
): SeedValidationResult {
  return validatePuzzle({ rows, cols }, allPlayers, minPlayers)
}

function pickRandom<T>(values: readonly T[], random: () => number): T {
  if (!values.length) throw new Error("Cannot choose from an empty criterion pool")
  return values[Math.floor(random() * values.length)]
}

function criterionPool(type: CriterionType): string[] {
  switch (type) {
    case "club":
      return CLUBS
    case "league":
      return LEAGUES
    case "nation":
      return NATIONS
    case "position":
      return POSITIONS
  }
}

function randomType(random: () => number): CriterionType {
  return pickRandom<CriterionType>(
    ["club", "league", "nation", "position"],
    random,
  )
}

function buildCandidateSeed(random: () => number): Seed | null {
  const rowTypes = [randomType(random), randomType(random), randomType(random)]
  const colTypes = [randomType(random), randomType(random), randomType(random)]

  for (const rowType of rowTypes) {
    for (const colType of colTypes) {
      if (
        (rowType === "nation" && colType === "nation") ||
        (rowType === "position" && colType === "position")
      ) {
        return null
      }
    }
  }

  const used = new Set<string>()
  const choose = (type: CriterionType): string | null => {
    const available = criterionPool(type).filter(key => !used.has(key))
    if (!available.length) return null
    const selected = pickRandom(available, random)
    used.add(selected)
    return selected
  }

  const rows = rowTypes.map(choose)
  const cols = colTypes.map(choose)
  if (rows.some(value => value === null) || cols.some(value => value === null)) {
    return null
  }

  return {
    rows: rows as string[],
    cols: cols as string[],
  }
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

export function getValidatedFallbackSeed(): {
  seed: Seed
  validation: SeedValidationResult
} {
  const preferred = { rows: [...ROWS], cols: [...COLUMNS] }
  const preferredValidation = validatePuzzle(preferred)

  if (preferredValidation.isValid) {
    return { seed: preferred, validation: preferredValidation }
  }

  const random = createSeededRandom(1337)

  for (let attempt = 0; attempt < 1000; attempt++) {
    const seed = buildCandidateSeed(random)
    if (!seed) continue

    const validation = validatePuzzle(seed)
    if (validation.isValid) return { seed, validation }
  }

  throw new Error(
    "No deterministic fallback puzzle could be generated from the runtime dataset",
  )
}

export function getValidatedRandomSeed(): {
  seed: Seed
  validation: SeedValidationResult
} {
  for (let attempt = 0; attempt < 100; attempt++) {
    const seed = buildCandidateSeed(Math.random)
    if (!seed) continue

    const validation = validatePuzzle(seed)
    if (validation.isValid) {
      return { seed, validation }
    }
  }

  return getValidatedFallbackSeed()
}

// Compatibility export for any older caller that still expects getRandomSeed().
export function getRandomSeed(): Seed {
  return getValidatedRandomSeed().seed
}

export function getCriterionDisplayName(criteriaKey: string): string {
  return getCriterionLabel(criteriaKey)
}

export function getCriterionType(criteriaKey: string): CriterionType | null {
  return getCriterion(criteriaKey)?.type ?? null
}

export function getCriterionValue(criteriaKey: string): string | null {
  return getCriterion(criteriaKey)?.value ?? null
}

export function getGameCriteria() {
  return GAME_CRITERIA
}
