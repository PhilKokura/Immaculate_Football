import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type Row = Record<string, unknown>

type CriterionType = "club" | "league" | "nation" | "position"
type PositionCode = "GK" | "DEF" | "MID" | "ATT"

type RuntimeCriterion = {
  key: string
  type: CriterionType
  value: string
  label: string
  image?: string
  eligiblePlayerCount: number
  currentLeagueKey: string | null
}

type RuntimePlayer = {
  id: string
  externalId: string
  name: string
  searchNames: string[]
  image: string | null
  birthDate: string | null
  clubs: string[]
  clubNames: string[]
  leagues: string[]
  nation: string
  positions: PositionCode[]
  currentClubs: Array<{
    id: string
    name: string
  }>
  currentClubAmbiguous: boolean
  rarity: number
}

const TARGET_LEAGUES: Record<string, string> = {
  "39": "Premier League",
  "78": "Bundesliga",
  "140": "La Liga",
  "135": "Serie A",
  "61": "Ligue 1",
}

const POSITION_LABELS: Record<PositionCode, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  ATT: "Attacker",
}

// These aliases change the runtime nation used for eligibility and criteria.
const canonicalNationAliases: Record<string, string> = {
  "Czech Republic": "Czechia",
  Turkey: "Türkiye",
}

// Country codes resolve flags only; they do not affect player nationality.
const nationCountryCodes: Record<string, string> = {
  "Bosnia and Herzegovina": "BA",
  "Burkina Faso": "BF",
  "Côte d'Ivoire": "CI",
  "Cape Verde": "CV",
  "Central African Republic": "CF",
  "China PR": "CN",
  Comoros: "KM",
  Congo: "CG",
  "Congo DR": "CD",
  "Costa Rica": "CR",
  Czechia: "CZ",
  "Dominican Republic": "DO",
  "Equatorial Guinea": "GQ",
  "Guinea-Bissau": "GW",
  "Korea Republic": "KR",
  Mozambique: "MZ",
  "New Zealand": "NZ",
  Niger: "NE",
  "North Macedonia": "MK",
  "Northern Ireland": "GB-NIR",
  "Republic of Ireland": "IE",
  "Saudi Arabia": "SA",
  "Sierra Leone": "SL",
  Türkiye: "TR",
}

// These eight CDN assets returned 200 image/svg+xml in one development check.
// Runtime builds use this fixed list and never make network requests.
const verifiedMissingCountryFlags: Record<string, string> = {
  "Cape Verde": "https://media.api-sports.io/flags/cv.svg",
  "Central African Republic": "https://media.api-sports.io/flags/cf.svg",
  Comoros: "https://media.api-sports.io/flags/km.svg",
  "Equatorial Guinea": "https://media.api-sports.io/flags/gq.svg",
  "Guinea-Bissau": "https://media.api-sports.io/flags/gw.svg",
  Mozambique: "https://media.api-sports.io/flags/mz.svg",
  Niger: "https://media.api-sports.io/flags/ne.svg",
  "Sierra Leone": "https://media.api-sports.io/flags/sl.svg",
}

const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

