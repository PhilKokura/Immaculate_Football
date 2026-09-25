import assert from "node:assert/strict"
import { runtimeCriterion } from "./runtimeCriterion"
import { test } from "node:test"
import {
  allPlayers,
  checkCriteria,
  checkInvalidPairing,
  COLUMNS,
  ROWS,
  findDistinctPlayerAssignment,
  getValidatedFallbackSeed,
  getValidatedRandomSeed,
  validatePlayerSelection,
  validatePuzzle,
  validateSeed,
  validateSeedDetailed,
  validateSeedWithMinimum,
  type PlayerWithImage,
  type Seed,
} from "../lib/gameLogic"
import {
  getPlayersByCriteria,
  PLAYERS_DATABASE,
} from "../components/data/players"

const bayern = runtimeCriterion("club", "Bayern München")
const paris = runtimeCriterion("club", "Paris Saint Germain")
const serieA = runtimeCriterion("league", "Serie A")
const premierLeague = runtimeCriterion("league", "Premier League")
const bundesliga = runtimeCriterion("league", "Bundesliga")

const seed: Seed = {
  rows: ["nation:Brazil", "nation:Spain", bayern.key],
  cols: [serieA.key, premierLeague.key, "position:ATT"],
}

function player(
  name: string,
  nation = "Germany",
  identity = name,
): PlayerWithImage {
  return {
    id: `test:${identity}`,
    externalId: identity,
    name,
    searchNames: [name],
    image: null,
    birthDate: null,
    clubs: [bayern.value],
    clubNames: ["Bayern München"],
    leagues: [serieA.value, premierLeague.value],
    nation,
    rarity: 0.1,
    positions: ["ATT"],
    currentClubs: [
      {
        id: bayern.value,
        name: "Bayern München",
      },
    ],
    currentClubAmbiguous: false,
  }
}

const solvablePlayers = Array.from(
  { length: 9 },
  (_, i) =>
    player(
      `Player ${i}`,
      i < 3
        ? "Brazil"
        : i < 6
          ? "Spain"
          : "Germany",
      String(i),
    ),
)

function assertSolution(
  puzzle: Seed,
  players: readonly PlayerWithImage[],
) {
  const result = validatePuzzle(puzzle, players)

  assert.equal(
    result.isValid,
    true,
    JSON.stringify(result),
  )

  assert.ok(result.solution)
  assert.equal(Object.keys(result.solution).length, 9)
  assert.equal(
    new Set(Object.values(result.solution)).size,
    9,
  )

  for (
    const [cell, playerId]
    of Object.entries(result.solution)
  ) {
    const [row, col] = cell.split("-").map(Number)

    const selected = players.find(
      candidate => candidate.id === playerId,
    )

    assert.ok(selected)

    assert.equal(
      validatePlayerSelection(
        selected,
        puzzle.rows[row],
        puzzle.cols[col],
      ).isValid,
      true,
    )
  }
}

test("rejects Position × Position pairings", () => {
  const puzzle: Seed = {
    rows: [
      "nation:Brazil",
      "nation:Spain",
      "position:MID",
    ],
    cols: [
      "position:ATT",
      premierLeague.key,
      paris.key,
    ],
  }

  const result = validatePuzzle(puzzle)

  assert.equal(result.isValid, false)

  assert.ok(
    result.invalidCells.includes(
      "Midfielder × Attacker",
    ),
  )

  assert.equal(
    result.playerCounts[
      "Midfielder × Attacker"
    ],
    0,
  )

  assert.equal(
    validateSeed(puzzle.rows, puzzle.cols),
    false,
  )

  assert.equal(
    validateSeedDetailed(
      puzzle.rows,
      puzzle.cols,
    ).isValid,
    false,
  )

  assert.equal(
    validateSeedWithMinimum(
      puzzle.rows,
      puzzle.cols,
      0,
    ),
    false,
  )
})

test("rejects Nation × Nation pairings", () => {
  const puzzle: Seed = {
    rows: [
      bayern.key,
      premierLeague.key,
      "nation:Brazil",
    ],
    cols: [
      serieA.key,
      "position:ATT",
      "nation:Germany",
    ],
  }

  const result = validatePuzzle(puzzle)

  assert.equal(result.isValid, false)

  assert.ok(
    result.invalidCells.includes(
      "Brazil × Germany",
    ),
  )
})

test("preserves forbidden pairing rules in both orientations", () => {
  const invalidPairs = [
    ["nation:Brazil", "nation:Germany"],
    ["position:MID", "position:ATT"],
    [bayern.key, bundesliga.key],
  ] as const

  for (const [a, b] of invalidPairs) {
    assert.equal(
      checkInvalidPairing(a, b).isInvalid,
      true,
    )

    assert.equal(
      checkInvalidPairing(b, a).isInvalid,
      true,
    )

    assert.equal(
      validatePlayerSelection(
        player("Any"),
        a,
        b,
      ).isValid,
      false,
    )
  }

  assert.equal(
    checkInvalidPairing(
      bayern.key,
      serieA.key,
    ).isInvalid,
    false,
  )
})

test("requires exactly three rows and three columns", () => {
  for (const puzzle of [
    {
      ...seed,
      rows: seed.rows.slice(0, 2),
    },
    {
      ...seed,
      cols: [
        ...seed.cols,
        "position:DEF",
      ],
    },
    {
      rows: [],
      cols: [],
    },
  ]) {
    assert.equal(
      validatePuzzle(
        puzzle,
        solvablePlayers,
      ).isValid,
      false,
    )
  }
})

