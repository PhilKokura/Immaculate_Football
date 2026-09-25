import {
  GAME_CRITERIA,
  PLAYERS_DATABASE,
  getCriteriaByType,
  getCriterion,
  getCriterionLabel,
  type CriterionType,
  type GameCriterion,
  type PlayerWithImage,
} from "@/components/data/gameData"

import {
  CURATED_V1_CLUB_IDS, MIN_CELL_SOLUTIONS, MAX_HARD_CELLS, MIN_SOFT_CELLS, MIN_EASY_CELLS,
  hasV1AxisDiversity, meetsV1CellPolicy, qualifiesV1NationHeader, v1DifficultyCounts,
} from "./dailyPuzzleV1Policy"

import { CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT, V1_ACHIEVEMENT_KEYS } from "./achievementCriteria"

export type { PlayerWithImage } from "@/components/data/gameData"

// FootGrid UUIDs define the V1 header allowlist; no display-name aliases are used.
export const CLUBS = CURATED_V1_CLUB_IDS.map(id => {
  const criterion = getCriterion(`club:${id}`)
  if (criterion?.type !== "club") throw new Error(`Missing curated V1 club: ${id}`)
  return criterion.key
})
export const LEAGUES = getCriteriaByType("league").map(criterion => criterion.key)
export const POSITIONS = getCriteriaByType("position").map(criterion => criterion.key)
export const ACHIEVEMENTS = V1_ACHIEVEMENT_KEYS.map(key => {
  const criterion = getCriterion(`achievement:${key}`)
  if (criterion?.type !== "achievement") throw new Error(`Missing V1 achievement: ${key}`)
  return criterion.key
})
export const V1_NATION_COUNTERCRITERIA = [...CLUBS, ...LEAGUES, ...POSITIONS]

function computeV1NationHeaderPool(): string[] {
  const allowedCounters = new Set(V1_NATION_COUNTERCRITERIA)
  const counterSupport = new Map(V1_NATION_COUNTERCRITERIA.map(key => [
    key, new Set(PLAYERS_DATABASE.filter(player => checkCriteria(player, key)).map(player => player.id)),
  ]))
  return getCriteriaByType("nation").filter(nation => {
    const nationPlayers = new Set(
      PLAYERS_DATABASE.filter(player => checkCriteria(player, nation.key)).map(player => player.id),
    )
    const counts = new Map(V1_NATION_COUNTERCRITERIA.map(key => [
      key, intersectionCount(nationPlayers, counterSupport.get(key)!),
    ]))
    return qualifiesV1NationHeader(nationPlayers.size, counts, allowedCounters)
  }).map(nation => nation.key)
}

// Header eligibility only. Every runtime nation remains available to checkCriteria.
export const NATIONS = computeV1NationHeaderPool()

