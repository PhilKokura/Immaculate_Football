import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const args = process.argv.slice(2)

function numberArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = args.find((value) => value.startsWith(prefix))

  if (!arg) return fallback

  const parsed = Number(arg.slice(prefix.length))

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid --${name}`)
  }

  return Math.floor(parsed)
}

const limit = numberArg("limit", 100)
const delayMs = numberArg("delay", 250)

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY

const API_FOOTBALL_KEY =
  process.env.API_FOOTBALL_KEY ??
  process.env.API_FOOTBALL_API_KEY ??
  process.env.APIFOOTBALL_KEY ??
  process.env.API_SPORTS_KEY ??
  process.env.APISPORTS_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SECRET_KEY",
  )
}

if (!API_FOOTBALL_KEY) {
  throw new Error(
    "API-Football key not found. Expected one of: API_FOOTBALL_KEY, API_FOOTBALL_API_KEY, APIFOOTBALL_KEY, API_SPORTS_KEY, APISPORTS_KEY",
  )
}

const players = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "components",
      "data",
      "runtime_players.json",
    ),
    "utf8",
  ),
)

const outputDir = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "api-football-trophies",
)

const cacheDir = path.join(
  outputDir,
  ".local",
  "players",
)

fs.mkdirSync(cacheDir, {
  recursive: true,
})

async function supabase(pathname) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${pathname}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${await response.text()}`,
    )
  }

  return response.json()
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  )
}

function playerName(player) {
  return (
    player.name ??
    player.displayName ??
    player.fullName ??
    player.id
  )
}

async function fetchTrophies(externalId) {
  const response = await fetch(
    `https://v3.football.api-sports.io/trophies?player=${encodeURIComponent(externalId)}`,
    {
      headers: {
        "x-apisports-key": API_FOOTBALL_KEY,
      },
    },
  )

  const body = await response.json()

  if (!response.ok) {
    throw new Error(
      `API-Football ${response.status}: ${JSON.stringify(body)}`,
    )
  }

  if (body.errors) {
    const errors =
      Array.isArray(body.errors)
        ? body.errors
        : Object.values(body.errors)

    if (errors.length > 0) {
      throw new Error(
        `API-Football error: ${JSON.stringify(body.errors)}`,
      )
    }
  }

  return body
}

