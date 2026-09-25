import assert from "node:assert/strict"
import { test } from "node:test"
import { GAME_CRITERIA, PLAYERS_DATABASE, getCriterion } from "../components/data/gameData"
import {
  CLUBS, LEAGUES, NATIONS, POSITIONS, checkCriteria, checkInvalidPairing,
  getValidatedFallbackSeed, getValidatedRandomSeed, satisfiesV1GenerationPolicy,
  validatePuzzle, type Seed,
} from "../lib/gameLogic"
import {
  CURATED_V1_CLUB_IDS, MIN_CELL_SOLUTIONS, HARD_MAX_SOLUTIONS,
  MAX_HARD_CELLS, SOFT_MAX_SOLUTIONS, MIN_SOFT_CELLS,
  EASY_MIN_SOLUTIONS, MIN_EASY_CELLS, MIN_CRITERION_TYPES_PER_AXIS,
  meetsV1CellPolicy,
} from "../lib/dailyPuzzleV1Policy"
import { parseDailyPuzzle } from "../lib/dailyPuzzleRecord"

function assertV1Puzzle(seed: Seed): void {
  const validation = validatePuzzle(seed, PLAYERS_DATABASE, MIN_CELL_SOLUTIONS)
  assert.equal(validation.isValid, true, JSON.stringify(validation.errors))
  assert.equal(satisfiesV1GenerationPolicy(seed, validation), true)
  const headers = [...seed.rows, ...seed.cols]
  assert.equal(new Set(headers).size, 6)
  assert.ok(new Set(seed.rows.map(key => getCriterion(key)?.type)).size >= MIN_CRITERION_TYPES_PER_AXIS)
  assert.ok(new Set(seed.cols.map(key => getCriterion(key)?.type)).size >= MIN_CRITERION_TYPES_PER_AXIS)
  for (const row of seed.rows) {
    for (const col of seed.cols) assert.equal(checkInvalidPairing(row, col).isInvalid, false)
  }
  const counts = validation.cellCounts
  assert.equal(counts.length, 9)
  assert.ok(counts.every(count => count >= MIN_CELL_SOLUTIONS))
  assert.ok(counts.filter(count => count <= HARD_MAX_SOLUTIONS).length <= MAX_HARD_CELLS)
  assert.ok(counts.filter(count => count <= SOFT_MAX_SOLUTIONS).length >= MIN_SOFT_CELLS)
  assert.ok(counts.filter(count => count >= EASY_MIN_SOLUTIONS).length >= MIN_EASY_CELLS)
  assert.equal(meetsV1CellPolicy(counts), true)
  assert.ok(validation.solution)
  assert.equal(new Set(Object.values(validation.solution)).size, 9)
}

test("V1 header pools use exactly 30 configured FootGrid club UUIDs and all other supported criteria", () => {
  assert.equal(CURATED_V1_CLUB_IDS.length, 30)
  assert.equal(new Set(CURATED_V1_CLUB_IDS).size, 30)
  assert.deepEqual(CLUBS, CURATED_V1_CLUB_IDS.map(id => `club:${id}`))
  assert.ok(CLUBS.every(key => getCriterion(key)?.type === "club"))
  assert.deepEqual(new Set(CLUBS.map(key => getCriterion(key)?.label)), new Set([
    "Arsenal", "Chelsea", "Liverpool", "Manchester City", "Manchester United", "Tottenham",
    "Bayern München", "Borussia Dortmund", "Bayer Leverkusen", "RB Leipzig",
    "Eintracht Frankfurt", "FC Schalke 04", "Real Madrid", "Barcelona",
    "Atletico Madrid", "Sevilla", "Valencia", "Athletic Club", "Inter", "AC Milan",
    "Juventus", "AS Roma", "Napoli", "Lazio", "Paris Saint Germain", "Marseille",
    "Lyon", "Monaco", "Lille", "Rennes",
  ]))
  assert.deepEqual(new Set(LEAGUES), new Set(GAME_CRITERIA.filter(c => c.type === "league").map(c => c.key)))
  assert.equal(NATIONS.length, 26)
  assert.ok(NATIONS.every(key => GAME_CRITERIA.some(c => c.type === "nation" && c.key === key)))
  assert.deepEqual(new Set(POSITIONS), new Set(["position:GK", "position:DEF", "position:MID", "position:ATT"]))
})

test("generated Daily Puzzles satisfy every V1 policy and distinct-player condition", () => {
  for (let i = 0; i < 30; i++) assertV1Puzzle(getValidatedRandomSeed().seed)
})

test("deterministic fallback is repeatable and obeys exactly the same V1 policy", () => {
  const first = getValidatedFallbackSeed()
  assert.deepEqual(first.seed, getValidatedFallbackSeed().seed)
  assertV1Puzzle(first.seed)
})

test("non-curated historical clubs remain in runtime career eligibility", () => {
  const allowed = new Set(CLUBS)
  const historical = GAME_CRITERIA.find(c => c.type === "club" && !allowed.has(c.key) &&
    PLAYERS_DATABASE.some(player => player.clubs.includes(c.value)))
  assert.ok(historical)
  const player = PLAYERS_DATABASE.find(candidate => candidate.clubs.includes(historical.value))
  assert.ok(player)
  assert.equal(checkCriteria(player, historical.key), true)
  assert.equal(allowed.has(historical.key), false)
})

test("already stored playable Daily Puzzle rows retain their six keys even if outside V1 policy", () => {
  const fallback = getValidatedFallbackSeed().seed
  const nonCurated = GAME_CRITERIA.find(c => c.type === "club" && !CLUBS.includes(c.key) &&
    validatePuzzle({ rows: [c.key, ...fallback.rows.slice(1)], cols: fallback.cols }).isValid)
  assert.ok(nonCurated)
  const oldSeed = { rows: [nonCurated.key, ...fallback.rows.slice(1)], cols: fallback.cols }
  assert.equal(satisfiesV1GenerationPolicy(oldSeed, validatePuzzle(oldSeed)), false)
  const stored = {
    id: "stored-puzzle", puzzle_date: "2026-09-25",
    row_criteria: oldSeed.rows, column_criteria: oldSeed.cols,
    created_at: "2026-09-25T00:00:00Z",
  }
  const parsed = parseDailyPuzzle(stored, stored.puzzle_date)
  assert.deepEqual(parsed, stored)
})

