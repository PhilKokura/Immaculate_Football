import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Row = Record<string, unknown>

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type PositionCode = "GK" | "DEF" | "MID" | "ATT"

type SquadPlayer = {
  externalRef: ExternalRef
  name: string | null
  position: string | null
  photo: string | null
}

type PlayerProfile = {
  externalRef: ExternalRef
  providerName: string | null
  firstName: string | null
  lastName: string | null
  birthDate: string | null
  nationality: string | null
  photo: string | null
  position: string | null
}

type Membership = {
  playerExternalRef: ExternalRef
  teamExternalRef: ExternalRef
  seasonContext: number | null
  evidenceType: string | null
}

type CurrentTeam = {
  externalRef: ExternalRef
  name: string
  leagueId: number
  leagueName: string
  season: number
  country: string | null
  logo: string | null
}

type CareerClub = {
  teamExternalRef: ExternalRef
  providerTeamName: string | null
  providerTeamLogo: string | null
  seasons: number[]
  evidenceStrength:
    | "season-backed-association"
    | "association-without-season"
  classificationConfidence: "high" | "medium" | "manual"
  classificationSource: string
  evidenceType: string | null
}

type PlayerCareerClubs = {
  playerExternalRef: ExternalRef
  historyStatus: string
  clubs: CareerClub[]
}

type GameCurrentClub = {
  teamExternalRef: ExternalRef
  name: string
  logo: string | null
  country: string | null
  season: number
  membershipEvidenceType: string | null
}

type GameEligibleClub = {
  teamExternalRef: ExternalRef
  name: string
  logo: string | null
  seasons: number[]
  evidenceStrength: "season-backed-association"
  classificationConfidence: "high" | "medium" | "manual"
  classificationSource: string
  evidenceType: string | null
}

export type PlayerGameData = {
  runtimeKey: string
  playerExternalRef: ExternalRef
  displayName: string
  providerName: string | null
  fullName: string | null
  searchNames: string[]
  photo: string | null
  birthDate: string | null
  nationality: string | null
  position: PositionCode | null
  positionLabel: string | null
  currentClubs: GameCurrentClub[]
  currentClubAmbiguous: boolean
  eligibleClubs: GameEligibleClub[]
  excludedWeakSeniorClubAssociations: number
  criteria: {
    clubExternalIds: string[]
    nations: string[]
    positions: PositionCode[]
  }
  semantics: {
    nationBasis: "provider-nationality"
    positionBasis: "provider-current-position"
    clubBasis: "season-backed-senior-club-association"
  }
}

const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null

const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

const integerOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null

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
  if (!existsSync(path)) throw new Error(`${label} is missing`)
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`)
  return raw
}

function parseSquadPlayer(value: unknown): SquadPlayer {
  const row = object(value)
  if (!row) throw new Error("Invalid players.json row")

  return {
    externalRef: parseExternalRef(row.externalRef, "players.json externalRef"),
    name: nullableText(row.name),
    position: nullableText(row.position),
    photo: nullableText(row.photo),
  }
}

function parseProfile(value: unknown): PlayerProfile {
  const row = object(value)
  if (!row) throw new Error("Invalid player-profiles.json row")

  return {
    externalRef: parseExternalRef(
      row.externalRef,
      "player-profiles.json externalRef",
    ),
    providerName: nullableText(row.providerName),
    firstName: nullableText(row.firstName),
    lastName: nullableText(row.lastName),
    birthDate: nullableText(row.birthDate),
    nationality: nullableText(row.nationality),
    photo: nullableText(row.photo),
    position: nullableText(row.position),
  }
}

function parseMembership(value: unknown): Membership {
  const row = object(value)
  if (!row) throw new Error("Invalid player-team-memberships.json row")

  return {
    playerExternalRef: parseExternalRef(
      row.playerExternalRef,
      "membership playerExternalRef",
    ),
    teamExternalRef: parseExternalRef(
      row.teamExternalRef,
      "membership teamExternalRef",
    ),
    seasonContext: integerOrNull(row.seasonContext),
    evidenceType: nullableText(row.evidenceType),
  }
}

function parseCurrentTeam(value: unknown): CurrentTeam {
  const row = object(value)
  if (!row) throw new Error("Invalid teams.json row")

  const name = nullableText(row.name)
  const leagueName = nullableText(row.leagueName)
  const leagueId = integerOrNull(row.leagueId)
  const season = integerOrNull(row.season)

  if (!name || !leagueName || leagueId == null || season == null) {
    throw new Error("Invalid teams.json team metadata")
  }

  return {
    externalRef: parseExternalRef(row.externalRef, "teams.json externalRef"),
    name,
    leagueId,
    leagueName,
    season,
    country: nullableText(row.country),
    logo: nullableText(row.logo),
  }
}

function parseCareerClub(value: unknown): CareerClub {
  const row = object(value)
  if (!row) throw new Error("Invalid career club")

  if (!Array.isArray(row.seasons) || !row.seasons.every(season => Number.isInteger(season))) {
    throw new Error("Career club seasons must contain only integers")
  }

  if (
    row.evidenceStrength !== "season-backed-association" &&
    row.evidenceStrength !== "association-without-season"
  ) {
    throw new Error("Invalid career club evidenceStrength")
  }

  if (
    row.classificationConfidence !== "high" &&
    row.classificationConfidence !== "medium" &&
    row.classificationConfidence !== "manual"
  ) {
    throw new Error("Invalid career club classificationConfidence")
  }

  return {
    teamExternalRef: parseExternalRef(
      row.teamExternalRef,
      "career club teamExternalRef",
    ),
    providerTeamName: nullableText(row.providerTeamName),
    providerTeamLogo: nullableText(row.providerTeamLogo),
    seasons: [...row.seasons] as number[],
    evidenceStrength: row.evidenceStrength,
    classificationConfidence: row.classificationConfidence,
    classificationSource:
      nullableText(row.classificationSource) ?? "unknown",
    evidenceType: nullableText(row.evidenceType),
  }
}

function parseCareerRow(value: unknown): PlayerCareerClubs {
  const row = object(value)
  if (!row || !Array.isArray(row.clubs)) {
    throw new Error("Invalid player-career-clubs.json row")
  }

  return {
    playerExternalRef: parseExternalRef(
      row.playerExternalRef,
      "career playerExternalRef",
    ),
    historyStatus: nullableText(row.historyStatus) ?? "unknown",
    clubs: row.clubs.map(parseCareerClub),
  }
}

function normalizePosition(value: string | null): PositionCode | null {
  if (!value) return null

  switch (value.trim().toLowerCase()) {
    case "goalkeeper":
    case "keeper":
    case "gk":
      return "GK"
    case "defender":
    case "defence":
    case "defense":
    case "def":
      return "DEF"
    case "midfielder":
    case "midfield":
    case "mid":
      return "MID"
    case "attacker":
    case "forward":
    case "striker":
    case "att":
    case "fwd":
      return "ATT"
    default:
      return null
  }
}

function buildFullName(profile: PlayerProfile | undefined): string | null {
  if (!profile) return null

  const first = profile.firstName
  const last = profile.lastName

  if (first && last) {
    if (first.localeCompare(last, undefined, { sensitivity: "base" }) === 0) {
      return first
    }
    return `${first} ${last}`.replace(/\s+/g, " ").trim()
  }

  return first ?? last
}

function looksAbbreviatedProviderName(value: string | null): boolean {
  if (!value) return false
  return /^(?:[\p{L}]\.){1,3}\s+/u.test(value)
}

function uniqueTexts(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (!value?.trim()) continue
    const clean = value.replace(/\s+/g, " ").trim()
    const key = clean.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(clean)
  }

  return result
}

function numericIdSort(a: string, b: string) {
  return Number(a) - Number(b)
}

function latestSeason(club: GameEligibleClub): number {
  return club.seasons.length ? Math.max(...club.seasons) : -Infinity
}

export function buildGameData(directory: string) {
  const squad = readArray(join(directory, "players.json"), "players.json")
    .map(parseSquadPlayer)

  const profiles = readArray(
    join(directory, "player-profiles.json"),
    "player-profiles.json",
  ).map(parseProfile)

  const memberships = readArray(
    join(directory, "player-team-memberships.json"),
    "player-team-memberships.json",
  ).map(parseMembership)

  const currentTeams = readArray(join(directory, "teams.json"), "teams.json")
    .map(parseCurrentTeam)

  const careerRows = readArray(
    join(directory, "player-career-clubs.json"),
    "player-career-clubs.json",
  ).map(parseCareerRow)

  const squadById = new Map<string, SquadPlayer>()
  for (const player of squad) {
    const id = player.externalRef.externalId
    if (squadById.has(id)) throw new Error(`Duplicate active player ID ${id}`)
    squadById.set(id, player)
  }

  const profileById = new Map<string, PlayerProfile>()
  for (const profile of profiles) {
    const id = profile.externalRef.externalId
    if (profileById.has(id)) throw new Error(`Duplicate profile player ID ${id}`)
    profileById.set(id, profile)
  }

  const teamById = new Map<string, CurrentTeam>()
  for (const team of currentTeams) {
    const id = team.externalRef.externalId
    if (teamById.has(id)) throw new Error(`Duplicate current team ID ${id}`)
    teamById.set(id, team)
  }

  const membershipsByPlayerId = new Map<string, Membership[]>()
  for (const membership of memberships) {
    const playerId = membership.playerExternalRef.externalId
    const teamId = membership.teamExternalRef.externalId

    if (!squadById.has(playerId)) {
      throw new Error(
        `Membership references player ${playerId} outside active whitelist`,
      )
    }

    if (!teamById.has(teamId)) {
      throw new Error(
        `Membership references current team ${teamId} missing from teams.json`,
      )
    }

    const rows = membershipsByPlayerId.get(playerId) ?? []
    rows.push(membership)
    membershipsByPlayerId.set(playerId, rows)
  }

  const careerByPlayerId = new Map<string, PlayerCareerClubs>()
  for (const career of careerRows) {
    const id = career.playerExternalRef.externalId
    if (!squadById.has(id)) {
      throw new Error(
        `Career dataset references player ${id} outside active whitelist`,
      )
    }
    if (careerByPlayerId.has(id)) {
      throw new Error(`Duplicate career row for player ${id}`)
    }
    careerByPlayerId.set(id, career)
  }

  const missingCareerRows = [...squadById.keys()]
    .filter(id => !careerByPlayerId.has(id))

  if (missingCareerRows.length) {
    throw new Error(
      `player-career-clubs.json is missing ${missingCareerRows.length} active players; ` +
      `first IDs: ${missingCareerRows.slice(0, 20).join(", ")}`,
    )
  }

  const gamePlayers: PlayerGameData[] = []
  const missingProfiles: string[] = []
  const missingNationality: string[] = []
  const missingPosition: string[] = []
  const missingCurrentClub: string[] = []
  const ambiguousCurrentClub: Array<{
    playerExternalRef: ExternalRef
    currentClubExternalIds: string[]
  }> = []
  const playersWithoutEligibleClub: string[] = []

  for (const playerId of [...squadById.keys()].sort(numericIdSort)) {
    const squadPlayer = squadById.get(playerId)!
    const profile = profileById.get(playerId)
    const career = careerByPlayerId.get(playerId)!

    if (!profile) missingProfiles.push(playerId)

    const providerName = profile?.providerName ?? squadPlayer.name
    const fullName = buildFullName(profile)

    const displayName =
      looksAbbreviatedProviderName(providerName) && fullName
        ? fullName
        : providerName ?? fullName ?? `Player ${playerId}`

    const positionLabel = profile?.position ?? squadPlayer.position
    const position = normalizePosition(positionLabel)
    const nationality = profile?.nationality ?? null
    const photo = profile?.photo ?? squadPlayer.photo

    if (!nationality) missingNationality.push(playerId)
    if (!position) missingPosition.push(playerId)

    const currentClubMemberships = membershipsByPlayerId.get(playerId) ?? []
    if (!currentClubMemberships.length) missingCurrentClub.push(playerId)

    const currentClubs: GameCurrentClub[] = currentClubMemberships
      .map(membership => {
        const team = teamById.get(membership.teamExternalRef.externalId)!
        return {
          teamExternalRef: team.externalRef,
          name: team.name,
          logo: team.logo,
          country: team.country,
          season: membership.seasonContext ?? team.season,
          membershipEvidenceType: membership.evidenceType,
        }
      })
      .sort((a, b) =>
        numericIdSort(
          a.teamExternalRef.externalId,
          b.teamExternalRef.externalId,
        ),
      )

    if (currentClubs.length > 1) {
      ambiguousCurrentClub.push({
        playerExternalRef: squadPlayer.externalRef,
        currentClubExternalIds: currentClubs.map(
          club => club.teamExternalRef.externalId,
        ),
      })
    }

    const seenCareerTeamIds = new Set<string>()
    const eligibleClubs: GameEligibleClub[] = []
    let excludedWeakSeniorClubAssociations = 0

    for (const club of career.clubs) {
      const teamId = club.teamExternalRef.externalId
      if (seenCareerTeamIds.has(teamId)) {
        throw new Error(
          `Duplicate career club ${teamId} for player ${playerId}`,
        )
      }
      seenCareerTeamIds.add(teamId)

      if (club.evidenceStrength === "association-without-season") {
        excludedWeakSeniorClubAssociations += 1
        continue
      }

      if (!club.seasons.length) {
        throw new Error(
          `Player ${playerId}, club ${teamId} is marked season-backed without seasons`,
        )
      }

      eligibleClubs.push({
        teamExternalRef: club.teamExternalRef,
        name: club.providerTeamName ?? `Team ${teamId}`,
        logo: club.providerTeamLogo,
        seasons: [...club.seasons],
        evidenceStrength: "season-backed-association",
        classificationConfidence: club.classificationConfidence,
        classificationSource: club.classificationSource,
        evidenceType: club.evidenceType,
      })
    }

    eligibleClubs.sort((a, b) =>
      latestSeason(b) - latestSeason(a) ||
      numericIdSort(
        a.teamExternalRef.externalId,
        b.teamExternalRef.externalId,
      ),
    )

    if (!eligibleClubs.length) playersWithoutEligibleClub.push(playerId)

    const searchNames = uniqueTexts([
      displayName,
      providerName,
      fullName,
      profile?.firstName,
      profile?.lastName,
      squadPlayer.name,
    ])

    gamePlayers.push({
      runtimeKey: `api-football:${playerId}`,
      playerExternalRef: squadPlayer.externalRef,
      displayName,
      providerName,
      fullName,
      searchNames,
      photo,
      birthDate: profile?.birthDate ?? null,
      nationality,
      position,
      positionLabel,
      currentClubs,
      currentClubAmbiguous: currentClubs.length > 1,
      eligibleClubs,
      excludedWeakSeniorClubAssociations,
      criteria: {
        clubExternalIds: eligibleClubs.map(
          club => club.teamExternalRef.externalId,
        ),
        nations: nationality ? [nationality] : [],
        positions: position ? [position] : [],
      },
      semantics: {
        nationBasis: "provider-nationality",
        positionBasis: "provider-current-position",
        clubBasis: "season-backed-senior-club-association",
      },
    })
  }

  const duplicateDisplayNameMap = new Map<string, string[]>()
  for (const player of gamePlayers) {
    const key = player.displayName
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .trim()

    const ids = duplicateDisplayNameMap.get(key) ?? []
    ids.push(player.playerExternalRef.externalId)
    duplicateDisplayNameMap.set(key, ids)
  }

  const duplicateDisplayNames = [...duplicateDisplayNameMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([normalizedDisplayName, playerExternalIds]) => ({
      normalizedDisplayName,
      playerExternalIds: [...playerExternalIds].sort(numericIdSort),
      displayNames: playerExternalIds.map(
        id => gamePlayers.find(
          player => player.playerExternalRef.externalId === id,
        )!.displayName,
      ),
    }))

  const clubVocabulary = new Map<string, {
    teamExternalRef: ExternalRef
    name: string
    logo: string | null
    eligiblePlayerCount: number
  }>()

  const nationCounts = new Map<string, number>()
  const positionCounts = new Map<PositionCode, number>([
    ["GK", 0],
    ["DEF", 0],
    ["MID", 0],
    ["ATT", 0],
  ])

  let eligibleClubAssociations = 0
  let excludedWeakSeniorClubAssociations = 0

  for (const player of gamePlayers) {
    if (player.nationality) {
      nationCounts.set(
        player.nationality,
        (nationCounts.get(player.nationality) ?? 0) + 1,
      )
    }

    if (player.position) {
      positionCounts.set(
        player.position,
        (positionCounts.get(player.position) ?? 0) + 1,
      )
    }

    excludedWeakSeniorClubAssociations +=
      player.excludedWeakSeniorClubAssociations

    for (const club of player.eligibleClubs) {
      eligibleClubAssociations += 1
      const id = club.teamExternalRef.externalId
      const existing = clubVocabulary.get(id)

      if (existing) {
        existing.eligiblePlayerCount += 1
      } else {
        clubVocabulary.set(id, {
          teamExternalRef: club.teamExternalRef,
          name: club.name,
          logo: club.logo,
          eligiblePlayerCount: 1,
        })
      }
    }
  }

  const gameEligibleClubs = [...clubVocabulary.values()]
    .sort((a, b) =>
      b.eligiblePlayerCount - a.eligiblePlayerCount ||
      a.name.localeCompare(b.name),
    )

  const gameNationVocabulary = [...nationCounts.entries()]
    .map(([name, eligiblePlayerCount]) => ({
      name,
      eligiblePlayerCount,
      basis: "provider-nationality" as const,
    }))
    .sort((a, b) =>
      b.eligiblePlayerCount - a.eligiblePlayerCount ||
      a.name.localeCompare(b.name),
    )

  const gamePositionVocabulary = [...positionCounts.entries()]
    .map(([code, eligiblePlayerCount]) => ({
      code,
      eligiblePlayerCount,
      basis: "provider-current-position" as const,
    }))

  const summary = {
    activePlayers: gamePlayers.length,
    profilesFound: gamePlayers.length - missingProfiles.length,
    profilesMissing: missingProfiles.length,
    playersWithNationality: gamePlayers.length - missingNationality.length,
    playersWithoutNationality: missingNationality.length,
    playersWithPosition: gamePlayers.length - missingPosition.length,
    playersWithoutPosition: missingPosition.length,
    playersWithCurrentClub:
      gamePlayers.length - missingCurrentClub.length,
    playersWithoutCurrentClub: missingCurrentClub.length,
    playersWithAmbiguousCurrentClub: ambiguousCurrentClub.length,
    currentMemberships: memberships.length,
    playersWithAtLeastOneEligibleClub:
      gamePlayers.length - playersWithoutEligibleClub.length,
    playersWithoutEligibleClub: playersWithoutEligibleClub.length,
    eligibleClubAssociations,
    excludedWeakSeniorClubAssociations,
    uniqueEligibleClubs: gameEligibleClubs.length,
    uniqueNations: gameNationVocabulary.length,
    positionCounts: Object.fromEntries(positionCounts),
    duplicateNormalizedDisplayNameGroups: duplicateDisplayNames.length,
    note: [
      "Club criteria include only season-backed senior-club associations.",
      "Current squad membership is stored as metadata and is not automatically promoted to club eligibility.",
      "Nationality criteria use API-Football profile nationality, not national-team history or birth country.",
      "Position criteria use the current provider position normalized to GK/DEF/MID/ATT.",
      "Multiple current memberships are preserved instead of choosing one arbitrarily.",
      "runtimeKey is a temporary provider-scoped runtime key, not the future app-owned canonical player ID.",
      "Historical league eligibility is intentionally not generated in this step.",
    ],
  }

  const review = {
    missingProfiles,
    missingNationality,
    missingPosition,
    missingCurrentClub,
    ambiguousCurrentClub,
    playersWithoutEligibleClub,
    duplicateDisplayNames,
  }

  const write = (name: string, value: unknown) =>
    writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")

  write("player-game-data.json", gamePlayers)
  write("player-game-data-summary.json", summary)
  write("player-game-data-review.json", review)
  write("game-eligible-clubs.json", gameEligibleClubs)
  write("game-nation-vocabulary.json", gameNationVocabulary)
  write("game-position-vocabulary.json", gamePositionVocabulary)

  return summary
}