function readArray(path: string, label: string): unknown[] {
  if (!existsSync(path)) throw new Error(`${label} is missing at ${path}`)
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array`)
  return parsed
}

function externalId(value: unknown, label: string): string {
  const ref = object(value)
  const id = text(ref?.externalId)
  if (ref?.provider !== "api-football" || !id || !/^[1-9]\d*$/.test(id)) {
    throw new Error(`Invalid ${label}`)
  }
  return id
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    const clean = text(raw)
    if (!clean) throw new Error(`${label} contains an invalid string`)
    if (seen.has(clean)) continue
    seen.add(clean)
    result.push(clean)
  }

  return result
}

function positionArray(value: unknown, label: string): PositionCode[] {
  const values = stringArray(value, label)
  for (const value of values) {
    if (!(value in POSITION_LABELS)) {
      throw new Error(`${label} contains unexpected position ${value}`)
    }
  }
  return values as PositionCode[]
}

function criterionKey(type: CriterionType, value: string) {
  return `${type}:${value}`
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const inputDir = join(scriptDir, ".local", "active-top5")
const repoRoot = resolve(scriptDir, "../../..")
const outputDir = join(repoRoot, "components", "data")

const finalPlayers = readArray(
  join(inputDir, "final-player-game-data.json"),
  "final-player-game-data.json",
)

const currentTeams = readArray(
  join(inputDir, "teams.json"),
  "teams.json",
)

const clubLogos = new Map<string, string>()
for (const raw of readArray(join(inputDir, "career-team-profiles.json"), "career-team-profiles.json")) {
  const profile = object(raw)
  if (!profile) throw new Error("Malformed career team profile")
  const id = externalId(profile.externalRef, "career team profile externalRef")
  const logo = text(profile.logo)
  if (logo) clubLogos.set(id, logo)
}

const leagueLogos = new Map<string, string>()
for (const leagueId of Object.keys(TARGET_LEAGUES)) {
  const path = join(inputDir, "raw", "league-catalog", `${leagueId}.json`)
  if (!existsSync(path)) throw new Error(`League catalog is missing for ${leagueId}`)
  const envelope = object(JSON.parse(readFileSync(path, "utf8")) as unknown)
  const first = Array.isArray(envelope?.response) ? object(envelope.response[0]) : null
  const league = object(first?.league)
  if (league?.id !== Number(leagueId)) throw new Error(`League catalog ID mismatch for ${leagueId}`)
  const logo = text(league.logo)
  if (logo) leagueLogos.set(leagueId, logo)
}

const countriesPath = join(inputDir, "raw", "countries", "countries.json")
if (!existsSync(countriesPath)) throw new Error("Countries cache is missing; run import-countries.ts first")
const countriesEnvelope = object(JSON.parse(readFileSync(countriesPath, "utf8")) as unknown)
if (!Array.isArray(countriesEnvelope?.response)) throw new Error("Countries cache response is malformed")
const countryFlagsByName = new Map<string, { code: string | null; flag: string }>()
const countryFlagsByCode = new Map<string, string>()
for (const raw of countriesEnvelope.response) {
  const country = object(raw)
  if (!country || typeof country.name !== "string") continue
  const flag = text(country.flag)
  const code = text(country.code)
  if (flag) {
    countryFlagsByName.set(country.name, { code, flag })
    if (code) countryFlagsByCode.set(code, flag)
  }
}

function nationFlag(nation: string): string | undefined {
  const expectedCode = nationCountryCodes[nation]
  const exact = countryFlagsByName.get(nation)
  // The cache reverses the Congo names, so an exact name is usable only if
  // its code agrees with a confirmed mapping when one exists.
  if (exact && (!expectedCode || exact.code === expectedCode)) return exact.flag
  return (expectedCode ? countryFlagsByCode.get(expectedCode) : undefined) ??
    verifiedMissingCountryFlags[nation]
}

const currentLeagueByTeamId = new Map<string, string>()
for (const rawTeam of currentTeams) {
  const team = object(rawTeam)
  if (!team) throw new Error("Malformed teams.json row")

  const teamId = externalId(team.externalRef, "teams.json externalRef")
  const leagueId = Number(team.leagueId)

  if (!Number.isInteger(leagueId) || !(String(leagueId) in TARGET_LEAGUES)) {
    throw new Error(`Unexpected current league for team ${teamId}`)
  }

  currentLeagueByTeamId.set(teamId, criterionKey("league", String(leagueId)))
}

const clubMeta = new Map<string, { name: string; count: number }>()
const leagueCounts = new Map<string, number>()
const nationCounts = new Map<string, number>()
const positionCounts = new Map<PositionCode, number>()

const runtimePlayers: RuntimePlayer[] = []
const seenPlayerIds = new Set<string>()

for (const rawPlayer of finalPlayers) {
  const player = object(rawPlayer)
  if (!player) throw new Error("Malformed final player row")

  const playerExternalId = externalId(
    player.playerExternalRef,
    "final player externalRef",
  )

  const id = text(player.runtimeKey) ?? `api-football:${playerExternalId}`
  if (seenPlayerIds.has(id)) throw new Error(`Duplicate runtime player ID ${id}`)
  seenPlayerIds.add(id)

  const name = text(player.displayName)
  if (!name) throw new Error(`Player ${playerExternalId} is missing displayName`)

  const criteria = object(player.criteria)
  if (!criteria) throw new Error(`Player ${playerExternalId} is missing criteria`)

  const clubs = stringArray(
    criteria.clubExternalIds,
    `player ${playerExternalId} club criteria`,
  )
  const leagues = stringArray(
    criteria.leagueExternalIds,
    `player ${playerExternalId} league criteria`,
  )
  const nations = stringArray(
    criteria.nations,
    `player ${playerExternalId} nation criteria`,
  ).map(nation => canonicalNationAliases[nation] ?? nation)
  const positions = positionArray(
    criteria.positions,
    `player ${playerExternalId} position criteria`,
  )

  if (nations.length > 1) {
    throw new Error(`Player ${playerExternalId} has more than one V1 nationality`)
  }

  if (!Array.isArray(player.eligibleClubs)) {
    throw new Error(`Player ${playerExternalId} is missing eligibleClubs`)
  }

  const eligibleClubNamesById = new Map<string, string>()
  for (const rawClub of player.eligibleClubs) {
    const club = object(rawClub)
    if (!club) throw new Error(`Malformed eligible club for player ${playerExternalId}`)

    const teamId = externalId(
      club.teamExternalRef,
      `eligible club externalRef for player ${playerExternalId}`,
    )
    const clubName = text(club.name) ?? `Team ${teamId}`
    eligibleClubNamesById.set(teamId, clubName)

    const existing = clubMeta.get(teamId)
    if (existing && existing.name !== clubName) {
      throw new Error(
        `Conflicting names for club ${teamId}: ${existing.name} vs ${clubName}`,
      )
    }

    clubMeta.set(teamId, {
      name: clubName,
      count: (existing?.count ?? 0) + 1,
    })
  }

  if (clubs.some(clubId => !eligibleClubNamesById.has(clubId))) {
    throw new Error(`Player ${playerExternalId} club criteria do not match eligibleClubs`)
  }

  for (const leagueId of leagues) {
    if (!(leagueId in TARGET_LEAGUES)) {
      throw new Error(`Player ${playerExternalId} has unexpected league ${leagueId}`)
    }
    leagueCounts.set(leagueId, (leagueCounts.get(leagueId) ?? 0) + 1)
  }

  for (const nation of nations) {
    nationCounts.set(nation, (nationCounts.get(nation) ?? 0) + 1)
  }

  for (const position of positions) {
    positionCounts.set(position, (positionCounts.get(position) ?? 0) + 1)
  }

  const currentClubs: RuntimePlayer["currentClubs"] = []
  if (Array.isArray(player.currentClubs)) {
    for (const rawCurrentClub of player.currentClubs) {
      const currentClub = object(rawCurrentClub)
      if (!currentClub) continue
      const teamId = externalId(
        currentClub.teamExternalRef,
        `current club externalRef for player ${playerExternalId}`,
      )
      const currentClubName = text(currentClub.name) ?? `Team ${teamId}`
      currentClubs.push({ id: teamId, name: currentClubName })
    }
  }

  runtimePlayers.push({
    id,
    externalId: playerExternalId,
    name,
    searchNames: stringArray(
      Array.isArray(player.searchNames) && player.searchNames.length
        ? player.searchNames
        : [name],
      `player ${playerExternalId} searchNames`,
    ),
    image: text(player.photo),
    birthDate: text(player.birthDate),
    clubs,
    clubNames: clubs.map(clubId => eligibleClubNamesById.get(clubId)!),
    leagues,
    nation: nations[0] ?? "",
    positions,
    currentClubs,
    currentClubAmbiguous: player.currentClubAmbiguous === true,
    // The current dataset has no behavioral rarity metric yet. Preserve the
    // existing UI's neutral/default value until real guess statistics exist.
    rarity: 1,
  })
}

const runtimeCriteria: RuntimeCriterion[] = []

for (const [clubId, meta] of clubMeta) {
  const image = clubLogos.get(clubId)
  runtimeCriteria.push({
    key: criterionKey("club", clubId),
    type: "club",
    value: clubId,
    label: meta.name,
    ...(image ? { image } : {}),
    eligiblePlayerCount: meta.count,
    currentLeagueKey: currentLeagueByTeamId.get(clubId) ?? null,
  })
}

for (const [leagueId, leagueName] of Object.entries(TARGET_LEAGUES)) {
  const image = leagueLogos.get(leagueId)
  runtimeCriteria.push({
    key: criterionKey("league", leagueId),
    type: "league",
    value: leagueId,
    label: leagueName,
    ...(image ? { image } : {}),
    eligiblePlayerCount: leagueCounts.get(leagueId) ?? 0,
    currentLeagueKey: null,
  })
}

for (const [nation, count] of nationCounts) {
  const image = nationFlag(nation)
  runtimeCriteria.push({
    key: criterionKey("nation", nation),
    type: "nation",
    value: nation,
    label: nation,
    ...(image ? { image } : {}),
    eligiblePlayerCount: count,
    currentLeagueKey: null,
  })
}

for (const position of ["DEF", "MID", "ATT", "GK"] as const) {
  runtimeCriteria.push({
    key: criterionKey("position", position),
    type: "position",
    value: position,
    label: POSITION_LABELS[position],
    eligiblePlayerCount: positionCounts.get(position) ?? 0,
    currentLeagueKey: null,
  })
}

runtimeCriteria.sort((a, b) =>
  a.type.localeCompare(b.type) ||
  b.eligiblePlayerCount - a.eligiblePlayerCount ||
  a.label.localeCompare(b.label),
)

const summary = {
  runtimePlayers: runtimePlayers.length,
  criteria: runtimeCriteria.length,
  clubs: runtimeCriteria.filter(row => row.type === "club").length,
  leagues: runtimeCriteria.filter(row => row.type === "league").length,
  nations: runtimeCriteria.filter(row => row.type === "nation").length,
  positions: runtimeCriteria.filter(row => row.type === "position").length,
  images: {
    clubs: { withImage: runtimeCriteria.filter(row => row.type === "club" && row.image).length, total: runtimeCriteria.filter(row => row.type === "club").length },
    leagues: { withImage: runtimeCriteria.filter(row => row.type === "league" && row.image).length, total: runtimeCriteria.filter(row => row.type === "league").length },
    nations: { withImage: runtimeCriteria.filter(row => row.type === "nation" && row.image).length, total: runtimeCriteria.filter(row => row.type === "nation").length },
    players: { withImage: runtimePlayers.filter(row => row.image).length, total: runtimePlayers.length },
    unmatchedNations: runtimeCriteria.filter(row => row.type === "nation" && !row.image).map(row => row.label).sort(),
  },
  canonicalNationAliases,
  nationCountryCodes,
  verifiedMissingCountryFlags,
  generatorPoolAtSupport9: {
    clubs: runtimeCriteria.filter(row => row.type === "club" && row.eligiblePlayerCount >= 9).length,
    leagues: runtimeCriteria.filter(row => row.type === "league" && row.eligiblePlayerCount >= 9).length,
    nations: runtimeCriteria.filter(row => row.type === "nation" && row.eligiblePlayerCount >= 9).length,
    positions: runtimeCriteria.filter(row => row.type === "position" && row.eligiblePlayerCount >= 9).length,
  },
  duplicateDisplayNameGroups: (() => {
    const counts = new Map<string, number>()
    for (const player of runtimePlayers) {
      const key = player.name
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase()
        .trim()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.values()].filter(count => count > 1).length
  })(),
  note: [
    "Runtime identity uses the provider-scoped runtimeKey until app-owned canonical player IDs are introduced.",
    "Club criteria use season-backed senior-club associations from final-player-game-data.json.",
    "League criteria use appearance-confirmed top-five league evidence from final-player-game-data.json.",
    "Puzzle generation only samples criteria with at least 9 eligible players, but all eligibility data remains available for validation/search.",
    "No API requests are made by this script.",
  ],
}

writeFileSync(
  join(outputDir, "runtime_players.json"),
  JSON.stringify(runtimePlayers, null, 2) + "\n",
)
writeFileSync(
  join(outputDir, "runtime_criteria.json"),
  JSON.stringify(runtimeCriteria, null, 2) + "\n",
)
writeFileSync(
  join(inputDir, "runtime-game-data-summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
)

console.log(`Runtime players: ${summary.runtimePlayers}`)
console.log(`Criteria: clubs=${summary.clubs}, leagues=${summary.leagues}, nations=${summary.nations}, positions=${summary.positions}`)
console.log(`Generator pool @ support>=9: ${JSON.stringify(summary.generatorPoolAtSupport9)}`)
console.log(`Duplicate normalized display-name groups: ${summary.duplicateDisplayNameGroups}`)
console.log(`Club criteria with image: ${summary.images.clubs.withImage} / ${summary.images.clubs.total}`)
console.log(`League criteria with image: ${summary.images.leagues.withImage} / ${summary.images.leagues.total}`)
console.log(`Nation criteria with image: ${summary.images.nations.withImage} / ${summary.images.nations.total}`)
console.log(`Players with image: ${summary.images.players.withImage} / ${summary.images.players.total}`)
console.log(`Nation criteria unmatched to /countries: ${summary.images.unmatchedNations.join(", ") || "none"}`)
console.log("Wrote components/data/runtime_players.json")
console.log("Wrote components/data/runtime_criteria.json")
