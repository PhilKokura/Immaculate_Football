import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type RecordValue = Record<string, unknown>

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type TeamClassification =
  | "senior-club"
  | "reserve-club"
  | "youth-club"
  | "senior-national-team"
  | "youth-national-team"
  | "representative-team"
  | "women-team"
  | "review"

type ClassificationConfidence = "high" | "medium" | "manual"

type ClassificationRecord = {
  externalRef: ExternalRef
  providerName: string | null
  classification: TeamClassification
  confidence: ClassificationConfidence
  source: string
}

type HistoryRecord = {
  playerExternalRef: ExternalRef
  teamExternalRef: ExternalRef
  providerTeamName: string | null
  providerTeamLogo: string | null
  seasons: number[]
  ignoredEmptySeasonValues: number
  evidenceType: string | null
}

type CareerClub = {
  teamExternalRef: ExternalRef
  providerTeamName: string | null
  providerTeamLogo: string | null
  seasons: number[]
  evidenceStrength:
    | "season-backed-association"
    | "association-without-season"
  classificationConfidence: ClassificationConfidence
  classificationSource: string
  evidenceType: string | null
}

type PlayerCareerClubs = {
  playerExternalRef: ExternalRef
  historyStatus:
    | "season-backed-senior-club-history"
    | "senior-club-history-without-seasons-only"
    | "history-without-senior-club"
    | "no-provider-history"
  clubs: CareerClub[]
}

const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

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

function parseWhitelistPlayerId(value: unknown): string {
  const row = object(value)
  if (!row) throw new Error("Invalid players.json row")
  return parseExternalRef(row.externalRef, "player externalRef").externalId
}

function parseClassification(value: unknown): ClassificationRecord {
  const row = object(value)
  if (!row) throw new Error("Invalid team-classifications.json row")

  const classification = row.classification
  const confidence = row.confidence

  const allowedClassifications = new Set<TeamClassification>([
    "senior-club",
    "reserve-club",
    "youth-club",
    "senior-national-team",
    "youth-national-team",
    "representative-team",
    "women-team",
    "review",
  ])

  if (
    typeof classification !== "string" ||
    !allowedClassifications.has(classification as TeamClassification)
  ) {
    throw new Error("Invalid team classification")
  }

  if (
    confidence !== "high" &&
    confidence !== "medium" &&
    confidence !== "manual"
  ) {
    throw new Error("Invalid team classification confidence")
  }

  return {
    externalRef: parseExternalRef(row.externalRef, "team classification externalRef"),
    providerName: text(row.providerName),
    classification: classification as TeamClassification,
    confidence,
    source: typeof row.source === "string" ? row.source : "unknown",
  }
}

function parseHistory(value: unknown): HistoryRecord {
  const row = object(value)
  if (!row) throw new Error("Invalid player-team-history.json row")

  if (!Array.isArray(row.seasons)) {
    throw new Error("History row seasons must be an array")
  }

  const playerExternalRef = parseExternalRef(
    row.playerExternalRef,
    "history player externalRef",
  )
  const teamExternalRef = parseExternalRef(
    row.teamExternalRef,
    "history team externalRef",
  )

  const seasons: number[] = []
  let ignoredEmptySeasonValues = 0

  for (const season of row.seasons) {
    if (Number.isInteger(season)) {
      seasons.push(season as number)
      continue
    }

    // API-Football occasionally includes an empty string inside the season
    // array. It carries no season information, so treat it as missing provider
    // evidence rather than inventing a year or failing the whole build.
    if (season === "") {
      ignoredEmptySeasonValues += 1
      continue
    }

    throw new Error(
      `Unexpected season value for player ${playerExternalRef.externalId}, ` +
      `team ${teamExternalRef.externalId}: ${JSON.stringify(season)}`,
    )
  }

  return {
    playerExternalRef,
    teamExternalRef,
    providerTeamName: text(row.providerTeamName),
    providerTeamLogo: text(row.providerTeamLogo),
    seasons,
    ignoredEmptySeasonValues,
    evidenceType: text(row.evidenceType),
  }
}

