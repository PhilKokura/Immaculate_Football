import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const runtimePath = path.join(
  root,
  "components",
  "data",
  "runtime_players.json",
)

const wikidataPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-report.json",
)

const runtime = JSON.parse(
  fs.readFileSync(runtimePath, "utf8"),
)

const wikidataReport = JSON.parse(
  fs.readFileSync(wikidataPath, "utf8"),
)

/*
  Recursively find every object containing:
  playerId + name + wikidataLabel

  This means we do not need to depend on the exact
  top-level structure of the old Wikidata report.
*/
const wikidataPlayers = []

function walk(value) {
  if (!value || typeof value !== "object") {
    return
  }

  if (
    !Array.isArray(value) &&
    typeof value.playerId === "string" &&
    typeof value.wikidataLabel === "string"
  ) {
    wikidataPlayers.push({
      playerId: value.playerId,
      sourceName:
        typeof value.name === "string"
          ? value.name
          : null,
      wikidataLabel:
        value.wikidataLabel,
      wikidataId:
        value.wikidataId ??
        value.wikidataEntity ??
        value.wikidataQid ??
        null,
    })
  }

  for (const child of Object.values(value)) {
    walk(child)
  }
}

walk(wikidataReport)

/*
  Deduplicate because the report may contain
  the same matched player in multiple sections.
*/
const wikidataByPlayer =
  new Map()

for (const item of wikidataPlayers) {
  if (!wikidataByPlayer.has(item.playerId)) {
    wikidataByPlayer.set(
      item.playerId,
      item,
    )
  }
}

function displayName(player) {
  return (
    player.displayName ??
    player.name ??
    player.fullName ??
    ""
  ).trim()
}

function words(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function normalized(value) {
  return words(value).join(" ")
}

function isTokenSubset(shorter, longer) {
  const shortTokens =
    words(shorter)

  const longTokens =
    new Set(words(longer))

  return shortTokens.every(
    token => longTokens.has(token),
  )
}

const rows = []

for (const player of runtime) {
  const current =
    displayName(player)

  const wiki =
    wikidataByPlayer.get(
      player.id,
    )

  if (!wiki) {
    rows.push({
      playerId: player.id,
      currentName: current,
      wikidataLabel: null,
      status: "NO_WIKIDATA_MATCH",
      currentParts:
        words(current).length,
      wikiParts: null,
      lengthDifference: null,
    })

    continue
  }

  const label =
    wiki.wikidataLabel.trim()

  const exact =
    current === label

  const normalizedEqual =
    normalized(current) ===
    normalized(label)

  const currentParts =
    words(current).length

  const wikiParts =
    words(label).length

  const shorter =
    label.length <
    current.length

  const conservativeSafe =
    !exact &&
    shorter &&
    wikiParts >= 2 &&
    isTokenSubset(
      label,
      current,
    )

  let status

  if (exact) {
    status =
      "EXACT_SAME"
  } else if (normalizedEqual) {
    status =
      "NORMALIZED_SAME"
  } else if (conservativeSafe) {
    status =
      "SAFE_SHORTER"
  } else if (
    shorter &&
    wikiParts === 1
  ) {
    status =
      "REVIEW_SINGLE_NAME"
  } else if (shorter) {
    status =
      "REVIEW_SHORTER"
  } else if (
    label.length >
    current.length
  ) {
    status =
      "WIKIDATA_LONGER"
  } else {
    status =
      "DIFFERENT"
  }

  rows.push({
    playerId:
      player.id,

    currentName:
      current,

    wikidataLabel:
      label,

    status,

    currentParts,

    wikiParts,

    lengthDifference:
      label.length -
      current.length,

    sourceName:
      wiki.sourceName,

    wikidataId:
      wiki.wikidataId,
  })
}

const count =
  status =>
    rows.filter(
      row =>
        row.status === status,
    ).length

const matched =
  rows.filter(
    row =>
      row.wikidataLabel,
  )

const currentThreePlus =
  rows.filter(
    row =>
      row.currentParts >= 3,
  )

const summary = {
  totalRuntimePlayers:
    rows.length,

  uniqueWikidataMatches:
    wikidataByPlayer.size,

  runtimePlayersWithWikidataMatch:
    matched.length,

  withoutWikidataMatch:
    rows.length -
    matched.length,

  exactSame:
    count("EXACT_SAME"),

  normalizedSame:
    count("NORMALIZED_SAME"),

  conservativeSafeShorter:
    count("SAFE_SHORTER"),

  reviewShorter:
    count("REVIEW_SHORTER"),

  reviewSingleName:
    count("REVIEW_SINGLE_NAME"),

  wikidataLonger:
    count("WIKIDATA_LONGER"),

  differentOther:
    count("DIFFERENT"),

  currentNamesWith3PlusParts:
    currentThreePlus.length,

  threePlusWithShorterWikidata:
    currentThreePlus.filter(
      row =>
        row.wikidataLabel &&
        row.wikidataLabel.length <
        row.currentName.length,
    ).length,
}

console.log("")
console.log(
  "----- NAME ANALYSIS -----",
)

console.table(summary)

function show(
  title,
  filter,
  limit = 50,
) {
  console.log("")
  console.log(
    `----- ${title} -----`,
  )

  console.table(
    rows
      .filter(filter)
      .sort(
        (a, b) =>
          (a.lengthDifference ?? 0) -
          (b.lengthDifference ?? 0),
      )
      .slice(0, limit)
      .map(row => ({
        Current:
          row.currentName,
        Wikidata:
          row.wikidataLabel,
        Status:
          row.status,
      })),
  )
}

show(
  "SAFE SHORTER",
  row =>
    row.status ===
    "SAFE_SHORTER",
  75,
)

show(
  "SINGLE-NAME REVIEW",
  row =>
    row.status ===
    "REVIEW_SINGLE_NAME",
  50,
)

show(
  "OTHER SHORTER REVIEW",
  row =>
    row.status ===
    "REVIEW_SHORTER",
  50,
)

show(
  "WIKIDATA LONGER / DIFFERENT",
  row =>
    row.status ===
      "WIKIDATA_LONGER" ||
    row.status ===
      "DIFFERENT",
  50,
)

const outputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "player-display-name-analysis.json",
)

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt:
        new Date().toISOString(),
      summary,
      players: rows,
    },
    null,
    2,
  ) + "\n",
)

console.log("")
console.log(
  `Saved: ${outputPath}`,
)