test("rejects repeated and unsupported criteria", () => {
  for (const puzzle of [
    {
      ...seed,
      rows: [
        "nation:Brazil",
        "nation:Brazil",
        bayern.key,
      ],
    },
    {
      ...seed,
      cols: [
        serieA.key,
        premierLeague.key,
        bayern.key,
      ],
    },
    {
      ...seed,
      cols: [
        serieA.key,
        premierLeague.key,
        "club:unsupported",
      ],
    },
  ]) {
    assert.equal(
      validatePuzzle(
        puzzle,
        solvablePlayers,
      ).isValid,
      false,
    )
  }
})

test("rejects an empty intersection even with a zero requested minimum", () => {
  const result = validatePuzzle(
    seed,
    solvablePlayers.filter(
      candidate =>
        candidate.nation !== "Brazil",
    ),
    0,
  )

  assert.equal(result.isValid, false)

  assert.ok(
    result.invalidCells.includes(
      "Brazil × Serie A",
    ),
  )
})

test("rejects a Hall bottleneck even when every cell has candidates", () => {
  const players = Array.from(
    { length: 9 },
    (_, i) =>
      player(
        `Player ${i}`,
        i < 2
          ? "Brazil"
          : i < 6
            ? "Spain"
            : "Germany",
        String(i),
      ),
  )

  const result = validatePuzzle(
    seed,
    players,
  )

  assert.equal(
    Object.keys(result.playerCounts).length,
    9,
  )

  assert.ok(
    Object.values(
      result.playerCounts,
    ).every(count => count > 0),
  )

  assert.equal(
    new Set(
      players.map(candidate => candidate.id),
    ).size,
    9,
  )

  assert.equal(result.isValid, false)
  assert.equal(result.solution, null)

  assert.match(
    result.errors.join(" "),
    /nine distinct players/,
  )
})

test("accepts a complete nine-player solution and returns an ID-based witness", () => {
  assertSolution(
    seed,
    solvablePlayers,
  )
})

test("assignment can reassign earlier choices instead of using a greedy-only search", () => {
  const candidates = [
    ["A", "B"],
    ["A"],
    ...Array.from(
      { length: 7 },
      (_, i) => [`Other ${i}`],
    ),
  ]

  const solution =
    findDistinctPlayerAssignment(
      candidates,
    )

  assert.ok(solution)
  assert.equal(solution[0], "B")
  assert.equal(solution[1], "A")

  assert.equal(
    new Set(solution).size,
    9,
  )
})

test("same display name can represent distinct players when IDs differ", () => {
  const players = solvablePlayers.map(
    (candidate, index) => ({
      ...candidate,
      id: `same-name:${index}`,
      externalId: `same-name-${index}`,
      name: "Same name",
      searchNames: ["Same name"],
    }),
  )

  const result = validatePuzzle(
    seed,
    players,
  )

  assert.equal(
    result.isValid,
    true,
    JSON.stringify(result),
  )

  assert.ok(result.solution)

  assert.equal(
    new Set(
      Object.values(result.solution),
    ).size,
    9,
  )
})

test("duplicate IDs cannot supply distinct players", () => {
  const players = solvablePlayers.map(
    candidate => ({
      ...candidate,
      id: "same-id",
    }),
  )

  const result = validatePuzzle(
    seed,
    players,
  )

  assert.ok(
    Object.values(
      result.playerCounts,
    ).every(count => count === 1),
  )

  assert.equal(
    result.isValid,
    false,
  )

  assert.equal(
    result.solution,
    null,
  )
})

test("provider-backed fallback is always validated", () => {
  const fallback =
    getValidatedFallbackSeed()

  assert.equal(
    fallback.validation.isValid,
    true,
  )

  assertSolution(
    fallback.seed,
    allPlayers,
  )
})

test("active generation validates every generated result", (t) => {
  t.mock.method(
    console,
    "log",
    () => {},
  )

  t.mock.method(
    console,
    "warn",
    () => {},
  )

  let value = 12345

  t.mock.method(
    Math,
    "random",
    () => {
      value =
        (
          Math.imul(
            value,
            1664525,
          ) +
          1013904223
        ) >>> 0

      return value / 2 ** 32
    },
  )

  for (let i = 0; i < 20; i++) {
    const generated =
      getValidatedRandomSeed()

    assert.equal(
      generated.validation.isValid,
      true,
    )

    assertSolution(
      generated.seed,
      allPlayers,
    )
  }
})

test("exhausted random generation falls back to the validated deterministic puzzle", (t) => {
  t.mock.method(
    console,
    "log",
    () => {},
  )

  t.mock.method(
    console,
    "warn",
    () => {},
  )

  // 0.5 always selects Nation as the criterion type.
  // Nation × Nation is forbidden, so all random candidates fail.
  t.mock.method(
    Math,
    "random",
    () => 0.5,
  )

  const expected =
    getValidatedFallbackSeed()

  const generated =
    getValidatedRandomSeed()

  assert.deepEqual(
    generated.seed,
    expected.seed,
  )

  assert.equal(
    generated.validation.isValid,
    true,
  )
})

test("an invalid preferred fallback is replaced by a validated deterministic fallback", () => {
  const original = COLUMNS[2]

  try {
    COLUMNS[2] =
      "nation:Germany"

    const fallback =
      getValidatedFallbackSeed()

    assert.equal(
      fallback.validation.isValid,
      true,
    )

    assert.notDeepEqual(
      fallback.seed,
      {
        rows: ROWS,
        cols: COLUMNS,
      },
    )

    assertSolution(
      fallback.seed,
      allPlayers,
    )
  } finally {
    COLUMNS[2] = original
  }
})

test("criteria lookup uses canonical criterion keys", () => {
  assert.deepEqual(
    getPlayersByCriteria(bayern.key),
    PLAYERS_DATABASE.filter(candidate => checkCriteria(candidate, bayern.key)),
  )
})

