import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const players = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_players.json"),
    "utf8",
  ),
)

const criteria = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_criteria.json"),
    "utf8",
  ),
)

/*
  Read the production V1 policy and extract the curated
  FootGrid club UUIDs directly from there.

  This avoids maintaining a second club list for analysis.
*/
const policySource = fs.readFileSync(
  path.join(root, "lib", "dailyPuzzleV1Policy.ts"),
  "utf8",
)

const uuidRegex =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

const curatedClubIds = new Set(
  [...policySource.matchAll(uuidRegex)].map(
    (match) => match[0].toLowerCase(),
  ),
)

console.log(
  `Curated club UUIDs found in production policy: ${curatedClubIds.size}`,
)

if (curatedClubIds.size !== 30) {
  throw new Error(
    `Expected 30 curated club UUIDs, found ${curatedClubIds.size}`,
  )
}

function typeOf(criterion) {
  return (
    criterion.type ??
    criterion.kind ??
    criterion.key?.split(":")[0]
  )
}

function valueOf(criterion) {
  return criterion.key
    ?.split(":")
    .slice(1)
    .join(":")
}

function labelOf(criterion) {
  return (
    criterion.label ??
    criterion.name ??
    criterion.key
  )
}

function matches(player, criterion) {
  const type = typeOf(criterion)
  const value = valueOf(criterion)

  if (type === "club") {
    return player.clubs?.includes(value) ?? false
  }

  if (type === "league") {
    return player.leagues?.includes(value) ?? false
  }

  if (type === "position") {
    return player.positions?.includes(value) ?? false
  }

  throw new Error(`Unexpected counter criterion type: ${type}`)
}

/*
  Nation countercriteria:
  - curated 30 clubs
  - all 5 leagues
  - all 4 positions

  Nation criteria are deliberately excluded because
  Nation × Nation cells are forbidden.
*/
const counterCriteria = criteria.filter((criterion) => {
  const type = typeOf(criterion)

  if (type === "club") {
    return curatedClubIds.has(
      String(valueOf(criterion)).toLowerCase(),
    )
  }

  return (
    type === "league" ||
    type === "position"
  )
})

const counterCounts = {
  club: counterCriteria.filter((c) => typeOf(c) === "club").length,
  league: counterCriteria.filter((c) => typeOf(c) === "league").length,
  position: counterCriteria.filter((c) => typeOf(c) === "position").length,
}

console.log("Countercriteria:", counterCounts)
console.log(`Total countercriteria: ${counterCriteria.length}`)

if (
  counterCounts.club !== 30 ||
  counterCounts.league !== 5 ||
  counterCounts.position !== 4
) {
  throw new Error(
    "Unexpected production countercriterion pool",
  )
}

const nationMap = new Map()

for (const player of players) {
  if (!player.nation) continue

  if (!nationMap.has(player.nation)) {
    nationMap.set(player.nation, [])
  }

  nationMap.get(player.nation).push(player)
}

const results = []

for (const [nation, nationPlayers] of nationMap) {
  const intersections = counterCriteria.map((criterion) => {
    const count = nationPlayers.filter(
      (player) => matches(player, criterion),
    ).length

    return {
      type: typeOf(criterion),
      label: labelOf(criterion),
      count,
    }
  })

  const atLeast3 = intersections.filter(
    (entry) => entry.count >= 3,
  )

  const atLeast5 = intersections.filter(
    (entry) => entry.count >= 5,
  )

  const atLeast10 = intersections.filter(
    (entry) => entry.count >= 10,
  )

  const supportPass =
    nationPlayers.length >= 15

  const coveragePass =
    atLeast5.length >= 10

  results.push({
    nation,
    players: nationPlayers.length,
    intersections3Plus: atLeast3.length,
    intersections5Plus: atLeast5.length,
    intersections10Plus: atLeast10.length,
    supportPass,
    coveragePass,
    autoEligible:
      supportPass && coveragePass,
    bestIntersections: [...intersections]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(
        (entry) =>
          `${entry.label}:${entry.count}`,
      )
      .join(" | "),
  })
}

results.sort(
  (a, b) =>
    b.players - a.players ||
    a.nation.localeCompare(b.nation),
)

const eligible =
  results.filter(
    (row) => row.autoEligible,
  )

const enoughPlayersButCoverageFails =
  results.filter(
    (row) =>
      row.supportPass &&
      !row.coveragePass,
  )

const under15ButCoveragePasses =
  results.filter(
    (row) =>
      !row.supportPass &&
      row.coveragePass,
  )

console.log("")
console.log("----- SUMMARY -----")
console.table({
  totalNations: results.length,
  automaticEligible: eligible.length,
  support15Plus: results.filter((r) => r.supportPass).length,
  coverage10x5Plus: results.filter((r) => r.coveragePass).length,
  supportPassCoverageFail:
    enoughPlayersButCoverageFails.length,
  under15ButCoveragePass:
    under15ButCoveragePasses.length,
})

console.log("")
console.log("----- AUTOMATICALLY ELIGIBLE -----")

console.table(
  eligible.map((row) => ({
    Nation: row.nation,
    Players: row.players,
    ">=3": row.intersections3Plus,
    ">=5": row.intersections5Plus,
    ">=10": row.intersections10Plus,
  })),
)

console.log("")
console.log("----- >=15 PLAYERS BUT COVERAGE FAILS -----")

console.table(
  enoughPlayersButCoverageFails.map((row) => ({
    Nation: row.nation,
    Players: row.players,
    ">=5 Intersections": row.intersections5Plus,
    Best: row.bestIntersections,
  })),
)

console.log("")
console.log("----- <15 PLAYERS BUT COVERAGE PASSES -----")
console.log("Potential whitelist candidates:")

console.table(
  under15ButCoveragePasses.map((row) => ({
    Nation: row.nation,
    Players: row.players,
    ">=5 Intersections": row.intersections5Plus,
    ">=10 Intersections": row.intersections10Plus,
    Best: row.bestIntersections,
  })),
)

console.log("")
console.log("----- ALL NATIONS 10-20 PLAYERS -----")

console.table(
  results
    .filter(
      (row) =>
        row.players >= 10 &&
        row.players <= 20,
    )
    .map((row) => ({
      Nation: row.nation,
      Players: row.players,
      ">=3": row.intersections3Plus,
      ">=5": row.intersections5Plus,
      ">=10": row.intersections10Plus,
      CoveragePass: row.coveragePass,
      AutoEligible: row.autoEligible,
    })),
)