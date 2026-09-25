import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const apply = process.argv.includes("--apply")

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL")
}

if (!SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY")
}

const reportPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-report.json",
)

const planPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "wikidata-position-import-plan.json",
)

const report = JSON.parse(
  fs
    .readFileSync(reportPath, "utf8")
    .replace(/^\uFEFF/, ""),
)

/*
  Wikidata P413 -> FootGrid

  Some real football roles map to more
  than one FootGrid category.
*/
const QID_TO_POSITIONS = {
  // GK
  Q201330: ["GK"],
  Q172964: ["GK"],

  // DEF
  Q336286: ["DEF"],        // defender
  Q268258: ["DEF"],        // centre-back
  Q90173132: ["DEF"],      // full-back
  Q65658786: ["DEF"],      // left-back
  Q1109563: ["DEF"],       // centerhalf
  Q904289: ["DEF"],        // stopper

  // DEF + MID
  Q107213256: ["DEF", "MID"], // wing-back

  // MID
  Q193592: ["MID"],        // midfielder
  Q8025128: ["MID"],       // wing half
  Q90326494: ["MID"],      // attacking midfielder
  Q18691898: ["MID"],      // defensive midfielder
  Q6008848: ["MID"],       // central midfielder
  Q1201458: ["MID"],       // playmaker

  // MID + ATT
  Q16501245: ["MID", "ATT"],  // wide midfielder
  Q114358123: ["MID", "ATT"], // right midfielder
  Q114358125: ["MID", "ATT"], // left midfielder

  Q11681748: ["MID", "ATT"],  // winger
  Q1369558: ["MID", "ATT"],   // winger
  Q2827965: ["MID", "ATT"],   // winger

  Q114358158: ["MID", "ATT"], // left winger
  Q114358150: ["MID", "ATT"], // right winger
  Q6037916: ["MID", "ATT"],   // inside forward

  // ATT
  Q280658: ["ATT"],        // forward
  Q3446915: ["ATT"],       // attacker
  Q543457: ["ATT"],        // forward
  Q9731197: ["ATT"],       // centre-forward
  Q1642283: ["ATT"],       // second striker
}

const POSITION_ORDER = [
  "GK",
  "DEF",
  "MID",
  "ATT",
]

function sortPositions(values) {
  return [...new Set(values)].sort(
    (a, b) =>
      POSITION_ORDER.indexOf(a) -
      POSITION_ORDER.indexOf(b),
  )
}

function chunks(array, size) {
  const result = []

  for (
    let i = 0;
    i < array.length;
    i += size
  ) {
    result.push(
      array.slice(i, i + size),
    )
  }

  return result
}

async function request(
  pathname,
  options = {},
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${pathname}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        "Content-Type":
          "application/json",

        ...(options.headers ?? {}),
      },
    },
  )

  if (!response.ok) {
    const body =
      await response.text()

    throw new Error(
      `${response.status} ${response.statusText}: ${body}`,
    )
  }

  if (
    response.status === 204
  ) {
    return null
  }

  const text =
    await response.text()

  return text
    ? JSON.parse(text)
    : null
}

async function getAll(pathname) {
  const rows = []
  const pageSize = 1000

  for (
    let from = 0;
    ;
    from += pageSize
  ) {
    const to =
      from + pageSize - 1

    const page =
      await request(
        pathname,
        {
          headers: {
            Range:
              `${from}-${to}`,
          },
        },
      )

    rows.push(...page)

    if (
      page.length < pageSize
    ) {
      break
    }
  }

  return rows
}

async function insertIgnoreDuplicates(
  table,
  rows,
  conflictColumns,
) {
  if (!rows.length) {
    return
  }

  for (
    const batch of
    chunks(rows, 500)
  ) {
    const query =
      `${table}` +
      `?on_conflict=` +
      encodeURIComponent(
        conflictColumns.join(","),
      )

    await request(
      query,
      {
        method: "POST",

        headers: {
          Prefer:
            "resolution=ignore-duplicates,return=minimal",
        },

        body:
          JSON.stringify(batch),
      },
    )
  }
}

