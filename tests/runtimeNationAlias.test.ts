import assert from "node:assert/strict"
import { test } from "node:test"
import { GAME_CRITERIA, PLAYERS_DATABASE } from "../components/data/gameData"

test("confirmed nation aliases merge eligibility while Congo flags use verified codes", () => {
  const nations = GAME_CRITERIA.filter(criterion => criterion.type === "nation")
  const czechia = nations.find(criterion => criterion.key === "nation:Czechia")
  const türkiye = nations.find(criterion => criterion.key === "nation:Türkiye")
  const congo = nations.find(criterion => criterion.key === "nation:Congo")
  const congoDr = nations.find(criterion => criterion.key === "nation:Congo DR")

  assert.equal(nations.length, 100)
  assert.equal(czechia?.eligiblePlayerCount, 10)
  assert.equal(czechia?.image, "https://media.api-sports.io/flags/cz.svg")
  assert.equal(türkiye?.eligiblePlayerCount, 16)
  assert.equal(türkiye?.image, "https://media.api-sports.io/flags/tr.svg")
  assert.equal(congo?.image, "https://media.api-sports.io/flags/cg.svg")
  assert.equal(congoDr?.image, "https://media.api-sports.io/flags/cd.svg")
  assert.ok(congo && congoDr && congo.key !== congoDr.key)
  assert.equal(nations.some(criterion => criterion.key === "nation:Czech Republic"), false)
  assert.equal(nations.some(criterion => criterion.key === "nation:Turkey"), false)
  assert.equal(PLAYERS_DATABASE.some(player => player.nation === "Czech Republic"), false)
  assert.equal(PLAYERS_DATABASE.some(player => player.nation === "Turkey"), false)
})
