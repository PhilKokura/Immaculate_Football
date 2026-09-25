import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const players = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_players.json"),
    "utf8"
  )
)

const criteria = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_criteria.json"),
    "utf8"
  )
)

function matches(player, criterion) {
  switch (criterion.type) {
    case "club":
      return player.clubs?.includes(criterion.value) ?? false

    case "league":
      return player.leagues?.includes(criterion.value) ?? false

    case "nation":
      return player.nation === criterion.value

    case "position":
      return player.positions?.includes(criterion.value) ?? false

    default:
      return false
  }
}

function percentile(values, p) {
  if (!values.length) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor((sorted.length - 1) * p)

  return sorted[index]
}

function stats(values) {
  return {
    min: Math.min(...values),
    p10: percentile(values, 0.10),
    p25: percentile(values, 0.25),
    median: percentile(values, 0.50),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.90),
    max: Math.max(...values),
  }
}

function intersectionSize(a, b) {
  const smaller = a.size <= b.size ? a : b
  const larger = smaller === a ? b : a

  let count = 0

  for (const id of smaller) {
    if (larger.has(id)) count++
  }

  return count
}

const eligibleByCriterion = new Map()

for (const criterion of criteria) {
  const ids = new Set()

  for (const player of players) {
    if (matches(player, criterion)) {
      ids.add(player.id)
    }
  }

  eligibleByCriterion.set(criterion.key, ids)
}

console.log("----- DATASET -----")
console.log(`Players: ${players.length}`)
console.log(`Criteria: ${criteria.length}`)
console.log("")

console.log("----- CRITERION SUPPORT -----")

for (const type of ["club", "league", "nation", "position"]) {
  const typeCriteria = criteria.filter(
    criterion => criterion.type === type
  )

  const supports = typeCriteria.map(
    criterion => eligibleByCriterion.get(criterion.key).size
  )

  console.log("")
  console.log(`${type.toUpperCase()} (${typeCriteria.length})`)
  console.log(stats(supports))
}

const typePairs = [
  ["club", "club"],
  ["club", "league"],
  ["club", "nation"],
  ["club", "position"],
  ["league", "league"],
  ["league", "nation"],
  ["league", "position"],
  ["nation", "position"],
]

console.log("")
console.log("----- CELL INTERSECTIONS -----")

for (const [typeA, typeB] of typePairs) {
  const a = criteria.filter(c => c.type === typeA)
  const b = criteria.filter(c => c.type === typeB)

  const sizes = []
  let zero = 0
  let one = 0
  let two = 0
  let threeToFive = 0
  let sixToTen = 0
  let elevenPlus = 0

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (typeA === typeB && j <= i) continue

      const size = intersectionSize(
        eligibleByCriterion.get(a[i].key),
        eligibleByCriterion.get(b[j].key)
      )

      if (size === 0) {
        zero++
        continue
      }

      sizes.push(size)

      if (size === 1) one++
      else if (size === 2) two++
      else if (size <= 5) threeToFive++
      else if (size <= 10) sixToTen++
      else elevenPlus++
    }
  }

  console.log("")
  console.log(`${typeA} × ${typeB}`)
  console.log({
    positivePairs: sizes.length,
    zero,
    one,
    two,
    threeToFive,
    sixToTen,
    elevenPlus,
    positiveStats: sizes.length ? stats(sizes) : null,
  })
}

const mali = criteria.find(
  criterion =>
    criterion.type === "nation" &&
    (
      criterion.value?.toLowerCase() === "mali" ||
      criterion.label?.toLowerCase() === "mali"
    )
)

console.log("")
console.log("----- MALI -----")

if (!mali) {
  console.log("Mali criterion not found.")
} else {
  const maliSet = eligibleByCriterion.get(mali.key)

  console.log(`Support: ${maliSet.size}`)
  console.log(`Key: ${mali.key}`)

  const intersections = []

  for (const criterion of criteria) {
    if (criterion.key === mali.key) continue

    // Nation × Nation is forbidden in the game.
    if (criterion.type === "nation") continue

    const size = intersectionSize(
      maliSet,
      eligibleByCriterion.get(criterion.key)
    )

    if (size > 0) {
      intersections.push({
        type: criterion.type,
        label: criterion.label,
        count: size,
      })
    }
  }

  intersections.sort(
    (a, b) =>
      a.count - b.count ||
      a.label.localeCompare(b.label)
  )

  console.log(
    `Positive intersections: ${intersections.length}`
  )

  console.log("")
  console.log("Hardest Mali intersections:")

  console.table(intersections.slice(0, 20))

  console.log("")
  console.log("Easiest Mali intersections:")

  console.table(intersections.slice(-20).reverse())
}
