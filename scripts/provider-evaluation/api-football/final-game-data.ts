import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Row = Record<string, unknown>

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type TargetLeagueId = "39" | "78" | "140" | "135" | "61"

type EligibleLeague = {
  leagueExternalRef: ExternalRef
  name: string
  seasons: number[]
  teamExternalIds: string[]
  evidenceType: "provider-league-season-statistics"
  eligibilityEvidence: "appearance-confirmed"
}

type SourceGamePlayer = Row & {
  playerExternalRef: ExternalRef
  criteria: {
    clubExternalIds: string[]
    nations: string[]
    positions: string[]
  }
  semantics: Row
}

type LeagueHistoryRow = {
  playerExternalRef: ExternalRef
  leagueExternalRef: ExternalRef
  leagueName: string
  seasons: number[]
  teamExternalIds: string[]
  evidenceType: "provider-league-season-statistics"
  eligibilityEvidence: "appearance-confirmed"
}

export type FinalGamePlayer = SourceGamePlayer & {
  eligibleLeagues: EligibleLeague[]
  criteria: SourceGamePlayer["criteria"] & {
    leagueExternalIds: string[]
  }
  semantics: SourceGamePlayer["semantics"] & {
    leagueBasis: "appearance-confirmed-target-league-statistics"
  }
}

const TARGET_LEAGUES: Record<TargetLeagueId, string> = {
  "39": "Premier League",
  "78": "Bundesliga",
  "140": "La Liga",
  "135": "Serie A",
  "61": "Ligue 1",
}

const TARGET_LEAGUE_ORDER: TargetLeagueId[] = [
  "39",
  "78",
  "140",
  "135",
  "61",
]

const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null

function parseExternalRef(value: unknown, label: string): ExternalRef {
  const ref = object(value)

  if (
    ref?.provider !== "api-football" ||
    typeof ref.externalId !== "string" ||
    !/^[1-9]\d*$/.test(ref.externalId)
  ) {
    throw new Error(`Invalid ${label}`)
  }

  return {
    provider: "api-football",
    externalId: ref.externalId,
  }
}

function readArray(path: string, label: string): unknown[] {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing`)
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be an array`)
  }

  return parsed
}

function uniqueStrings(
  value: unknown,
  label: string,
  allowEmpty = true,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error(`${label} contains an invalid string`)
    }

    const clean = raw.trim()

    if (seen.has(clean)) {
      throw new Error(`${label} contains duplicate value ${clean}`)
    }

    seen.add(clean)
    result.push(clean)
  }

  if (!allowEmpty && !result.length) {
    throw new Error(`${label} must not be empty`)
  }

  return result
}

