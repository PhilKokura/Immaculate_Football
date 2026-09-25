import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const reportPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-report.json",
)

const outputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-proposals-strict.json",
)

const QID_TO_POSITION = {
  Q201330: "GK",
  Q172964: "GK",

  Q336286: "DEF",
  Q268258: "DEF",
  Q90173132: "DEF",
  Q107213256: "DEF",
  Q65658786: "DEF",
  Q1109563: "DEF",
  Q904289: "DEF",

  Q193592: "MID",
  Q8025128: "MID",
  Q90326494: "MID",
  Q18691898: "MID",
  Q6008848: "MID",
  Q16501245: "MID",
  Q1201458: "MID",
  Q114358123: "MID",
  Q114358125: "MID",

  Q280658: "ATT",
  Q11681748: "ATT",
  Q9731197: "ATT",
  Q6037916: "ATT",
  Q1369558: "ATT",
  Q114358158: "ATT",
  Q3446915: "ATT",
  Q543457: "ATT",
  Q114358150: "ATT",
  Q1642283: "ATT",
  Q2827965: "ATT",
}

const report = JSON.parse(
  fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, ""),
)

const autoAdditions = []
const singleCategoryConflicts = []

for (const player of report.players) {
  if (player.status !== "matched") continue

  const current = [
    ...new Set(player.currentPositions ?? []),
  ]

  const wikidata = [
    ...new Set(
      (player.wikidataPositions ?? [])
        .map((position) => QID_TO_POSITION[position.qid])
        .filter(Boolean),
    ),
  ]

  if (wikidata.length === 0) continue

  const additions = wikidata.filter(
    (position) => !current.includes(position),
  )

  if (additions.length === 0) continue

  const record = {
    playerId: player.playerId,
    name: player.name,
    wikidataQid: player.wikidataQid,
    currentPositions: current,
    wikidataPositions: wikidata,
    additions,
    proposedPositions: [
      ...new Set([
        ...current,
        ...additions,
      ]),
    ],
  }

  /*
    Auto-add only when Wikidata itself
    provides evidence across multiple
    FootGrid position groups.
  */
  if (wikidata.length >= 2) {
    autoAdditions.push(record)
  } else {
    singleCategoryConflicts.push(record)
  }
}

const summary = {
  totalPlayers: report.summary.analyzed,

  autoAddPlayers:
    autoAdditions.length,

  autoAddAssignments:
    autoAdditions.reduce(
      (sum, player) =>
        sum + player.additions.length,
      0,
    ),

  singleCategoryConflicts:
    singleCategoryConflicts.length,
}

const output = {
  generatedAt: new Date().toISOString(),
  summary,
  autoAdditions,
  singleCategoryConflicts,
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2) + "\n",
)

console.log("")
console.log("----- SUMMARY -----")
console.table(summary)

console.log("")
console.log("----- AUTO ADDITIONS -----")

console.table(
  autoAdditions
    .slice(0, 50)
    .map((player) => ({
      name: player.name,
      current:
        player.currentPositions.join(", "),
      wikidata:
        player.wikidataPositions.join(", "),
      add:
        player.additions.join(", "),
      proposed:
        player.proposedPositions.join(", "),
    })),
)

console.log("")
console.log("----- SINGLE CATEGORY CONFLICTS -----")

console.table(
  singleCategoryConflicts
    .slice(0, 30)
    .map((player) => ({
      name: player.name,
      current:
        player.currentPositions.join(", "),
      wikidata:
        player.wikidataPositions.join(", "),
    })),
)

console.log("")
console.log(`Report: ${outputPath}`)