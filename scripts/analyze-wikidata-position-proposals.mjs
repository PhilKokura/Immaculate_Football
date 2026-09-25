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
  "wikidata-position-proposals.json",
)

const QID_TO_POSITION = {
  // GK
  Q201330: "GK",
  Q172964: "GK",

  // DEF
  Q336286: "DEF",
  Q268258: "DEF",
  Q90173132: "DEF",
  Q107213256: "DEF",
  Q65658786: "DEF",
  Q1109563: "DEF",
  Q904289: "DEF",

  // MID
  Q193592: "MID",
  Q8025128: "MID",
  Q90326494: "MID",
  Q18691898: "MID",
  Q6008848: "MID",
  Q16501245: "MID",
  Q1201458: "MID",
  Q114358123: "MID",
  Q114358125: "MID",

  // ATT
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

const proposals = []
const unmapped = new Map()

for (const player of report.players) {
  if (player.status !== "matched") {
    continue
  }

  const currentPositions = [
    ...new Set(player.currentPositions ?? []),
  ]

  const mappedPositions = []

  for (const wikidataPosition of player.wikidataPositions ?? []) {
    const mapped = QID_TO_POSITION[wikidataPosition.qid]

    if (!mapped) {
      const key =
        `${wikidataPosition.qid}|${wikidataPosition.label ?? ""}`

      unmapped.set(
        key,
        (unmapped.get(key) ?? 0) + 1,
      )

      continue
    }

    mappedPositions.push(mapped)
  }

  const wikidataFootGridPositions = [
    ...new Set(mappedPositions),
  ]

  const additions = wikidataFootGridPositions.filter(
    (position) => !currentPositions.includes(position),
  )

  if (additions.length === 0) {
    continue
  }

  proposals.push({
    playerId: player.playerId,
    name: player.name,
    birthDate: player.birthDate,
    wikidataQid: player.wikidataQid,

    currentPositions,

    wikidataFootGridPositions,

    additions,

    proposedPositions: [
      ...new Set([
        ...currentPositions,
        ...additions,
      ]),
    ],

    evidence: player.wikidataPositions,
  })
}

const additionalAssignments = proposals.reduce(
  (sum, player) => sum + player.additions.length,
  0,
)

const summary = {
  totalRuntimePlayers: report.summary.analyzed,

  wikidataMatched:
    report.summary.matched,

  matchedWithPosition:
    report.summary.matchedWithPosition,

  playersWithAdditionalPosition:
    proposals.length,

  additionalPositionAssignments:
    additionalAssignments,

  playersGettingTwoOrMoreAdditions:
    proposals.filter(
      (player) => player.additions.length >= 2,
    ).length,

  unmappedPositionTypes:
    unmapped.size,
}

const output = {
  generatedAt: new Date().toISOString(),
  summary,

  unmappedPositions: [
    ...unmapped.entries(),
  ].map(([key, count]) => {
    const [qid, label] = key.split("|")

    return {
      qid,
      label,
      count,
    }
  }),

  proposals,
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2) + "\n",
)

console.log("")
console.log("----- SUMMARY -----")
console.table(summary)

console.log("")
console.log("----- UNMAPPED POSITIONS -----")
console.table(output.unmappedPositions)

console.log("")
console.log("----- FIRST 30 ADDITIONS -----")

console.table(
  proposals
    .slice(0, 30)
    .map((player) => ({
      name: player.name,
      current: player.currentPositions.join(", "),
      wikidata: player.wikidataFootGridPositions.join(", "),
      add: player.additions.join(", "),
      proposed: player.proposedPositions.join(", "),
    })),
)

console.log("")
console.log(`Report: ${outputPath}`)