import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import type { GameCriterion, PlayerWithImage, PositionCode } from "../components/data/gameData"
import { canonicalizeRuntimeNation, createNationFlagResolver } from "./provider-evaluation/api-football/runtime-nations"
import { currentLeagueKeys, type ClubLeagueMembership } from "./club-league-memberships"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error("Missing Supabase server environment variables")
}

const supabase = createClient(url, key)

const outputDirectory = path.join(
  process.cwd(),
  "components",
  "data",
)

const playersOutputPath = path.join(
  outputDirectory,
  "runtime_players.json",
)

const criteriaOutputPath = path.join(
  outputDirectory,
  "runtime_criteria.json",
)

type Presentation = { label: string; image?: string }
const oldCriteria: Array<{ key: string; label: string; image?: string | null }> = fs.existsSync(criteriaOutputPath)
  ? JSON.parse(fs.readFileSync(criteriaOutputPath, "utf8")) : []
const presentationByKey = new Map<string, Presentation>(oldCriteria.map(criterion => [
  criterion.key,
  { label: criterion.label, ...(criterion.image ? { image: criterion.image } : {}) },
]))
const sourceDirectory = path.join(process.cwd(), "scripts", "provider-evaluation", "api-football", ".local", "active-top5")
const countriesEnvelope = JSON.parse(fs.readFileSync(path.join(sourceDirectory, "raw", "countries", "countries.json"), "utf8")) as {
  response?: Array<{ name: string; code?: string | null; flag?: string | null }>
}
if (!Array.isArray(countriesEnvelope.response)) throw new Error("Countries cache is malformed")
const nationFlag = createNationFlagResolver(countriesEnvelope.response)
async function fetchAll<T>(
  table: string,
  columns: string,
  options: { currentOnly?: boolean; orderBy?: string } = {},
): Promise<T[]> {
  const result: T[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns)
      .range(from, from + pageSize - 1)
    if (options.currentOnly) query = query.eq("is_current", true)
    if (options.orderBy) query = query.order(options.orderBy)
    const { data, error } = await query

    if (error) {
      throw new Error(
        `${table}: ${error.message}`,
      )
    }

    result.push(...((data ?? []) as T[]))

    if ((data ?? []).length < pageSize) {
      break
    }
  }

  return result
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
) {
  let set = map.get(key)

  if (!set) {
    set = new Set()
    map.set(key, set)
  }

  set.add(value)
}

function increment(
  map: Map<string, number>,
  key: string,
) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