async function main() {
  console.log("Loading API-Football player mappings...")

  const mappings = []

  const mappingPageSize = 1000

  for (
    let offset = 0;
    ;
    offset += mappingPageSize
  ) {
    const batch = await supabase(
      "player_external_ids" +
      "?select=player_id,provider,external_id" +
      "&order=player_id.asc,provider.asc,external_id.asc" +
      `&limit=${mappingPageSize}` +
      `&offset=${offset}`,
    )

    mappings.push(...batch)

    console.log(
      `Loaded external ID mappings: ${mappings.length}`,
    )

    if (
      batch.length <
      mappingPageSize
    ) {
      break
    }
  }

  const apiMappings = new Map()

  for (const row of mappings) {
    const provider =
      String(row.provider ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")

    if (
      provider === "apifootball" ||
      provider === "apisports"
    ) {
      apiMappings.set(
        row.player_id,
        String(row.external_id),
      )
    }
  }

  console.log(
    `Runtime players: ${players.length}`,
  )

  console.log(
    `API-Football mappings: ${apiMappings.size}`,
  )

  const candidates = players
    .filter((player) =>
      apiMappings.has(player.id),
    )
    .slice(0, limit)

  console.log(
    `Players selected: ${candidates.length}`,
  )

  let apiCalls = 0
  let cacheHits = 0
  let trophyRows = 0
  let playersWithTrophies = 0
  let errors = 0

  const results = []

  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {
    const player = candidates[index]
    const externalId =
      apiMappings.get(player.id)

    const cacheFile = path.join(
      cacheDir,
      `${externalId}.json`,
    )

    let body

    try {
      if (fs.existsSync(cacheFile)) {
        body = JSON.parse(
          fs.readFileSync(
            cacheFile,
            "utf8",
          ),
        )

        cacheHits++
      } else {
        body =
          await fetchTrophies(
            externalId,
          )

        fs.writeFileSync(
          cacheFile,
          JSON.stringify(
            body,
            null,
            2,
          ) + "\n",
        )

        apiCalls++

        if (
          index <
          candidates.length - 1
        ) {
          await sleep(delayMs)
        }
      }

      const trophies =
        Array.isArray(body.response)
          ? body.response
          : []

      trophyRows +=
        trophies.length

      if (trophies.length > 0) {
        playersWithTrophies++
      }

      results.push({
        playerId: player.id,
        externalId,
        name: playerName(player),
        trophies,
      })

      console.log(
        `[${index + 1}/${candidates.length}] ${playerName(player)}: ${trophies.length}`,
      )
    } catch (error) {
      errors++

      console.error(
        `[${index + 1}/${candidates.length}] ${playerName(player)} ERROR: ${error.message}`,
      )
    }
  }

  const placeCounts =
    new Map()

  const competitionCounts =
    new Map()

  const winnerCompetitionCounts =
    new Map()

  for (const result of results) {
    for (
      const trophy of
      result.trophies
    ) {
      const place =
        String(
          trophy.place ??
          "UNKNOWN",
        )

      const league =
        String(
          trophy.league ??
          "UNKNOWN",
        )

      const country =
        String(
          trophy.country ??
          "UNKNOWN",
        )

      const competition =
        `${league} [${country}]`

      placeCounts.set(
        place,
        (placeCounts.get(place) ?? 0) + 1,
      )

      competitionCounts.set(
        competition,
        (competitionCounts.get(competition) ?? 0) + 1,
      )

      if (
        place
          .toLowerCase() ===
        "winner"
      ) {
        winnerCompetitionCounts.set(
          competition,
          (winnerCompetitionCounts.get(competition) ?? 0) + 1,
        )
      }
    }
  }

  function sortedEntries(map) {
    return [...map.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          a[0].localeCompare(b[0]),
      )
  }

  console.log("")
  console.log(
    "----- SUMMARY -----",
  )

  console.table({
    selectedPlayers:
      candidates.length,

    apiCalls,
    cacheHits,
    errors,

    playersWithTrophies,

    playersWithoutTrophies:
      results.length -
      playersWithTrophies,

    trophyRows,
  })

  console.log("")
  console.log(
    "----- PLACE VALUES -----",
  )

  console.table(
    sortedEntries(placeCounts)
      .map(
        ([place, count]) => ({
          place,
          count,
        }),
      ),
  )

  console.log("")
  console.log(
    "----- TOP COMPETITIONS -----",
  )

  console.table(
    sortedEntries(
      competitionCounts,
    )
      .slice(0, 40)
      .map(
        ([competition, count]) => ({
          competition,
          count,
        }),
      ),
  )

  console.log("")
  console.log(
    "----- TOP WINNER COMPETITIONS -----",
  )

  console.table(
    sortedEntries(
      winnerCompetitionCounts,
    )
      .slice(0, 40)
      .map(
        ([competition, count]) => ({
          competition,
          winners: count,
        }),
      ),
  )

  /*
    Pull out competitions we're particularly
    interested in for FootGrid.
  */
  const interestingPatterns = [
    /champions league/i,
    /world cup/i,
    /europa league/i,
    /premier league/i,
    /bundesliga/i,
    /la liga/i,
    /serie a/i,
    /ligue 1/i,
    /european championship/i,
    /euro/i,
  ]

  const interestingRows = []

  for (const result of results) {
    for (const trophy of result.trophies) {
      const league =
        String(trophy.league ?? "")

      if (
        interestingPatterns.some(
          (pattern) =>
            pattern.test(league),
        )
      ) {
        interestingRows.push({
          player:
            result.name,

          competition:
            league,

          country:
            trophy.country,

          season:
            trophy.season,

          place:
            trophy.place,
        })
      }
    }
  }

  console.log("")
  console.log(
    "----- INTERESTING TROPHY SAMPLE -----",
  )

  console.table(
    interestingRows.slice(
      0,
      100,
    ),
  )

  const reportPath =
    path.join(
      outputDir,
      "sample-report.json",
    )

  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    },
  )

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        sampleSize:
          candidates.length,

        summary: {
          apiCalls,
          cacheHits,
          errors,
          playersWithTrophies,
          trophyRows,
        },

        placeValues:
          sortedEntries(
            placeCounts,
          ),

        competitions:
          sortedEntries(
            competitionCounts,
          ),

        winnerCompetitions:
          sortedEntries(
            winnerCompetitionCounts,
          ),

        interestingRows,

        players:
          results,
      },
      null,
      2,
    ) + "\n",
  )

  console.log("")
  console.log(
    `Saved report: ${reportPath}`,
  )

  console.log("")
  console.log(
    "No Supabase writes performed.",
  )
}

main().catch(
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)