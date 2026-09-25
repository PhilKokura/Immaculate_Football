import assert from "node:assert/strict"
import { runtimeCriterion } from "./runtimeCriterion"
import { test } from "node:test"
import {
  createGameProgress,
  submitPlayerSelection,
  type GameProgress,
} from "../lib/gameSubmission"
import type {
  PlayerWithImage,
  Seed,
} from "../lib/gameLogic"

const bayern = runtimeCriterion("club", "Bayern München")
const serieA = runtimeCriterion("league", "Serie A")
const premierLeague = runtimeCriterion("league", "Premier League")

const seed: Seed = {
  rows: ["nation:Brazil", "nation:Spain", bayern.key],
  cols: [serieA.key, premierLeague.key, "position:ATT"],
}

function makePlayer(
  overrides: Partial<PlayerWithImage> = {},
): PlayerWithImage {
  return {
    id: "test:1",
    externalId: "1",
    name: "Player",
    searchNames: ["Player"],
    image: null,
    birthDate: null,
    clubs: [bayern.value],
    clubNames: ["Bayern München"],
    leagues: [serieA.value, premierLeague.value],
    nation: "Brazil",
    rarity: 0.1,
    positions: ["ATT"],
    currentClubs: [{ id: bayern.value, name: "Bayern München" }],
    currentClubAmbiguous: false,
    ...overrides,
  }
}

const player = makePlayer()

function assertRejected(
  before: GameProgress,
  after: GameProgress,
) {
  assert.ok(after.lastError)
  assert.deepEqual(
    { ...after, lastError: "" },
    { ...before, lastError: "" },
  )
}

test("valid submission updates progress atomically without mutating the input", () => {
  const before = createGameProgress()
  const after = submitPlayerSelection(
    before,
    seed,
    player,
    "0-0",
  )

  assert.equal(after.gridState["0-0"], player)
  assert.equal(after.guesses, 1)
  assert.equal(after.correctAnswers, 1)
  assert.equal(after.remainingAttempts, 8)
  assert.equal(after.usedPlayers.has(player.id), true)
  assert.deepEqual(before, createGameProgress())
})

test("repeated submissions cannot reuse a player or overwrite a completed cell", () => {
  const first = submitPlayerSelection(
    createGameProgress(),
    seed,
    player,
    "0-0",
  )

  assertRejected(
    first,
    submitPlayerSelection(first, seed, player, "0-1"),
  )

  const differentPlayer = makePlayer({
    id: "test:2",
    externalId: "2",
    name: "Different",
    searchNames: ["Different"],
  })

  assertRejected(
    first,
    submitPlayerSelection(
      first,
      seed,
      differentPlayer,
      "0-0",
    ),
  )

  assertRejected(
    first,
    submitPlayerSelection(first, seed, player, "0-0"),
  )
})

test("players with the same display name remain distinct when their IDs differ", () => {
  const first = submitPlayerSelection(
    createGameProgress(),
    seed,
    player,
    "0-0",
  )

  const secondPlayer = makePlayer({
    id: "test:2",
    externalId: "2",
  })

  const second = submitPlayerSelection(
    first,
    seed,
    secondPlayer,
    "0-1",
  )

  assert.equal(second.lastError, "")
  assert.equal(second.correctAnswers, 2)
  assert.equal(second.usedPlayers.has(player.id), true)
  assert.equal(second.usedPlayers.has(secondPlayer.id), true)
})

test("reuse guard also checks occupied cells if the used-id set is incomplete", () => {
  const before = {
    ...createGameProgress(),
    gridState: { "0-0": player },
  }

  assertRejected(
    before,
    submitPlayerSelection(
      before,
      seed,
      player,
      "0-1",
    ),
  )
})

test("exhausted attempts reject submissions, including after the last accepted attempt", () => {
  const before = {
    ...createGameProgress(),
    remainingAttempts: 1,
  }

  const last = submitPlayerSelection(
    before,
    seed,
    player,
    "0-0",
  )

  assert.equal(last.remainingAttempts, 0)

  const differentPlayer = makePlayer({
    id: "test:2",
    externalId: "2",
    name: "Different",
    searchNames: ["Different"],
  })

  assertRejected(
    last,
    submitPlayerSelection(
      last,
      seed,
      differentPlayer,
      "0-1",
    ),
  )

  const negative = {
    ...createGameProgress(),
    remainingAttempts: -1,
  }

  assertRejected(
    negative,
    submitPlayerSelection(
      negative,
      seed,
      player,
      "0-0",
    ),
  )
})

test("ordinary invalid answers still consume an attempt without filling a cell", () => {
  const after = submitPlayerSelection(
    createGameProgress(),
    seed,
    player,
    "1-0",
  )

  assert.equal(after.guesses, 1)
  assert.equal(after.remainingAttempts, 8)
  assert.equal(after.correctAnswers, 0)
  assert.deepEqual(after.gridState, {})
  assert.equal(after.usedPlayers.size, 0)
  assert.ok(after.lastError)
})

test("malformed or unavailable cells never consume attempts", () => {
  const before = createGameProgress()

  for (const cell of [
    "",
    "0-",
    "00-0",
    "-1-0",
    "3-0",
    "NaN-0",
  ]) {
    assertRejected(
      before,
      submitPlayerSelection(
        before,
        seed,
        player,
        cell,
      ),
    )
  }

  assertRejected(
    before,
    submitPlayerSelection(
      before,
      { rows: [], cols: [] },
      player,
      "0-0",
    ),
  )
})