async function main() {
  console.log("Reading canonical football data from Supabase...")

  const [
    players,
    playerExternalIds,
    clubs,
    leagues,
    clubHistory,
    leagueHistory,
    currentClubRows,
    clubLeagueMemberships,
  ] = await Promise.all([
    fetchAll<{ id: string; runtime_key: string; name: string; search_names: string[] | null; birth_date: string | null; nationality: string | null; position: PositionCode | null; image_url: string | null; active: boolean }>(
      "players",
      "id,runtime_key,name,search_names,birth_date,nationality,position,image_url,active",
    ),

    fetchAll<{ player_id: string; provider: string; external_id: string }>(
      "player_external_ids",
      "player_id,provider,external_id",
    ),

    fetchAll<{ id: string; name: string; image_url: string | null }>(
      "clubs",
      "id,name,image_url",
    ),

    fetchAll<{ id: string; name: string; image_url: string | null }>(
      "leagues",
      "id,name,image_url",
    ),

    fetchAll<{ player_id: string; club_id: string }>(
      "player_club_history",
      "player_id,club_id",
    ),

    fetchAll<{ player_id: string; league_id: string }>(
      "player_league_history",
      "player_id,league_id",
    ),

    fetchAll<{ player_id: string; club_id: string }>(
      "player_current_clubs",
      "player_id,club_id",
    ),
    fetchAll<ClubLeagueMembership>(
      "club_league_memberships", "club_id,league_id,season,is_current",
      { currentOnly: true, orderBy: "id" },
    ),
  ])

  const clubById = new Map(
    clubs.map((club) => [club.id, club]),
  )

  const apiFootballIdByPlayerId = new Map(
    playerExternalIds
      .filter(
        (row) =>
          row.provider === "api-football",
      )
      .map((row) => [
        row.player_id,
        row.external_id,
      ]),
  )

  const currentLeagueByClubId = currentLeagueKeys(
    clubLeagueMemberships,
    new Set(leagues.map(league => league.id)),
  )

  const clubsByPlayer = new Map<
    string,
    Set<string>
  >()

  for (const row of clubHistory) {
    addToSetMap(
      clubsByPlayer,
      row.player_id,
      row.club_id,
    )
  }

  const leaguesByPlayer = new Map<
    string,
    Set<string>
  >()

  for (const row of leagueHistory) {
    addToSetMap(
      leaguesByPlayer,
      row.player_id,
      row.league_id,
    )
  }

  const currentClubsByPlayer = new Map<
    string,
    Set<string>
  >()

  for (const row of currentClubRows) {
    addToSetMap(
      currentClubsByPlayer,
      row.player_id,
      row.club_id,
    )
  }

  const runtimePlayers: PlayerWithImage[] = players
    .filter((player) => player.active)
    .map((player) => {
      const clubIds = [
        ...(clubsByPlayer.get(player.id) ??
          new Set()),
      ].sort()

      const leagueIds = [
        ...(leaguesByPlayer.get(player.id) ??
          new Set()),
      ].sort()

      const currentClubIds = [
        ...(currentClubsByPlayer.get(
          player.id,
        ) ?? new Set()),
      ].sort()

      const externalId = apiFootballIdByPlayerId.get(player.id)
      if (!externalId) throw new Error(`Missing API-Football reference for player ${player.id}`)
      const currentClubs = currentClubIds.map(clubId => {
        const club = clubById.get(clubId)
        if (!club) throw new Error(`Missing current club ${clubId}`)
        return { id: club.id, name: club.name }
      })

      return {
        /*
          This is now the authoritative FootGrid identity.
        */
        id: player.id,

        /*
          Compatibility/debug metadata only.
          Never use this as identity.
        */
        externalId,

        name: player.name,

        searchNames:
          player.search_names ?? [],

        birthDate:
          player.birth_date ?? null,

        image:
          player.image_url ?? null,

        clubs: clubIds,

        clubNames: clubIds
          .map(
            (clubId) =>
              clubById.get(clubId)?.name,
          )
          .filter((name): name is string => Boolean(name)),

        leagues: leagueIds,

        nation: canonicalizeRuntimeNation(player.nationality ?? ""),

        positions: player.position
          ? [player.position]
          : [],

        currentClubs,
        currentClubAmbiguous: currentClubs.length > 1,

        /*
          Kept only for compatibility.
          The UI no longer displays fake rarity.
        */
        rarity: 1,
      }
    })

  const clubSupport =
    new Map<string, number>()

  const leagueSupport =
    new Map<string, number>()

  const nationSupport =
    new Map<string, number>()

  const positionSupport =
    new Map<string, number>()

  for (const player of runtimePlayers) {
    for (const clubId of player.clubs) {
      increment(clubSupport, clubId)
    }

    for (const leagueId of player.leagues) {
      increment(leagueSupport, leagueId)
    }

    if (player.nation) {
      increment(
        nationSupport,
        player.nation,
      )
    }

    for (const position of player.positions) {
      increment(
        positionSupport,
        position,
      )
    }
  }

  const criteria: GameCriterion[] = []

  for (const club of clubs) {
    const support =
      clubSupport.get(club.id) ?? 0

    criteria.push({
      key: `club:${club.id}`,
      type: "club",
      value: club.id,
      label: club.name,
      eligiblePlayerCount: support,
      ...(club.image_url ? { image: club.image_url } : {}),
      currentLeagueKey: currentLeagueByClubId.get(club.id) ?? null,
    })
  }

  for (const league of leagues) {
    const support =
      leagueSupport.get(league.id) ?? 0

    criteria.push({
      key: `league:${league.id}`,
      type: "league",
      value: league.id,
      label: league.name,
      eligiblePlayerCount: support,
      ...(league.image_url ? { image: league.image_url } : {}),
      currentLeagueKey: null,
    })
  }

  for (const [
    nation,
    support,
  ] of [...nationSupport.entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const key = `nation:${nation}`
    const image = nationFlag(nation)

    criteria.push({
      key,
      type: "nation",
      value: nation,
      label: nation,
      eligiblePlayerCount: support,
      ...(image ? { image } : {}),
      currentLeagueKey: null,
    })
  }

  const positionLabels: Record<
    string,
    string
  > = {
    GK: "Goalkeeper",
    DEF: "Defender",
    MID: "Midfielder",
    ATT: "Attacker",
  }

  for (const position of [
    "GK",
    "DEF",
    "MID",
    "ATT",
  ]) {
    const support =
      positionSupport.get(position) ?? 0

    const key =
      `position:${position}`

    const presentation =
      presentationByKey.get(key)

    criteria.push({
      key,
      type: "position",
      value: position,
      label:
        presentation?.label ??
        positionLabels[position],
      eligiblePlayerCount: support,
      ...(presentation?.image ? { image: presentation.image } : {}),
      currentLeagueKey: null,
    })
  }

  criteria.sort((a, b) => {
    const typeOrder: Record<
      string,
      number
    > = {
      club: 0,
      league: 1,
      nation: 2,
      position: 3,
    }

    return (
      typeOrder[a.type] -
        typeOrder[b.type] ||
      a.label.localeCompare(b.label)
    )
  })

  fs.writeFileSync(
    playersOutputPath,
    JSON.stringify(
      runtimePlayers,
      null,
      2,
    ) + "\n",
  )

  fs.writeFileSync(
    criteriaOutputPath,
    JSON.stringify(
      criteria,
      null,
      2,
    ) + "\n",
  )

  console.log("")
  console.log("----- RUNTIME BUILD -----")
  console.log(
    `Players: ${runtimePlayers.length}`,
  )
  console.log(
    `Clubs: ${clubs.length}`,
  )
  console.log(
    `Leagues: ${leagues.length}`,
  )
  console.log(
    `Nations: ${nationSupport.size}`,
  )
  console.log(
    `Positions: ${positionSupport.size}`,
  )
  console.log(
    `Criteria total: ${criteria.length}`,
  )
  console.log("")
  console.log(
    "Runtime data built from Supabase successfully.",
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
