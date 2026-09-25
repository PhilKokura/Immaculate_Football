import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const dir = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
)

const inputPath = path.join(
  dir,
  "player-display-name-analysis.json",
)

const analysis = JSON.parse(
  fs.readFileSync(inputPath, "utf8"),
)

const players = analysis.players ?? []

const auto = players
  .filter(
    player =>
      player.status === "SAFE_SHORTER",
  )
  .map(
    player => ({
      playerId:
        player.playerId,

      currentName:
        player.currentName,

      proposedDisplayName:
        player.wikidataLabel,

      source:
        "wikidata",

      wikidataId:
        player.wikidataId ?? null,
    }),
  )
  .sort(
    (a, b) =>
      a.proposedDisplayName.localeCompare(
        b.proposedDisplayName,
      ),
  )

const review = players
  .filter(
    player =>
      player.status === "REVIEW_SHORTER" ||
      player.status === "REVIEW_SINGLE_NAME",
  )
  .map(
    player => ({
      playerId:
        player.playerId,

      currentName:
        player.currentName,

      wikidataLabel:
        player.wikidataLabel,

      status:
        player.status,

      decision:
        null,

      finalDisplayName:
        null,
    }),
  )
  .sort(
    (a, b) =>
      a.currentName.localeCompare(
        b.currentName,
      ),
  )

function csvEscape(value) {
  if (value === null || value === undefined) {
    return ""
  }

  const string =
    String(value)

  return `"${string.replaceAll('"', '""')}"`
}

function writeCsv(
  filename,
  rows,
  columns,
) {
  const lines = [
    columns.join(","),
    ...rows.map(
      row =>
        columns
          .map(
            column =>
              csvEscape(row[column]),
          )
          .join(","),
    ),
  ]

  fs.writeFileSync(
    path.join(dir, filename),
    "\uFEFF" +
      lines.join("\r\n") +
      "\r\n",
    "utf8",
  )
}

fs.writeFileSync(
  path.join(
    dir,
    "player-display-name-auto.json",
  ),
  JSON.stringify(auto, null, 2) + "\n",
  "utf8",
)

fs.writeFileSync(
  path.join(
    dir,
    "player-display-name-review.json",
  ),
  JSON.stringify(review, null, 2) + "\n",
  "utf8",
)

writeCsv(
  "player-display-name-auto.csv",
  auto,
  [
    "playerId",
    "currentName",
    "proposedDisplayName",
    "source",
    "wikidataId",
  ],
)

writeCsv(
  "player-display-name-review.csv",
  review,
  [
    "playerId",
    "currentName",
    "wikidataLabel",
    "status",
    "decision",
    "finalDisplayName",
  ],
)

console.log("")
console.log("----- DISPLAY NAME PLAN -----")
console.table({
  automaticChanges:
    auto.length,

  manualReview:
    review.length,

  reviewShorter:
    review.filter(
      x =>
        x.status === "REVIEW_SHORTER",
    ).length,

  reviewSingleName:
    review.filter(
      x =>
        x.status === "REVIEW_SINGLE_NAME",
    ).length,
})

console.log("")
console.log("Created:")
console.log(
  path.join(
    dir,
    "player-display-name-auto.csv",
  ),
)
console.log(
  path.join(
    dir,
    "player-display-name-review.csv",
  ),
)