function readArray(path: string, label: string): unknown[] {
  if (!existsSync(path)) throw new Error(`${label} is missing`)
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`)
  return raw
}

function compareNumericIds(a: string, b: string) {
  return Number(a) - Number(b)
}

function sortCareerClubs(a: CareerClub, b: CareerClub) {
  const aLatest = a.seasons.length ? Math.max(...a.seasons) : -Infinity
  const bLatest = b.seasons.length ? Math.max(...b.seasons) : -Infinity

  if (aLatest !== bLatest) return bLatest - aLatest
  return compareNumericIds(
    a.teamExternalRef.externalId,
    b.teamExternalRef.externalId,
  )
}

export function buildPlayerCareerClubs(directory: string) {
  const playersPath = join(directory, "players.json")
  const historyPath = join(directory, "player-team-history.json")
  const classificationsPath = join(directory, "team-classifications.json")

  const whitelistRows = readArray(playersPath, "players.json")
  const historyRows = readArray(historyPath, "player-team-history.json")
  const classificationRows = readArray(
    classificationsPath,
    "team-classifications.json",
  )

  const whitelistIds = whitelistRows.map(parseWhitelistPlayerId)
  const whitelistSet = new Set<string>()

  for (const id of whitelistIds) {
    if (whitelistSet.has(id)) {
      throw new Error(`Duplicate player ID in players.json: ${id}`)
    }
    whitelistSet.add(id)
  }

  const classifications = classificationRows.map(parseClassification)
  const classificationByTeamId = new Map<string, ClassificationRecord>()

  for (const team of classifications) {
    const id = team.externalRef.externalId
    if (classificationByTeamId.has(id)) {
      throw new Error(`Duplicate team classification for team ID ${id}`)
    }
    classificationByTeamId.set(id, team)
  }

  const history = historyRows.map(parseHistory)
  const ignoredEmptySeasonValues = history.reduce(
    (sum, row) => sum + row.ignoredEmptySeasonValues,
    0,
  )
  const associationsWithIgnoredEmptySeasonValues = history.filter(
    row => row.ignoredEmptySeasonValues > 0,
  ).length

  const historyByPlayerId = new Map<string, HistoryRecord[]>()
  const seenPlayerTeamPairs = new Set<string>()
  const unmatchedHistoryPlayerIds = new Set<string>()
  const unmatchedTeamIds = new Set<string>()

  for (const association of history) {
    const playerId = association.playerExternalRef.externalId
    const teamId = association.teamExternalRef.externalId
    const pairKey = `${playerId}:${teamId}`

    if (seenPlayerTeamPairs.has(pairKey)) {
      throw new Error(
        `Duplicate player-team association in player-team-history.json: ${pairKey}`,
      )
    }
    seenPlayerTeamPairs.add(pairKey)

    if (!whitelistSet.has(playerId)) {
      unmatchedHistoryPlayerIds.add(playerId)
    }

    if (!classificationByTeamId.has(teamId)) {
      unmatchedTeamIds.add(teamId)
    }

    const rows = historyByPlayerId.get(playerId) ?? []
    rows.push(association)
    historyByPlayerId.set(playerId, rows)
  }

  if (unmatchedTeamIds.size) {
    throw new Error(
      `History contains ${unmatchedTeamIds.size} team IDs without classification: ` +
      [...unmatchedTeamIds].sort(compareNumericIds).slice(0, 20).join(", "),
    )
  }

  if (unmatchedHistoryPlayerIds.size) {
    throw new Error(
      `History contains ${unmatchedHistoryPlayerIds.size} player IDs outside players.json whitelist: ` +
      [...unmatchedHistoryPlayerIds].sort(compareNumericIds).slice(0, 20).join(", "),
    )
  }

  const excludedAssociationCounts: Record<TeamClassification, number> = {
    "senior-club": 0,
    "reserve-club": 0,
    "youth-club": 0,
    "senior-national-team": 0,
    "youth-national-team": 0,
    "representative-team": 0,
    "women-team": 0,
    "review": 0,
  }

  const result: PlayerCareerClubs[] = []
  const playersWithoutProviderHistory: PlayerCareerClubs[] = []
  const playersWithoutSeniorClubs: PlayerCareerClubs[] = []
  const playersWithWeakSeniorHistoryOnly: PlayerCareerClubs[] = []
  const uniqueSeniorClubIds = new Set<string>()

  let seniorClubAssociations = 0
  let seasonBackedSeniorClubAssociations = 0
  let seniorClubAssociationsWithoutSeason = 0

  for (const playerId of [...whitelistSet].sort(compareNumericIds)) {
    const associations = historyByPlayerId.get(playerId) ?? []
    const clubs: CareerClub[] = []

    for (const association of associations) {
      const teamId = association.teamExternalRef.externalId
      const classification = classificationByTeamId.get(teamId)!
      excludedAssociationCounts[classification.classification] += 1

      if (classification.classification !== "senior-club") continue

      seniorClubAssociations += 1
      uniqueSeniorClubIds.add(teamId)

      const seasonBacked = association.seasons.length > 0
      if (seasonBacked) {
        seasonBackedSeniorClubAssociations += 1
      } else {
        seniorClubAssociationsWithoutSeason += 1
      }

      clubs.push({
        teamExternalRef: association.teamExternalRef,
        providerTeamName:
          association.providerTeamName ?? classification.providerName,
        providerTeamLogo: association.providerTeamLogo,
        // Preserve provider season evidence exactly. Do not invent missing
        // seasons and do not reinterpret this as confirmed appearance data.
        seasons: [...association.seasons],
        evidenceStrength: seasonBacked
          ? "season-backed-association"
          : "association-without-season",
        classificationConfidence: classification.confidence,
        classificationSource: classification.source,
        evidenceType: association.evidenceType,
      })
    }

    clubs.sort(sortCareerClubs)

    const hasProviderHistory = associations.length > 0
    const hasSeniorClub = clubs.length > 0
    const hasSeasonBackedSeniorClub = clubs.some(
      club => club.evidenceStrength === "season-backed-association",
    )

    const historyStatus: PlayerCareerClubs["historyStatus"] =
      !hasProviderHistory
        ? "no-provider-history"
        : !hasSeniorClub
          ? "history-without-senior-club"
          : !hasSeasonBackedSeniorClub
            ? "senior-club-history-without-seasons-only"
            : "season-backed-senior-club-history"

    const row: PlayerCareerClubs = {
      playerExternalRef: {
        provider: "api-football",
        externalId: playerId,
      },
      historyStatus,
      clubs,
    }

    result.push(row)

    if (!hasProviderHistory) playersWithoutProviderHistory.push(row)
    if (!hasSeniorClub) playersWithoutSeniorClubs.push(row)
    if (hasSeniorClub && !hasSeasonBackedSeniorClub) {
      playersWithWeakSeniorHistoryOnly.push(row)
    }
  }

  const playersWithAnyHistory =
    result.length - playersWithoutProviderHistory.length
  const playersWithSeniorClub =
    result.length - playersWithoutSeniorClubs.length
  const playersWithSeasonBackedSeniorClub =
    playersWithSeniorClub - playersWithWeakSeniorHistoryOnly.length

  const summary = {
    activePlayers: result.length,
    playersWithAnyProviderHistory: playersWithAnyHistory,
    playersWithoutProviderHistory: playersWithoutProviderHistory.length,
    playersWithAtLeastOneSeniorClub: playersWithSeniorClub,
    playersWithoutSeniorClub: playersWithoutSeniorClubs.length,
    playersWithAtLeastOneSeasonBackedSeniorClub:
      playersWithSeasonBackedSeniorClub,
    playersWithSeniorClubsButNoSeasonBackedSeniorClub:
      playersWithWeakSeniorHistoryOnly.length,
    seniorClubAssociations,
    seasonBackedSeniorClubAssociations,
    seniorClubAssociationsWithoutSeason,
    uniqueSeniorClubsReferenced: uniqueSeniorClubIds.size,
    totalInputAssociations: history.length,
    ignoredEmptySeasonValues,
    associationsWithIgnoredEmptySeasonValues,
    associationsByTeamClassification: excludedAssociationCounts,
    unmatchedHistoryPlayers: unmatchedHistoryPlayerIds.size,
    unmatchedHistoryTeams: unmatchedTeamIds.size,
    note: [
      "Only associations whose team classification is senior-club are included in player-career-clubs.json.",
      "Valid integer season years are preserved as provider evidence and are not treated as proof of an appearance.",
      "API-Football empty-string season values are treated as missing season evidence, counted in the summary, and never converted into a year.",
      "association-without-season is retained as weaker evidence rather than discarded.",
      "Every active player from players.json is emitted, including players with no provider history or no senior-club history.",
      "Player identity/profile data is intentionally not duplicated here; join it later by API-Football external player ID.",
    ],
  }

  const write = (name: string, value: unknown) =>
    writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")

  write("player-career-clubs.json", result)
  write("player-career-clubs-summary.json", summary)
  write("players-without-provider-history.json", playersWithoutProviderHistory)
  write("players-without-senior-clubs.json", playersWithoutSeniorClubs)
  write(
    "players-with-weak-senior-history-only.json",
    playersWithWeakSeniorHistoryOnly,
  )

  return summary
}
