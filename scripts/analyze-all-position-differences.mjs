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

const jsonOutputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-differences.json",
)

const csvOutputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-differences.csv",
)

/*
  For this comparison we deliberately map
  real football roles to all plausible
  FootGrid groups.

  Example:
  winger -> MID + ATT
  wing-back -> DEF + MID
*/
const QID_TO_POSITIONS = {
  // GK
  Q201330: ["GK"],
  Q172964: ["GK"],

  // DEF
  Q336286: ["DEF"],
  Q268258: ["DEF"],
  Q90173132: ["DEF"],
  Q65658786: ["DEF"],
  Q1109563: ["DEF"],
  Q904289: ["DEF"],

  // DEF + MID
  Q107213256: ["DEF", "MID"],

  // MID
  Q193592: ["MID"],
  Q8025128: ["MID", "ATT"],
  Q90326494: ["MID"],
  Q18691898: ["MID"],
  Q6008848: ["MID"],
  Q1201458: ["MID"],

  // MID + ATT
  Q16501245: ["MID", "ATT"],
  Q114358123: ["MID", "ATT"],
  Q114358125: ["MID", "ATT"],
  Q11681748: ["MID", "ATT"],
  Q1369558: ["MID", "ATT"],
  Q2827965: ["MID", "ATT"],
  Q114358158: ["MID", "ATT"],
  Q114358150: ["MID", "ATT"],
  Q6037916: ["MID", "ATT"],

  // ATT
  Q280658: ["ATT"],
  Q3446915: ["ATT"],
  Q543457: ["ATT"],
  Q9731197: ["ATT"],
  Q1642283: ["ATT"],
}

const ORDER = [
  "GK",
  "DEF",
  "MID",
  "ATT",
]

function normalize(values) {
  return [...new Set(values)]
    .sort(
      (a, b) =>
        ORDER.indexOf(a) -
        ORDER.indexOf(b),
    )
}

function sameSet(a, b) {
  return (
    a.length === b.length &&
    a.every((value) => b.includes(value))
  )
}

function containsAll(container, subset) {
  return subset.every(
    (value) => container.includes(value),
  )
}

function classify(current, wikidata) {
  if (sameSet(current, wikidata)) {
    return "EXACT"
  }

  const overlap = current.some(
    (value) => wikidata.includes(value),
  )

  if (
    containsAll(wikidata, current)
  ) {
    return "WIKIDATA_SUPERSET"
  }

  if (
    containsAll(current, wikidata)
  ) {
    return "CURRENT_SUPERSET"
  }

  if (overlap) {
    return "OVERLAP"
  }

  return "DISJOINT"
}

function csvEscape(value) {
  const text = String(
    value ?? "",
  )

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}

const report = JSON.parse(
  fs
    .readFileSync(reportPath, "utf8")
    .replace(/^\uFEFF/, ""),
)

const compared = []

for (const player of report.players) {
  if (
    player.status !== "matched" ||
    !player.wikidataPositions?.length
  ) {
    continue
  }

  const current = normalize(
    player.currentPositions ?? [],
  )

  const mapped = []

  for (
    const position of
    player.wikidataPositions
  ) {
    const footGridPositions =
      QID_TO_POSITIONS[position.qid]

    if (!footGridPositions) {
      continue
    }

    mapped.push(
      ...footGridPositions,
    )
  }

  const wikidata =
    normalize(mapped)

  if (!wikidata.length) {
    continue
  }

  const comparison =
    classify(
      current,
      wikidata,
    )

  compared.push({
    playerId:
      player.playerId,

    name:
      player.name,

    birthDate:
      player.birthDate,

    wikidataQid:
      player.wikidataQid,

    currentPositions:
      current,

    wikidataPositions:
      wikidata,

    rawWikidataPositions:
      player.wikidataPositions.map(
        (position) =>
          position.label,
      ),

    comparison,
  })
}

const differences =
  compared
    .filter(
      (player) =>
        player.comparison !==
        "EXACT",
    )
    .sort((a, b) => {
      const comparisonOrder = {
        DISJOINT: 0,
        OVERLAP: 1,
        WIKIDATA_SUPERSET: 2,
        CURRENT_SUPERSET: 3,
      }

      return (
        comparisonOrder[
          a.comparison
        ] -
          comparisonOrder[
            b.comparison
          ] ||
        a.name.localeCompare(
          b.name,
        )
      )
    })

const summary = {
  comparedPlayers:
    compared.length,

  exactMatches:
    compared.filter(
      (p) =>
        p.comparison ===
        "EXACT",
    ).length,

  differences:
    differences.length,

  wikidataSuperset:
    differences.filter(
      (p) =>
        p.comparison ===
        "WIKIDATA_SUPERSET",
    ).length,

  currentSuperset:
    differences.filter(
      (p) =>
        p.comparison ===
        "CURRENT_SUPERSET",
    ).length,

  overlap:
    differences.filter(
      (p) =>
        p.comparison ===
        "OVERLAP",
    ).length,

  disjoint:
    differences.filter(
      (p) =>
        p.comparison ===
        "DISJOINT",
    ).length,
}

fs.writeFileSync(
  jsonOutputPath,
  JSON.stringify(
    {
      generatedAt:
        new Date().toISOString(),
      summary,
      players:
        differences,
    },
    null,
    2,
  ) + "\n",
)

const csvHeader = [
  "name",
  "birthDate",
  "comparison",
  "currentPositions",
  "wikidataPositions",
  "rawWikidataPositions",
  "wikidataQid",
  "playerId",
]

const csvRows = differences.map(
  (player) => [
    player.name,
    player.birthDate,
    player.comparison,
    player.currentPositions.join(" + "),
    player.wikidataPositions.join(" + "),
    player.rawWikidataPositions.join(" | "),
    player.wikidataQid,
    player.playerId,
  ]
    .map(csvEscape)
    .join(","),
)

fs.writeFileSync(
  csvOutputPath,
  [
    csvHeader.join(","),
    ...csvRows,
  ].join("\n") + "\n",
)

console.log("")
console.log("----- SUMMARY -----")
console.table(summary)

console.log("")
console.log(
  "----- ALL POSITION DIFFERENCES -----",
)

console.table(
  differences.map(
    (player) => ({
      name:
        player.name,

      type:
        player.comparison,

      current:
        player.currentPositions.join(
          ", ",
        ),

      wikidata:
        player.wikidataPositions.join(
          ", ",
        ),

      raw:
        player.rawWikidataPositions.join(
          " / ",
        ),
    }),
  ),
)

console.log("")
console.log(
  `JSON: ${jsonOutputPath}`,
)

console.log(
  `CSV:  ${csvOutputPath}`,
)