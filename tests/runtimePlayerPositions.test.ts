import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  buildPlayerPositionMap, countPositionSupport, requirePlayerPositions,
} from "../scripts/runtime-player-positions"

test("canonical positions put primary first, then secondary in GK/DEF/MID/ATT order", () => {
  const positions = buildPlayerPositionMap([
    { player_id: "a", position: "DEF", is_primary: false },
    { player_id: "a", position: "ATT", is_primary: false },
    { player_id: "a", position: "MID", is_primary: true },
    { player_id: "a", position: "GK", is_primary: false },
    { player_id: "b", position: "ATT", is_primary: true },
  ])
  assert.deepEqual(requirePlayerPositions("a", positions), ["MID", "GK", "DEF", "ATT"])
  assert.deepEqual(requirePlayerPositions("b", positions), ["ATT"])
})

test("duplicate rows produce one position and retain primary status", () => {
  const positions = buildPlayerPositionMap([
    { player_id: "a", position: "DEF", is_primary: false },
    { player_id: "a", position: "DEF", is_primary: true },
    { player_id: "a", position: "MID", is_primary: false },
  ])
  assert.deepEqual(requirePlayerPositions("a", positions), ["DEF", "MID"])
})

test("an active player missing canonical positions fails instead of using legacy position", () => {
  const positions = buildPlayerPositionMap([])
  assert.throws(() => requirePlayerPositions("missing-player", positions),
    /missing-player.*no canonical player_positions rows/)
  assert.throws(() => buildPlayerPositionMap([
    { player_id: "a", position: "WING", is_primary: true },
  ]), /Malformed player_positions row/)
})

test("multi-position players support each position once", () => {
  const positions = buildPlayerPositionMap([
    { player_id: "a", position: "MID", is_primary: true },
    { player_id: "a", position: "DEF", is_primary: false },
    { player_id: "a", position: "MID", is_primary: true },
    { player_id: "b", position: "DEF", is_primary: true },
  ])
  const counts = countPositionSupport([
    { positions: requirePlayerPositions("a", positions) },
    { positions: requirePlayerPositions("b", positions) },
  ])
  assert.equal(counts.get("MID"), 1)
  assert.equal(counts.get("DEF"), 2)
  assert.equal(counts.get("GK"), undefined)
})

test("runtime builder selects player_positions and never reads players.position", () => {
  const builder = readFileSync("scripts/build-runtime-from-supabase.ts", "utf8")
  assert.match(builder, /"player_positions",\s*"player_id,position,is_primary"/)
  assert.match(builder, /positions: requirePlayerPositions\(player\.id, positionsByPlayer\)/)
  assert.doesNotMatch(builder, /player\.position\b|birth_date,nationality,position,image_url/)
})