async function main() {
  console.log(
    apply
      ? "MODE: APPLY"
      : "MODE: DRY RUN",
  )

  console.log("")
  console.log(
    "Loading existing positions...",
  )

  const existingPositions =
    await getAll(
      "player_positions" +
      "?select=player_id,position,is_primary",
    )

  console.log(
    `Existing player_positions: ${existingPositions.length}`,
  )

  console.log("")
  console.log(
    "Loading manual-curation evidence...",
  )

  const manualEvidence =
    await getAll(
      "player_position_evidence" +
      "?select=player_id" +
      "&source=eq.manual-curation",
    )

  const manualPlayerIds =
    new Set(
      manualEvidence.map(
        (row) => row.player_id,
      ),
    )

  console.log(
    `Manual-curation players: ${manualPlayerIds.size}`,
  )

  const existingByPlayer =
    new Map()

  for (
    const row of
    existingPositions
  ) {
    if (
      !existingByPlayer.has(
        row.player_id,
      )
    ) {
      existingByPlayer.set(
        row.player_id,
        [],
      )
    }

    existingByPlayer
      .get(row.player_id)
      .push(row)
  }

  const positionRowsToInsert = []
  const evidenceRowsToInsert = []

  const plan = []

  let skippedManual = 0
  let skippedNoMatch = 0
  let skippedNoWikidataPosition = 0
  let skippedNoExistingPosition = 0
  let matchedPlayers = 0

  for (
    const player of
    report.players
  ) {
    if (
      manualPlayerIds.has(
        player.playerId,
      )
    ) {
      skippedManual++
      continue
    }

    if (
      player.status !== "matched"
    ) {
      skippedNoMatch++
      continue
    }

    const wikidataEvidence =
      player.wikidataPositions ?? []

    if (
      wikidataEvidence.length === 0
    ) {
      skippedNoWikidataPosition++
      continue
    }

    const existing =
      existingByPlayer.get(
        player.playerId,
      ) ?? []

    /*
      We never invent a primary
      position here.

      Every normal runtime player
      should already have one from
      the API-Football baseline.
    */
    if (
      existing.length === 0
    ) {
      skippedNoExistingPosition++
      continue
    }

    matchedPlayers++

    const existingCodes =
      new Set(
        existing.map(
          (row) => row.position,
        ),
      )

    const mappedCodes =
      new Set()

    const evidenceForPlayer = []

    for (
      const wikidataPosition of
      wikidataEvidence
    ) {
      const mappings =
        QID_TO_POSITIONS[
          wikidataPosition.qid
        ]

      if (!mappings) {
        throw new Error(
          `Unmapped Wikidata position ${wikidataPosition.qid} (${wikidataPosition.label}) for ${player.name}`,
        )
      }

      const sourcePosition =
        `${wikidataPosition.label ?? "unknown"} [${wikidataPosition.qid}]`

      for (
        const position of
        mappings
      ) {
        mappedCodes.add(
          position,
        )

        evidenceForPlayer.push({
          player_id:
            player.playerId,

          position,

          source:
            "wikidata",

          source_position:
            sourcePosition,
        })
      }
    }

    const additions =
      [...mappedCodes].filter(
        (position) =>
          !existingCodes.has(
            position,
          ),
      )

    for (
      const position of additions
    ) {
      positionRowsToInsert.push({
        player_id:
          player.playerId,

        position,

        is_primary:
          false,
      })
    }

    /*
      Evidence is stored for every
      Wikidata-supported FootGrid
      position, including positions
      that already existed before.
    */
    evidenceRowsToInsert.push(
      ...evidenceForPlayer,
    )

    if (
      additions.length > 0
    ) {
      plan.push({
        playerId:
          player.playerId,

        name:
          player.name,

        wikidataQid:
          player.wikidataQid,

        before:
          sortPositions(
            [...existingCodes],
          ),

        wikidata:
          sortPositions(
            [...mappedCodes],
          ),

        added:
          sortPositions(
            additions,
          ),

        after:
          sortPositions([
            ...existingCodes,
            ...mappedCodes,
          ]),

        rawWikidata:
          wikidataEvidence,
      })
    }
  }

  /*
    Deduplicate position inserts.
  */
  const positionInsertMap =
    new Map()

  for (
    const row of
    positionRowsToInsert
  ) {
    const key =
      `${row.player_id}|${row.position}`

    positionInsertMap.set(
      key,
      row,
    )
  }

  const uniquePositionRows =
    [...positionInsertMap.values()]

  /*
    Deduplicate evidence inserts.
  */
  const evidenceInsertMap =
    new Map()

  for (
    const row of
    evidenceRowsToInsert
  ) {
    const key =
      [
        row.player_id,
        row.position,
        row.source,
        row.source_position,
      ].join("|")

    evidenceInsertMap.set(
      key,
      row,
    )
  }

  const uniqueEvidenceRows =
    [...evidenceInsertMap.values()]

  const combinationFrequency =
    new Map()

  for (
    const player of plan
  ) {
    const key =
      player.after.join(" + ")

    combinationFrequency.set(
      key,
      (
        combinationFrequency.get(
          key,
        ) ?? 0
      ) + 1,
    )
  }

  const summary = {
    reportPlayers:
      report.players.length,

    matchedPlayersUsed:
      matchedPlayers,

    manualPlayersSkipped:
      skippedManual,

    unmatchedSkipped:
      skippedNoMatch,

    matchedWithoutPositionSkipped:
      skippedNoWikidataPosition,

    noExistingPositionSkipped:
      skippedNoExistingPosition,

    playersReceivingNewPositions:
      plan.length,

    newPlayerPositionRows:
      uniquePositionRows.length,

    wikidataEvidenceRows:
      uniqueEvidenceRows.length,
  }

  const output = {
    generatedAt:
      new Date().toISOString(),

    apply,

    summary,

    combinations:
      [...combinationFrequency.entries()]
        .map(
          ([positions, count]) => ({
            positions,
            count,
          }),
        )
        .sort(
          (a, b) =>
            b.count - a.count,
        ),

    players:
      plan,
  }

  fs.writeFileSync(
    planPath,
    JSON.stringify(
      output,
      null,
      2,
    ) + "\n",
  )

  console.log("")
  console.log(
    "----- SUMMARY -----",
  )

  console.table(
    summary,
  )

  console.log("")
  console.log(
    "----- RESULTING COMBINATIONS -----",
  )

  console.table(
    output.combinations,
  )

  console.log("")
  console.log(
    "----- FIRST 50 CHANGES -----",
  )

  console.table(
    plan
      .slice(0, 50)
      .map(
        (player) => ({
          name:
            player.name,

          before:
            player.before.join(
              ", ",
            ),

          wikidata:
            player.wikidata.join(
              ", ",
            ),

          added:
            player.added.join(
              ", ",
            ),

          after:
            player.after.join(
              ", ",
            ),
        }),
      ),
  )

  console.log("")
  console.log(
    `Plan: ${planPath}`,
  )

  if (!apply) {
    console.log("")
    console.log(
      "DRY RUN ONLY. Supabase was not modified.",
    )

    console.log(
      "Run again with --apply to write the additions.",
    )

    return
  }

  console.log("")
  console.log(
    "Writing new player_positions...",
  )

  await insertIgnoreDuplicates(
    "player_positions",
    uniquePositionRows,
    [
      "player_id",
      "position",
    ],
  )

  console.log(
    `player_positions processed: ${uniquePositionRows.length}`,
  )

  console.log("")
  console.log(
    "Writing Wikidata evidence...",
  )

  await insertIgnoreDuplicates(
    "player_position_evidence",
    uniqueEvidenceRows,
    [
      "player_id",
      "position",
      "source",
      "source_position",
    ],
  )

  console.log(
    `player_position_evidence processed: ${uniqueEvidenceRows.length}`,
  )

  console.log("")
  console.log(
    "IMPORT COMPLETE",
  )
}

main().catch(
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)