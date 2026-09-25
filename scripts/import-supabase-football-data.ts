import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

type ExternalRef = {
  provider: string
  externalId: string
}

type Player = {
  runtimeKey: string
  playerExternalRef: ExternalRef
  displayName: string
  providerName?: string | null
  fullName?: string | null
  searchNames?: string[]
  photo?: string | null
  birthDate?: string | null
  nationality?: string | null
  position?: "GK" | "DEF" | "MID" | "ATT"

  eligibleClubs?: Array<{
    teamExternalRef: ExternalRef
    name: string
    logo?: string | null
    seasons?: number[]
  }>

  eligibleLeagues?: Array<{
    leagueExternalRef: ExternalRef
    name: string
    seasons?: number[]
  }>
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY")
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const base = path.join(
  process.cwd(),
  "scripts",
  "provider-evaluation",
  "api-football",
  ".local",
  "active-top5",
)

const players = JSON.parse(
  fs.readFileSync(
    path.join(base, "final-player-game-data.json"),
    "utf8",
  ),
) as Player[]

const teamProfiles = JSON.parse(
  fs.readFileSync(
    path.join(base, "career-team-profiles.json"),
    "utf8",
  ),
) as Array<{
  externalRef: ExternalRef
  providerName: string
  country?: string | null
  logo?: string | null
}>

const teamProfileByExternalId = new Map(
  teamProfiles.map((team) => [
    team.externalRef.externalId,
    team,
  ]),
)

const leagueCatalogDirectory = path.join(
  base,
  "raw",
  "league-catalog",
)

function chunk<T>(items: T[], size = 500): T[][] {
  const result: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }

  return result
}

async function upsertBatches(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  const batches = chunk(rows)

  for (let index = 0; index < batches.length; index++) {
    const { error } = await supabase
      .from(table)
      .upsert(batches[index], {
        onConflict,
      })

    if (error) {
      throw new Error(
        `${table} batch ${index + 1}/${batches.length}: ${error.message}`,
      )
    }

    console.log(
      `${table}: ${index + 1}/${batches.length}`,
    )
  }
}

async function fetchAll<T>(
  table: string,
  columns: string,
): Promise<T[]> {
  const pageSize = 1000
  const result: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(
        `Could not read ${table}: ${error.message}`,
      )
    }

    const rows = (data ?? []) as T[]
    result.push(...rows)

    if (rows.length < pageSize) {
      break
    }
  }

  return result
}

function loadLeague(providerLeagueId: number) {
  const file = path.join(
    leagueCatalogDirectory,
    `${providerLeagueId}.json`,
  )

  const raw = JSON.parse(
    fs.readFileSync(file, "utf8"),
  )

  const entry = raw.response?.[0]

  if (!entry?.league) {
    throw new Error(
      `Invalid league catalog: ${providerLeagueId}`,
    )
  }

  return {
    runtime_key: `league:${providerLeagueId}`,
    name: entry.league.name,
    country: entry.country?.name ?? null,
    country_code: entry.country?.code ?? null,
    image_url: entry.league.logo ?? null,
    updated_at: new Date().toISOString(),

    provider: "api-football",
    external_id: String(providerLeagueId),
  }
}

