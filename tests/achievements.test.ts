import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { GAME_CRITERIA, PLAYERS_DATABASE, getCriterion } from "../components/data/gameData"
import { ACHIEVEMENTS, CLUBS, LEAGUES, NATIONS, POSITIONS, checkCriteria, checkInvalidPairing, getValidatedRandomSeed, satisfiesV1GenerationPolicy, validatePuzzle } from "../lib/gameLogic"
import { CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT, V1_ACHIEVEMENT_KEYS } from "../lib/achievementCriteria"
import { buildRuntimeAchievements } from "../scripts/runtime-achievements"

test("runtime achievement keys, labels and player links come from canonical Supabase data", () => {
  const criteria = GAME_CRITERIA.filter(c => c.type === "achievement")
  assert.equal(criteria.length, 10)
  assert.deepEqual(new Set(criteria.map(c => c.key)),
    new Set(V1_ACHIEVEMENT_KEYS.map(key => `achievement:${key}`)))
  assert.ok(criteria.every(c => c.label.length > 0 && c.currentLeagueKey === null))
  assert.equal(PLAYERS_DATABASE.filter(player => player.achievements.length > 0).length, 475)
  assert.equal(PLAYERS_DATABASE.reduce((sum, player) => sum + player.achievements.length, 0), 699)
  for (const criterion of criteria) {
    assert.equal(criterion.eligiblePlayerCount,
      PLAYERS_DATABASE.filter(player => checkCriteria(player, criterion.key)).length)
  }
  const builder = readFileSync("scripts/build-runtime-from-supabase.ts", "utf8")
  assert.match(builder, /"player_achievements", "player_id,achievement_key"/)
  assert.match(builder, /"achievements", "key,label"/)
  assert.doesNotMatch(builder, /api-football-trophies|relevant-title-winners/)
})

test("canonical achievement matching accepts linked players and rejects others", () => {
  const key = "achievement:champions-league-winner"
  const winner = PLAYERS_DATABASE.find(player => player.achievements.includes("champions-league-winner"))
  const nonWinner = PLAYERS_DATABASE.find(player => !player.achievements.includes("champions-league-winner"))
  assert.ok(winner && nonWinner)
  assert.equal(checkCriteria(winner, key), true)
  assert.equal(checkCriteria(nonWinner, key), false)
  assert.equal(checkCriteria(winner, "achievement:unknown"), false)
})

test("achievement pairs are allowed except the five corresponding domestic league pairs", () => {
  assert.equal(checkInvalidPairing("achievement:champions-league-winner",
    "achievement:europa-league-winner").isInvalid, false)
  assert.equal(checkInvalidPairing("achievement:champions-league-winner",
    CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT["premier-league-champion"]).isInvalid, false)
  assert.equal(checkInvalidPairing("achievement:europa-league-winner",
    CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT["premier-league-champion"]).isInvalid, false)
  assert.equal(checkInvalidPairing("achievement:world-cup-winner", "nation:France").isInvalid, false)
  for (const [achievement, league] of Object.entries(CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT)) {
    assert.equal(getCriterion(league)?.type, "league")
    assert.equal(checkInvalidPairing(`achievement:${achievement}`, league).isInvalid, true)
    assert.equal(checkInvalidPairing(league, `achievement:${achievement}`).isInvalid, true)
    for (const otherLeague of LEAGUES.filter(key => key !== league)) {
      assert.equal(checkInvalidPairing(`achievement:${achievement}`, otherLeague).isInvalid, false)
    }
  }
})

test("all ten achievements join the 75-criterion V1 header pool", () => {
  assert.equal(CLUBS.length, 30)
  assert.equal(NATIONS.length, 26)
  assert.equal(LEAGUES.length, 5)
  assert.equal(POSITIONS.length, 4)
  assert.equal(ACHIEVEMENTS.length, 10)
  assert.equal(new Set([...CLUBS, ...NATIONS, ...LEAGUES, ...POSITIONS, ...ACHIEVEMENTS]).size, 75)
  assert.deepEqual(new Set(ACHIEVEMENTS),
    new Set(V1_ACHIEVEMENT_KEYS.map(key => `achievement:${key}`)))
  for (let i = 0; i < 30; i++) {
    const {seed,validation} = getValidatedRandomSeed()
    assert.equal(satisfiesV1GenerationPolicy(seed, validation), true)
    assert.equal(validatePuzzle(seed).isValid, true)
    assert.ok(validation.solution && new Set(Object.values(validation.solution)).size === 9)
  }
})

test("runtime build rejects missing achievement catalog and link references", () => {
  const catalog = V1_ACHIEVEMENT_KEYS.map(key => ({key,label:key}))
  const playerIds = new Set(["player-a"])
  const mapped = buildRuntimeAchievements(catalog, [
    {player_id:"player-a",achievement_key:"world-cup-winner"},
    {player_id:"player-a",achievement_key:"world-cup-winner"},
  ], playerIds)
  assert.deepEqual(mapped.get("player-a"), ["world-cup-winner"])
  assert.throws(() => buildRuntimeAchievements(catalog.slice(1), [], playerIds),
    /Missing achievement catalog key/)
  assert.throws(() => buildRuntimeAchievements(catalog, [
    {player_id:"player-a",achievement_key:"unknown-achievement"},
  ], playerIds), /missing achievement/)
  assert.throws(() => buildRuntimeAchievements(catalog, [
    {player_id:"unknown-player",achievement_key:"world-cup-winner"},
  ], playerIds), /unknown player/)
})

