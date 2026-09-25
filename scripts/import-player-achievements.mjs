import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase server credentials")
}

const inputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "api-football-trophies",
  "relevant-title-winners.json",
)

const input = JSON.parse(
  fs.readFileSync(inputPath, "utf8"),
)

const catalog = [
  {
    key: "world-cup-winner",
    label: "FIFA World Cup Winner",
    competition_name: "FIFA World Cup",
    competition_country: "World",
  },
  {
    key: "euro-winner",
    label: "UEFA European Championship Winner",
    competition_name: "UEFA European Championship",
    competition_country: "Europe",
  },
  {
    key: "copa-america-winner",
    label: "CONMEBOL Copa America Winner",
    competition_name: "CONMEBOL Copa America",
    competition_country: "South America",
  },
  {
    key: "champions-league-winner",
    label: "UEFA Champions League Winner",
    competition_name: "UEFA Champions League",
    competition_country: "Europe",
  },
  {
    key: "europa-league-winner",
    label: "UEFA Europa League Winner",
    competition_name: "UEFA Europa League",
    competition_country: "Europe",
  },
  {
    key: "premier-league-champion",
    label: "Premier League Champion",
    competition_name: "Premier League",
    competition_country: "England",
  },
  {
    key: "bundesliga-champion",
    label: "Bundesliga Champion",
    competition_name: "Bundesliga",
    competition_country: "Germany",
  },
  {
    key: "la-liga-champion",
    label: "La Liga Champion",
    competition_name: "La Liga",
    competition_country: "Spain",
  },
  {
    key: "serie-a-champion",
    label: "Serie A Champion",
    competition_name: "Serie A",
    competition_country: "Italy",
  },
  {
    key: "ligue-1-champion",
    label: "Ligue 1 Champion",
    competition_name: "Ligue 1",
    competition_country: "France",
  },
]

async function request(
  pathname,
  {
    method = "GET",
    body,
    headers = {},
  } = {},
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${pathname}`,
    {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname}: ${response.status} ${await response.text()}`,
    )
  }

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return null
  }

  const text = await response.text()

  return text ? JSON.parse(text) : null
}

async function upsertBatches(
  table,
  rows,
  conflict,
  batchSize = 250,
) {
  for (
    let offset = 0;
    offset < rows.length;
    offset += batchSize
  ) {
    const batch =
      rows.slice(
        offset,
        offset + batchSize,
      )

    await request(
      `${table}?on_conflict=${encodeURIComponent(conflict)}`,
      {
        method: "POST",
        body: batch,
        headers: {
          Prefer:
            "resolution=merge-duplicates,return=minimal",
        },
      },
    )

    console.log(
      `${table}: ${Math.min(offset + batch.length, rows.length)}/${rows.length}`,
    )
  }
}

async function main() {
  const playerRows = []

  for (const player of input.players ?? []) {
    for (
      const achievement of
      player.achievements ?? []
    ) {
      playerRows.push({
        player_id:
          player.playerId,

        achievement_key:
          achievement.key,

        seasons:
          [...new Set(
            achievement.seasons ?? [],
          )].sort(),

        source:
          "api-football",

        updated_at:
          new Date().toISOString(),
      })
    }
  }

  console.log("")
  console.log("----- IMPORT PLAN -----")

  console.table({
    achievements:
      catalog.length,

    playersWithRelevantTitle:
      input.players?.length ?? 0,

    playerAchievementRows:
      playerRows.length,
  })

  await upsertBatches(
    "achievements",
    catalog,
    "key",
  )

  await upsertBatches(
    "player_achievements",
    playerRows,
    "player_id,achievement_key",
  )

  const countResult =
    await request(
      "player_achievements?select=player_id,achievement_key",
      {
        headers: {
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    )

  console.log("")
  console.log(
    "Achievement import completed.",
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})