function uniqueSeasons(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${label} must contain at least one season`)
  }

  const seasons: number[] = []
  const seen = new Set<number>()

  for (const raw of value) {
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 1900 ||
      raw > 2026
    ) {
      throw new Error(`${label} contains invalid season ${JSON.stringify(raw)}`)
    }

    if (seen.has(raw)) {
      throw new Error(`${label} contains duplicate season ${raw}`)
    }

    seen.add(raw)
    seasons.push(raw)
  }

  return seasons.sort((a, b) => a - b)
}

function parseSourcePlayer(value: unknown): SourceGamePlayer {
  const row = object(value)
  const criteria = object(row?.criteria)
  const semantics = object(row?.semantics)

  if (!row || !criteria || !semantics) {
    throw new Error("Malformed player-game-data.json row")
  }

  const playerExternalRef = parseExternalRef(
    row.playerExternalRef,
    "player-game-data playerExternalRef",
  )

  return {
    ...row,
    playerExternalRef,
    criteria: {
      clubExternalIds: uniqueStrings(
        criteria.clubExternalIds,
        `player ${playerExternalRef.externalId} club criteria`,
      ),
      nations: uniqueStrings(
        criteria.nations,
        `player ${playerExternalRef.externalId} nation criteria`,
      ),
      positions: uniqueStrings(
        criteria.positions,
        `player ${playerExternalRef.externalId} position criteria`,
      ),
    },
    semantics,
  } as SourceGamePlayer
}

function parseLeagueHistory(value: unknown): LeagueHistoryRow {
  const row = object(value)

  if (!row) {
    throw new Error("Malformed player-league-history.json row")
  }

  const playerExternalRef = parseExternalRef(
    row.playerExternalRef,
    "league history playerExternalRef",
  )

  const leagueExternalRef = parseExternalRef(
    row.leagueExternalRef,
    "league history leagueExternalRef",
  )

  const leagueId = leagueExternalRef.externalId

  if (!(leagueId in TARGET_LEAGUES)) {
    throw new Error(
      `Unexpected league ID ${leagueId} for player ${playerExternalRef.externalId}`,
    )
  }

  const expectedName = TARGET_LEAGUES[leagueId as TargetLeagueId]

  if (row.leagueName !== expectedName) {
    throw new Error(
      `League name mismatch for ID ${leagueId}: expected ${expectedName}, got ${String(row.leagueName)}`,
    )
  }

  if (
    row.evidenceType !== "provider-league-season-statistics" ||
    row.eligibilityEvidence !== "appearance-confirmed"
  ) {
    throw new Error(
      `League row for player ${playerExternalRef.externalId}, league ${leagueId} lacks appearance-confirmed evidence`,
    )
  }

  return {
    playerExternalRef,
    leagueExternalRef,
    leagueName: expectedName,
    seasons: uniqueSeasons(
      row.seasons,
      `player ${playerExternalRef.externalId}, league ${leagueId} seasons`,
    ),
    teamExternalIds: uniqueStrings(
      row.teamExternalIds,
      `player ${playerExternalRef.externalId}, league ${leagueId} teamExternalIds`,
      false,
    ),
    evidenceType: "provider-league-season-statistics",
    eligibilityEvidence: "appearance-confirmed",
  }
}

function writeJson(directory: string, name: string, value: unknown) {
  writeFileSync(
    join(directory, name),
    JSON.stringify(value, null, 2) + "\n",
  )
}

export function buildFinalGameData(directory: string) {
  const sourcePlayers = readArray(
    join(directory, "player-game-data.json"),
    "player-game-data.json",
  ).map(parseSourcePlayer)

  const leagueHistory = readArray(
    join(directory, "player-league-history.json"),
    "player-league-history.json",
  ).map(parseLeagueHistory)

  const playerById = new Map<string, SourceGamePlayer>()

  for (const player of sourcePlayers) {
    const playerId = player.playerExternalRef.externalId

    if (playerById.has(playerId)) {
      throw new Error(`Duplicate source player ID ${playerId}`)
    }

    playerById.set(playerId, player)
  }

  const historyByPlayerId = new Map<string, LeagueHistoryRow[]>()
  const seenPlayerLeaguePairs = new Set<string>()

  for (const row of leagueHistory) {
    const playerId = row.playerExternalRef.externalId
    const leagueId = row.leagueExternalRef.externalId

    if (!playerById.has(playerId)) {
      throw new Error(
        `League history references player ${playerId} outside player-game-data.json`,
      )
    }

    const pairKey = `${playerId}:${leagueId}`

    if (seenPlayerLeaguePairs.has(pairKey)) {
      throw new Error(`Duplicate player-league history row ${pairKey}`)
    }

    seenPlayerLeaguePairs.add(pairKey)

    const current = historyByPlayerId.get(playerId) ?? []
    current.push(row)
    historyByPlayerId.set(playerId, current)
  }

  const finalPlayers: FinalGamePlayer[] = sourcePlayers
    .map(player => {
      const playerId = player.playerExternalRef.externalId
      const history = historyByPlayerId.get(playerId) ?? []

      const eligibleLeagues: EligibleLeague[] = history
        .map(row => ({
          leagueExternalRef: row.leagueExternalRef,
          name: row.leagueName,
          seasons: [...row.seasons],
          teamExternalIds: [...row.teamExternalIds],
          evidenceType: row.evidenceType,
          eligibilityEvidence: row.eligibilityEvidence,
        }))
        .sort(
          (a, b) =>
            TARGET_LEAGUE_ORDER.indexOf(
              a.leagueExternalRef.externalId as TargetLeagueId,
            ) -
            TARGET_LEAGUE_ORDER.indexOf(
              b.leagueExternalRef.externalId as TargetLeagueId,
            ),
        )

      const leagueExternalIds = eligibleLeagues.map(
        league => league.leagueExternalRef.externalId,
      )

      return {
        ...player,
        eligibleLeagues,
        criteria: {
          ...player.criteria,
          leagueExternalIds,
        },
        semantics: {
          ...player.semantics,
          leagueBasis: "appearance-confirmed-target-league-statistics" as const,
        },
      }
    })
    .sort(
      (a, b) =>
        Number(a.playerExternalRef.externalId) -
        Number(b.playerExternalRef.externalId),
    )

  const leagueCounts = Object.fromEntries(
    TARGET_LEAGUE_ORDER.map(leagueId => [
      TARGET_LEAGUES[leagueId],
      finalPlayers.filter(
        player =>
          player.criteria.leagueExternalIds.includes(leagueId),
      ).length,
    ]),
  )

  const playersWithClub = finalPlayers.filter(
    player => player.criteria.clubExternalIds.length > 0,
  ).length

  const playersWithLeague = finalPlayers.filter(
    player => player.criteria.leagueExternalIds.length > 0,
  ).length

  const playersWithNation = finalPlayers.filter(
    player => player.criteria.nations.length > 0,
  ).length

  const playersWithPosition = finalPlayers.filter(
    player => player.criteria.positions.length > 0,
  ).length

  const playersWithAllFour = finalPlayers.filter(
    player =>
      player.criteria.clubExternalIds.length > 0 &&
      player.criteria.leagueExternalIds.length > 0 &&
      player.criteria.nations.length > 0 &&
      player.criteria.positions.length > 0,
  ).length

  const summary = {
    finalPlayers: finalPlayers.length,
    leagueHistoryRows: leagueHistory.length,
    playersWithClubCriterion: playersWithClub,
    playersWithoutClubCriterion:
      finalPlayers.length - playersWithClub,
    playersWithLeagueCriterion: playersWithLeague,
    playersWithoutLeagueCriterion:
      finalPlayers.length - playersWithLeague,
    playersWithNationCriterion: playersWithNation,
    playersWithoutNationCriterion:
      finalPlayers.length - playersWithNation,
    playersWithPositionCriterion: playersWithPosition,
    playersWithoutPositionCriterion:
      finalPlayers.length - playersWithPosition,
    playersWithAllFourCriterionTypes: playersWithAllFour,
    leaguePlayerCounts: leagueCounts,
    targetLeagues: TARGET_LEAGUE_ORDER.map(id => ({
      externalId: id,
      name: TARGET_LEAGUES[id],
    })),
    note: [
      "Club eligibility remains season-backed senior-club association evidence.",
      "League eligibility is appearance-confirmed API-Football competition evidence.",
      "Nation remains API-Football profile nationality.",
      "Position remains the normalized current provider position.",
      "No league eligibility is inferred from club membership.",
      "This step makes no API requests.",
    ],
  }

  writeJson(directory, "final-player-game-data.json", finalPlayers)
  writeJson(directory, "final-game-data-summary.json", summary)

  return summary
}