// Legacy sample seed for diagnostic scripts. Production fallback uses V1 constraint search.
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
    case "achievement":
      return player.achievements.includes(criterion.value)
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

  const achievement = row.type === "achievement" ? row : col.type === "achievement" ? col : null
  const league = row.type === "league" ? row : col.type === "league" ? col : null
  if (achievement && league &&
      CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT[achievement.value] === league.key) {
    return {
      isInvalid: true,
      reason: `Invalid pairing: ${achievement.label} duplicates ${league.label}`,
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
      case "achievement":
        return `has won ${criterion.label}`
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
  /** Canonical row-major cell support; unlike labels, indices cannot collide. */
  cellCounts: number[]
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
  const cellCounts: number[] = []
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
      cellCounts,
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
      cellCounts.push(matchCount)
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
    cellCounts,
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

type PairSupport = { count: number }
interface PreparedV1Generation {
  criteria: GameCriterion[]
  pairSupport: Map<string, PairSupport>
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function intersectionCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  let count = 0
  for (const id of smaller) if (larger.has(id)) count++
  return count
}

function prepareV1Generation(): PreparedV1Generation {
  const allowed = new Set([...CLUBS, ...LEAGUES, ...NATIONS, ...POSITIONS, ...ACHIEVEMENTS])
  const criteria = GAME_CRITERIA.filter(criterion => allowed.has(criterion.key))
  const support = new Map<string, Set<string>>()
  for (const criterion of criteria) {
    support.set(criterion.key, new Set(
      allPlayers.filter(player => checkCriteria(player, criterion.key)).map(player => player.id),
    ))
  }

  // Pair validity and eligibility use the same matcher and pairing rules as gameplay.
  const pairSupport = new Map<string, PairSupport>()
  for (let i = 0; i < criteria.length; i++) {
    for (let j = i + 1; j < criteria.length; j++) {
      const a = criteria[i], b = criteria[j]
      if (checkInvalidPairing(a.key, b.key).isInvalid) continue
      const count = intersectionCount(support.get(a.key)!, support.get(b.key)!)
      if (count >= MIN_CELL_SOLUTIONS) pairSupport.set(pairKey(a.key, b.key), { count })
    }
  }
  return { criteria, pairSupport }
}

let preparedV1: PreparedV1Generation | null = null
function preparedGeneration(): PreparedV1Generation {
  return preparedV1 ??= prepareV1Generation()
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

interface ColumnOption {
  criterion: GameCriterion
  counts: number[]
  hard: number
  soft: number
  easy: number
}

function findColumnOptions(
  rows: readonly GameCriterion[],
  prepared: PreparedV1Generation,
  random: () => number,
): ColumnOption[] {
  const rowKeys = new Set(rows.map(row => row.key))
  const options: ColumnOption[] = []
  for (const criterion of prepared.criteria) {
    if (rowKeys.has(criterion.key)) continue
    const pairs = rows.map(row => prepared.pairSupport.get(pairKey(row.key, criterion.key)))
    if (pairs.some(pair => !pair)) continue
    const counts = pairs.map(pair => pair!.count)
    const { hard, soft, easy } = v1DifficultyCounts(counts)
    if (hard <= MAX_HARD_CELLS) options.push({ criterion, counts, hard, soft, easy })
  }
  return shuffle(options, random)
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

/** Policy applies only when creating a new puzzle; stored Daily Puzzles remain unchanged. */
export function satisfiesV1GenerationPolicy(seed: Seed, validation: SeedValidationResult): boolean {
  if (!validation.isValid || seed.rows.length !== 3 || seed.cols.length !== 3) return false
  const headers = [...seed.rows, ...seed.cols]
  if (new Set(headers).size !== 6) return false
  const allowed = new Set([...CLUBS, ...LEAGUES, ...NATIONS, ...POSITIONS, ...ACHIEVEMENTS])
  if (headers.some(key => !allowed.has(key))) return false
  const rowTypes = seed.rows.map(key => getCriterion(key)!.type)
  const colTypes = seed.cols.map(key => getCriterion(key)!.type)
  if (!hasV1AxisDiversity(rowTypes) || !hasV1AxisDiversity(colTypes)) return false
  return meetsV1CellPolicy(validation.cellCounts)
}

export interface GeneratedV1Puzzle {
  seed: Seed
  validation: SeedValidationResult
  rowAttempts: number
  usedFallback: boolean
}

function searchV1Puzzle(random: () => number, maxRowAttempts: number): GeneratedV1Puzzle | null {
  const prepared = preparedGeneration()
  for (let attempt = 0; attempt < maxRowAttempts; attempt++) {
    const rows = shuffle(prepared.criteria, random).slice(0, 3)
    if (!hasV1AxisDiversity(rows.map(row => row.type))) continue
    const options = findColumnOptions(rows, prepared, random)
    if (options.length < 3) continue

    const selected: ColumnOption[] = []
    let accepted: { seed: Seed; validation: SeedValidationResult } | null = null
    function chooseColumns(start: number, hard: number, soft: number, easy: number): void {
      if (accepted) return
      if (selected.length === 3) {
        if (soft < MIN_SOFT_CELLS || easy < MIN_EASY_CELLS ||
            !hasV1AxisDiversity(selected.map(option => option.criterion.type))) return
        const seed: Seed = {
          rows: rows.map(row => row.key),
          cols: selected.map(option => option.criterion.key),
        }
        const counts = rows.flatMap((_, rowIndex) => selected.map(option => option.counts[rowIndex]))
        if (!meetsV1CellPolicy(counts)) return
        const validation = validatePuzzle(seed, allPlayers, MIN_CELL_SOLUTIONS)
        if (satisfiesV1GenerationPolicy(seed, validation)) accepted = { seed, validation }
        return
      }
      const needed = 3 - selected.length
      if (options.length - start < needed) return
      for (let i = start; i <= options.length - needed; i++) {
        const option = options[i]
        if (hard + option.hard > MAX_HARD_CELLS) continue
        selected.push(option)
        chooseColumns(i + 1, hard + option.hard, soft + option.soft, easy + option.easy)
        selected.pop()
        if (accepted) return
      }
    }
    chooseColumns(0, 0, 0, 0)
    const found = accepted as { seed: Seed; validation: SeedValidationResult } | null
    if (found) return { ...found, rowAttempts: attempt + 1, usedFallback: false }
  }
  return null
}

let fallbackV1: GeneratedV1Puzzle | null = null
export function getValidatedFallbackSeed(): GeneratedV1Puzzle {
  if (!fallbackV1) {
    fallbackV1 = searchV1Puzzle(createSeededRandom(1337), 10_000)
    if (!fallbackV1) throw new Error("No deterministic fallback satisfies V1 Daily Puzzle rules")
  }
  return { ...fallbackV1, seed: { rows: [...fallbackV1.seed.rows], cols: [...fallbackV1.seed.cols] },
    usedFallback: true }
}

export function getValidatedRandomSeed(random: () => number = Math.random): GeneratedV1Puzzle {
  const generated = searchV1Puzzle(random, 250)
  if (generated) return generated
  const fallback = getValidatedFallbackSeed()
  return { ...fallback, rowAttempts: 250 + fallback.rowAttempts }
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
