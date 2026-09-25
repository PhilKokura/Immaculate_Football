import assert from "node:assert/strict"
import { test } from "node:test"
import { GAME_CRITERIA, PLAYERS_DATABASE, getCriterion } from "../components/data/gameData"
import { CLUBS, LEAGUES, NATIONS, POSITIONS, V1_NATION_COUNTERCRITERIA, checkCriteria, getValidatedRandomSeed } from "../lib/gameLogic"
import {
  MIN_NATION_ACTIVE_PLAYERS, MIN_NATION_INTERSECTION_PLAYERS,
  MIN_NATION_QUALIFYING_INTERSECTIONS, qualifiesV1NationHeader,
} from "../lib/dailyPuzzleV1Policy"

test("nation-header thresholds require both active support and five distinct 5-player intersections", () => {
  assert.equal(MIN_NATION_ACTIVE_PLAYERS, 15)
  assert.equal(MIN_NATION_QUALIFYING_INTERSECTIONS, 5)
  assert.equal(MIN_NATION_INTERSECTION_PLAYERS, 5)
  const allowed = new Set(["club:a", "club:b", "league:c", "league:d", "position:e"])
  const allQualify = new Map([...allowed].map(key => [key, 5]))
  assert.equal(qualifiesV1NationHeader(15, allQualify, allowed), true)
  assert.equal(qualifiesV1NationHeader(14, allQualify, allowed), false)
  assert.equal(qualifiesV1NationHeader(15, new Map([...allQualify].slice(0, 4)), allowed), false)
  assert.equal(qualifiesV1NationHeader(15, new Map([...allQualify].map(([key, n], i) =>
    [key, i === 0 ? 4 : n])), allowed), false)
  assert.equal(qualifiesV1NationHeader(15, new Map([...allQualify, ["nation:other", 500]]),
    new Set([...allowed].slice(0, 4))), false)
  assert.equal(qualifiesV1NationHeader(15, new Map([...allQualify, ["nation:other", 500]]),
    allowed), true)
})

test("production nation coverage uses only 30 clubs, five leagues and four positions", () => {
  assert.equal(V1_NATION_COUNTERCRITERIA.length, 39)
  assert.equal(new Set(V1_NATION_COUNTERCRITERIA).size, 39)
  assert.deepEqual(new Set(V1_NATION_COUNTERCRITERIA), new Set([...CLUBS, ...LEAGUES, ...POSITIONS]))
  assert.ok(V1_NATION_COUNTERCRITERIA.every(key => getCriterion(key)?.type !== "nation"))
})

test("current runtime automatically produces 26 qualifying nation headers", () => {
  assert.equal(NATIONS.length, 26)
  const counterSupport = new Map(V1_NATION_COUNTERCRITERIA.map(key => [
    key, new Set(PLAYERS_DATABASE.filter(player => checkCriteria(player, key)).map(player => player.id)),
  ]))
  const allowed = new Set(V1_NATION_COUNTERCRITERIA)
  const actual = GAME_CRITERIA.filter(criterion => criterion.type === "nation").filter(nation => {
    const ids = new Set(PLAYERS_DATABASE.filter(player => checkCriteria(player, nation.key)).map(player => player.id))
    const counts = new Map(V1_NATION_COUNTERCRITERIA.map(key => [
      key, [...ids].filter(id => counterSupport.get(key)!.has(id)).length,
    ]))
    return qualifiesV1NationHeader(ids.size, counts, allowed)
  }).map(nation => nation.key)
  assert.deepEqual(NATIONS, actual)
})

test("confirmed threshold-edge nations are excluded or included without an exception list", () => {
  for (const name of ["Wales", "Mali", "Algeria", "Uruguay"]) {
    assert.equal(NATIONS.includes(`nation:${name}`), false, name)
  }
  for (const name of ["Portugal", "Japan", "Nigeria"]) {
    assert.equal(NATIONS.includes(`nation:${name}`), true, name)
  }
})

test("excluded header nations retain normal eligibility and cannot be generated as headers", () => {
  for (const name of ["Wales", "Mali", "Algeria", "Uruguay"]) {
    const key = `nation:${name}`
    const eligible = PLAYERS_DATABASE.filter(player => checkCriteria(player, key))
    assert.ok(eligible.length > 0, name)
    assert.ok(eligible.every(player => player.nation === name))
  }
  for (let i = 0; i < 30; i++) {
    const { seed } = getValidatedRandomSeed()
    for (const key of [...seed.rows, ...seed.cols]) {
      if (getCriterion(key)?.type === "nation") assert.ok(NATIONS.includes(key), key)
    }
  }
})