async function main() {
  const now = new Date().toISOString()

  console.log(`Canonical players: ${players.length}`)

  // --------------------------------------------------
  // PLAYERS
  // --------------------------------------------------

  const playerRows = players.map((player) => ({
    runtime_key: player.runtimeKey,
    name: player.displayName,
    provider_name: player.providerName ?? null,
    full_name: player.fullName ?? null,
    search_names: player.searchNames ?? [],
    birth_date: player.birthDate ?? null,
    nationality: player.nationality ?? null,
    position: player.position ?? null,
    image_url: player.photo ?? null,
    active: true,
    updated_at: now,
  }))

  console.log("Importing players...")

  await upsertBatches(
    "players",
    playerRows,
    "runtime_key",
  )

  const dbPlayers = await fetchAll<{
    id: string
    runtime_key: string
  }>(
    "players",
    "id,runtime_key",
  )

  const playerUuidByRuntimeKey = new Map(
    dbPlayers.map((player) => [
      player.runtime_key,
      player.id,
    ]),
  )

  const playerExternalIds = players.map((player) => {
    const playerId =
      playerUuidByRuntimeKey.get(player.runtimeKey)

    if (!playerId) {
      throw new Error(
        `Missing FootGrid UUID for ${player.runtimeKey}`,
      )
    }

    return {
      player_id: playerId,
      provider: player.playerExternalRef.provider,
      external_id:
        player.playerExternalRef.externalId,
    }
  })

  console.log("Importing player provider mappings...")

  await upsertBatches(
    "player_external_ids",
    playerExternalIds,
    "provider,external_id",
  )

  // --------------------------------------------------
  // CLUBS
  // --------------------------------------------------

  const uniqueClubs = new Map<
    string,
    {
      runtime_key: string
      name: string
      country: string | null
      image_url: string | null
      updated_at: string
      provider: string
      external_id: string
    }
  >()

  for (const player of players) {
    for (const club of player.eligibleClubs ?? []) {
      const externalId =
        club.teamExternalRef.externalId

      const profile =
        teamProfileByExternalId.get(externalId)

      uniqueClubs.set(externalId, {
        runtime_key: `club:${externalId}`,
        name: club.name,
        country: profile?.country ?? null,
        image_url:
          club.logo ??
          profile?.logo ??
          null,
        updated_at: now,
        provider: club.teamExternalRef.provider,
        external_id: externalId,
      })
    }
  }

  const clubRows = [...uniqueClubs.values()].map(
    ({
      provider,
      external_id,
      ...club
    }) => club,
  )

  console.log("Importing clubs...")

  await upsertBatches(
    "clubs",
    clubRows,
    "runtime_key",
  )

  const dbClubs = await fetchAll<{
    id: string
    runtime_key: string
  }>(
    "clubs",
    "id,runtime_key",
  )

  const clubUuidByRuntimeKey = new Map(
    dbClubs.map((club) => [
      club.runtime_key,
      club.id,
    ]),
  )

  const clubExternalIds =
    [...uniqueClubs.values()].map((club) => {
      const clubId =
        clubUuidByRuntimeKey.get(club.runtime_key)

      if (!clubId) {
        throw new Error(
          `Missing FootGrid UUID for ${club.runtime_key}`,
        )
      }

      return {
        club_id: clubId,
        provider: club.provider,
        external_id: club.external_id,
      }
    })

  console.log("Importing club provider mappings...")

  await upsertBatches(
    "club_external_ids",
    clubExternalIds,
    "provider,external_id",
  )

  // --------------------------------------------------
  // LEAGUES
  // --------------------------------------------------

  const leagueSources = [
    39,
    78,
    135,
    140,
    61,
  ].map(loadLeague)

  const leagueRows = leagueSources.map(
    ({
      provider,
      external_id,
      ...league
    }) => league,
  )

  console.log("Importing leagues...")

  await upsertBatches(
    "leagues",
    leagueRows,
    "runtime_key",
  )

  const dbLeagues = await fetchAll<{
    id: string
    runtime_key: string
  }>(
    "leagues",
    "id,runtime_key",
  )

  const leagueUuidByRuntimeKey = new Map(
    dbLeagues.map((league) => [
      league.runtime_key,
      league.id,
    ]),
  )

  const leagueExternalIds =
    leagueSources.map((league) => {
      const leagueId =
        leagueUuidByRuntimeKey.get(
          league.runtime_key,
        )

      if (!leagueId) {
        throw new Error(
          `Missing FootGrid UUID for ${league.runtime_key}`,
        )
      }

      return {
        league_id: leagueId,
        provider: league.provider,
        external_id: league.external_id,
      }
    })

  console.log("Importing league provider mappings...")

  await upsertBatches(
    "league_external_ids",
    leagueExternalIds,
    "provider,external_id",
  )

  // --------------------------------------------------
  // PLAYER CLUB HISTORY
  // --------------------------------------------------

  const playerClubHistory: Record<
    string,
    unknown
  >[] = []

  for (const player of players) {
    const playerId =
      playerUuidByRuntimeKey.get(player.runtimeKey)

    if (!playerId) {
      throw new Error(
        `Missing player UUID for ${player.runtimeKey}`,
      )
    }

    for (const club of player.eligibleClubs ?? []) {
      const clubRuntimeKey =
        `club:${club.teamExternalRef.externalId}`

      const clubId =
        clubUuidByRuntimeKey.get(clubRuntimeKey)

      if (!clubId) {
        throw new Error(
          `Missing club UUID for ${clubRuntimeKey}`,
        )
      }

      for (const season of club.seasons ?? []) {
        playerClubHistory.push({
          player_id: playerId,
          club_id: clubId,
          season,
          appearances: null,
          minutes: null,
        })
      }
    }
  }

  console.log("Importing player club history...")

  await upsertBatches(
    "player_club_history",
    playerClubHistory,
    "player_id,club_id,season",
  )

  // --------------------------------------------------
  // PLAYER LEAGUE HISTORY
  // --------------------------------------------------

  const playerLeagueHistory: Record<
    string,
    unknown
  >[] = []

  for (const player of players) {
    const playerId =
      playerUuidByRuntimeKey.get(player.runtimeKey)

    if (!playerId) {
      throw new Error(
        `Missing player UUID for ${player.runtimeKey}`,
      )
    }

    for (const league of player.eligibleLeagues ?? []) {
      const leagueRuntimeKey =
        `league:${league.leagueExternalRef.externalId}`

      const leagueId =
        leagueUuidByRuntimeKey.get(
          leagueRuntimeKey,
        )

      if (!leagueId) {
        throw new Error(
          `Missing league UUID for ${leagueRuntimeKey}`,
        )
      }

      for (const season of league.seasons ?? []) {
        playerLeagueHistory.push({
          player_id: playerId,
          league_id: leagueId,
          season,
          appearances: null,
          minutes: null,
        })
      }
    }
  }

  console.log("Importing player league history...")

  await upsertBatches(
    "player_league_history",
    playerLeagueHistory,
    "player_id,league_id,season",
  )

  console.log("")
  console.log("----- IMPORT SUMMARY -----")
  console.log(`Players: ${playerRows.length}`)
  console.log(
    `Player external IDs: ${playerExternalIds.length}`,
  )
  console.log(`Clubs: ${clubRows.length}`)
  console.log(
    `Club external IDs: ${clubExternalIds.length}`,
  )
  console.log(`Leagues: ${leagueRows.length}`)
  console.log(
    `League external IDs: ${leagueExternalIds.length}`,
  )
  console.log(
    `Player club season rows: ${playerClubHistory.length}`,
  )
  console.log(
    `Player league season rows: ${playerLeagueHistory.length}`,
  )
  console.log("--------------------------")
  console.log("")
  console.log(
    "Football data import completed successfully.",
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
