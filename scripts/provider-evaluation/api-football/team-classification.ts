import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type RecordValue = Record<string, unknown>

type BroadType = "club" | "national-team" | "unknown"

export type TeamClassification =
  | "senior-club"
  | "reserve-club"
  | "youth-club"
  | "senior-national-team"
  | "youth-national-team"
  | "representative-team"
  | "women-team"
  | "review"

type Confidence = "high" | "medium" | "manual"

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type Venue = {
  externalRef: ExternalRef | null
  name: string | null
  address: string | null
  city: string | null
  capacity: number | null
  surface: string | null
  image: string | null
} | null

export type CareerTeamProfile = {
  externalRef: ExternalRef
  providerName: string | null
  code: string | null
  country: string | null
  founded: number | null
  national: boolean | null
  broadType: BroadType
  logo: string | null
  venue: Venue
}

export type ClassificationRecord = CareerTeamProfile & {
  classification: TeamClassification
  confidence: Confidence
  reason: string
  source:
    | "provider+rule"
    | "current-top5-whitelist"
    | "built-in-override"
    | "manual-override"
}

type OverrideClassification = Exclude<TeamClassification, "review">

type ManualOverride = {
  classification: OverrideClassification
  note?: string
}

type ManualOverrides = Record<string, ManualOverride>

type ClassificationContext = {
  currentTopFiveIds: Set<string>
  knownNationalNames: Set<string>
  overrides: ManualOverrides
}

const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const booleanOrNull = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null

const normalizeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[Ã¢â‚¬â„¢']/g, "'")
    .replace(/[._/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const WOMEN_WORD_PATTERN =
  /\b(women|womens|women's|ladies|female|femenino|femenina|feminine|feminin|femminile|frauen)\b/i

const YOUTH_AGE_PATTERN =
  /\b(?:u[\s-]?(?:15|16|17|18|19|20|21|22|23)|under[\s-]?(?:15|16|17|18|19|20|21|22|23)|sub[\s-]?(?:15|16|17|18|19|20|21|22|23))\b/i

const YOUTH_WORD_PATTERN =
  /\b(youth|academy|primavera|juniores|juvenil)\b/i

const RESERVE_GENERIC_PATTERN =
  /\b(reserves?|reserve team|second team|b team)\b/i

// "II" remains a reserve signal, but Willem II is protected by a reviewed
// built-in override before this rule is evaluated.
const RESERVE_SUFFIX_PATTERN =
  /(?:\s|[-/])(?:ii|iii|b|c)$/i

const NUMERIC_RESERVE_SUFFIX_PATTERN =
  /\s2$/i

const ABBREVIATED_RESERVE_PATTERN =
  /\bres\.?$/i

const REPRESENTATIVE_PATTERN =
  /\b(all[\s-]?stars?|selection|select xi|representative side)\b/i

const ALTERNATIVE_NATIONAL_PATTERN =
  /\b(xi|local selection|local players|amateurs?)\b/i

const SPECIAL_RESERVE_NAMES = new Set([
  "real madrid castilla",
  "valencia mestalla",
  "sevilla atletico",
  "betis deportivo",
  "barcelona atletic",
  "barca atletic",
  "bilbao athletic",
  "celta fortuna",
  "juventus next gen",
  "atletico onubense",
  "rsc internacional",
  "lask juniors",
  "lask juniors linz",
])

const SPECIAL_REPRESENTATIVE_NAMES = new Set([
  "basque country",
  "ghana b",
])

// Provider-specific corrections confirmed during the audit.
// API-Football IDs remain external references only.
const BUILT_IN_OVERRIDES: ManualOverrides = {
  "195": {
    classification: "senior-club",
    note: "Willem II is a senior professional club; 'II' is part of the club name.",
  },
  "10983": {
    classification: "senior-national-team",
    note: "Guadeloupe is a senior representative/national side despite provider national=false.",
  },
  "1403": {
    classification: "reserve-club",
    note: "Lask Juniors Linz is a development/reserve side.",
  },
  "11225": {
    classification: "reserve-club",
    note: "LASK Juniors is a development/reserve side.",
  },
  "20270": {
    classification: "reserve-club",
    note: "RSC Internacional belongs to the Real Madrid reserve/development structure.",
  },
  "24724": {
    classification: "reserve-club",
    note: "Atletico Onubense is Recreativo de Huelva's reserve side.",
  },
  "27257": {
    classification: "representative-team",
    note: "Ghana B is a representative B national side, not a club.",
  },
}

const isYouthName = (normalizedName: string) =>
  YOUTH_AGE_PATTERN.test(normalizedName) ||
  YOUTH_WORD_PATTERN.test(normalizedName)

const isWomenTeamName = (normalizedName: string) =>
  WOMEN_WORD_PATTERN.test(normalizedName) ||
  (
    YOUTH_AGE_PATTERN.test(normalizedName) &&
    /(?:^|\s)w(?:\s|$)/i.test(normalizedName)
  )

const isReserveName = (normalizedName: string) =>
  RESERVE_GENERIC_PATTERN.test(normalizedName) ||
  RESERVE_SUFFIX_PATTERN.test(normalizedName) ||
  NUMERIC_RESERVE_SUFFIX_PATTERN.test(normalizedName) ||
  ABBREVIATED_RESERVE_PATTERN.test(normalizedName) ||
  /\bakatemia\b/.test(normalizedName) ||
  /^jong\s/.test(normalizedName) ||
  /\bnext gen\b/.test(normalizedName) ||
  /\bbeloften\b/.test(normalizedName) ||
  SPECIAL_RESERVE_NAMES.has(normalizedName)

const isRepresentativeName = (normalizedName: string) =>
  REPRESENTATIVE_PATTERN.test(normalizedName) ||
  SPECIAL_REPRESENTATIVE_NAMES.has(normalizedName)

const isYouthNationalName = (normalizedName: string) =>
  isYouthName(normalizedName) ||
  /\bolympic(?:s)?\b/.test(normalizedName)

function youthNationalBaseName(normalizedName: string): string | null {
  if (!YOUTH_AGE_PATTERN.test(normalizedName)) return null

  const stripped = normalizedName
    .replace(/\b(?:u[\s-]?(?:15|16|17|18|19|20|21|22|23)|under[\s-]?(?:15|16|17|18|19|20|21|22|23)|sub[\s-]?(?:15|16|17|18|19|20|21|22|23))\b/gi, " ")
    .replace(/(?:^|\s)w(?:\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return stripped || null
}

function parseExternalRef(value: unknown): ExternalRef {
  const ref = object(value)
  if (
    ref?.provider !== "api-football" ||
    typeof ref.externalId !== "string" ||
    !/^[1-9]\d*$/.test(ref.externalId)
  ) {
    throw new Error("Invalid API-Football externalRef")
  }
  return { provider: "api-football", externalId: ref.externalId }
}

function parseVenue(value: unknown): Venue {
  if (value == null) return null
  const venue = object(value)
  if (!venue) throw new Error("Invalid venue object")
  return {
    externalRef: venue.externalRef == null ? null : parseExternalRef(venue.externalRef),
    name: text(venue.name),
    address: text(venue.address),
    city: text(venue.city),
    capacity: numberOrNull(venue.capacity),
    surface: text(venue.surface),
    image: text(venue.image),
  }
}

function parseCareerTeamProfile(value: unknown): CareerTeamProfile {
  const row = object(value)
  if (!row) throw new Error("Invalid team profile row")

  const broadType = row.broadType
  if (broadType !== "club" && broadType !== "national-team" && broadType !== "unknown") {
    throw new Error("Invalid broadType in career-team-profiles.json")
  }

  return {
    externalRef: parseExternalRef(row.externalRef),
    providerName: text(row.providerName),
    code: text(row.code),
    country: text(row.country),
    founded: numberOrNull(row.founded),
    national: booleanOrNull(row.national),
    broadType,
    logo: text(row.logo),
    venue: parseVenue(row.venue),
  }
}

function loadCurrentTopFiveIds(directory: string): Set<string> {
  const path = join(directory, "teams.json")
  if (!existsSync(path)) return new Set()

  const input = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(input)) throw new Error("teams.json must be an array")

  const ids = new Set<string>()
  for (const row of input) {
    const value = object(row)
    if (!value) continue
    const ref = object(value.externalRef)
    if (
      ref?.provider === "api-football" &&
      typeof ref.externalId === "string" &&
      /^[1-9]\d*$/.test(ref.externalId)
    ) {
      ids.add(ref.externalId)
    }
  }
  return ids
}

function loadOverrides(directory: string): ManualOverrides {
  const path = join(directory, "team-classification-overrides.json")
  if (!existsSync(path)) return {}

  const input = JSON.parse(readFileSync(path, "utf8")) as unknown
  const root = object(input)
  if (!root) throw new Error("team-classification-overrides.json must be an object")

  const allowed = new Set<TeamClassification>([
    "senior-club",
    "reserve-club",
    "youth-club",
    "senior-national-team",
    "youth-national-team",
    "representative-team",
    "women-team",
  ])

  const result: ManualOverrides = {}
  for (const [teamId, raw] of Object.entries(root)) {
    if (!/^[1-9]\d*$/.test(teamId)) throw new Error(`Invalid override team ID: ${teamId}`)
    const item = object(raw)
    if (!item) throw new Error(`Invalid override object for team ${teamId}`)
    const classification = item.classification
    if (typeof classification !== "string" || !allowed.has(classification as TeamClassification)) {
      throw new Error(`Invalid classification override for team ${teamId}`)
    }
    result[teamId] = {
      classification: classification as OverrideClassification,
      ...(typeof item.note === "string" ? { note: item.note } : {}),
    }
  }
  return result
}

function buildKnownNationalNames(profiles: CareerTeamProfile[]): Set<string> {
  const names = new Set<string>()

  for (const profile of profiles) {
    if (profile.broadType !== "national-team") continue
    const rawName = profile.providerName?.trim()
    if (!rawName) continue

    const normalizedName = normalizeName(rawName)

    if (
      isWomenTeamName(normalizedName) ||
      isYouthNationalName(normalizedName) ||
      isRepresentativeName(normalizedName) ||
      ALTERNATIVE_NATIONAL_PATTERN.test(normalizedName)
    ) {
      continue
    }

    names.add(normalizedName)
  }

  // Reviewed provider exception: Guadeloupe is a senior representative/national
  // side but arrives with broadType=club.
  names.add("guadeloupe")

  return names
}

export function classifyTeam(
  profile: CareerTeamProfile,
  context: ClassificationContext,
): ClassificationRecord {
  const id = profile.externalRef.externalId

  const manualOverride = context.overrides[id]
  if (manualOverride) {
    return {
      ...profile,
      classification: manualOverride.classification,
      confidence: "manual",
      reason: manualOverride.note ?? "Manual classification override",
      source: "manual-override",
    }
  }

  const builtInOverride = BUILT_IN_OVERRIDES[id]
  if (builtInOverride) {
    return {
      ...profile,
      classification: builtInOverride.classification,
      confidence: "high",
      reason: builtInOverride.note ?? "Built-in reviewed classification override",
      source: "built-in-override",
    }
  }

  const rawName = profile.providerName?.trim() ?? ""
  const normalizedName = normalizeName(rawName)

  if (!rawName) {
    return {
      ...profile,
      classification: "review",
      confidence: "medium",
      reason: "Missing provider team name",
      source: "provider+rule",
    }
  }

  // Men-only product scope: women's teams are never allowed to flow into club
  // or national-team career history.
  if (isWomenTeamName(normalizedName)) {
    return {
      ...profile,
      classification: "women-team",
      confidence: "high",
      reason: "Team name contains an explicit women's-team marker in a men-only dataset",
      source: "provider+rule",
    }
  }

  if (profile.broadType === "national-team") {
    if (isYouthNationalName(normalizedName)) {
      return {
        ...profile,
        classification: "youth-national-team",
        confidence: "high",
        reason: "API-Football national team with explicit youth/Olympic marker",
        source: "provider+rule",
      }
    }

    if (
      ALTERNATIVE_NATIONAL_PATTERN.test(normalizedName) ||
      isRepresentativeName(normalizedName)
    ) {
      return {
        ...profile,
        classification: "representative-team",
        confidence: "high",
        reason: "National-team entry represents an alternative/select side rather than the senior national team",
        source: "provider+rule",
      }
    }

    return {
      ...profile,
      classification: "senior-national-team",
      confidence: "medium",
      reason: "API-Football national team with no explicit youth or representative marker",
      source: "provider+rule",
    }
  }

  if (profile.broadType === "club") {
    if (context.currentTopFiveIds.has(id)) {
      return {
        ...profile,
        classification: "senior-club",
        confidence: "high",
        reason: "Team ID is part of the imported current top-five senior-league team whitelist",
        source: "current-top5-whitelist",
      }
    }

    if (isRepresentativeName(normalizedName)) {
      return {
        ...profile,
        classification: "representative-team",
        confidence: "high",
        reason: "Provider marks this as a club, but the name identifies an All-Star/select/representative side",
        source: "provider+rule",
      }
    }

    // Some youth national teams arrive from API-Football with national=false.
    // We only reclassify them when their stripped base name exactly matches a
    // known senior national-team name from this same provider snapshot.
    if (YOUTH_AGE_PATTERN.test(normalizedName)) {
      const baseName = youthNationalBaseName(normalizedName)
      if (baseName && context.knownNationalNames.has(baseName)) {
        return {
          ...profile,
          classification: "youth-national-team",
          confidence: "high",
          reason: "Provider marks this as a club, but its youth-team base name exactly matches a known senior national team",
          source: "provider+rule",
        }
      }
    }

    if (isYouthName(normalizedName)) {
      return {
        ...profile,
        classification: "youth-club",
        confidence: "high",
        reason: "Club name contains an explicit youth-team marker",
        source: "provider+rule",
      }
    }

    if (isReserveName(normalizedName)) {
      return {
        ...profile,
        classification: "reserve-club",
        confidence: "high",
        reason: "Club name matches a reserve/development-team rule",
        source: "provider+rule",
      }
    }

    return {
      ...profile,
      classification: "senior-club",
      confidence: "medium",
      reason: "API-Football club with no explicit reserve, youth, representative, or women's marker",
      source: "provider+rule",
    }
  }

  return {
    ...profile,
    classification: "review",
    confidence: "medium",
    reason: "API-Football broad team type is unknown",
    source: "provider+rule",
  }
}

export function classifyCareerTeams(directory: string) {
  const sourcePath = join(directory, "career-team-profiles.json")
  if (!existsSync(sourcePath)) {
    throw new Error("career-team-profiles.json is missing")
  }

  const raw = JSON.parse(readFileSync(sourcePath, "utf8")) as unknown
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error("career-team-profiles.json is missing or empty")
  }

  const profiles = raw.map(parseCareerTeamProfile)
  const seenIds = new Set<string>()
  for (const profile of profiles) {
    const id = profile.externalRef.externalId
    if (seenIds.has(id)) throw new Error(`Duplicate team ID in career-team-profiles.json: ${id}`)
    seenIds.add(id)
  }

  const context: ClassificationContext = {
    currentTopFiveIds: loadCurrentTopFiveIds(directory),
    knownNationalNames: buildKnownNationalNames(profiles),
    overrides: loadOverrides(directory),
  }

  const classifications = profiles
    .map(profile => classifyTeam(profile, context))
    .sort((a, b) => Number(a.externalRef.externalId) - Number(b.externalRef.externalId))

  const review = classifications.filter(team => team.classification === "review")
  const seniorClubs = classifications.filter(team => team.classification === "senior-club")
  const reserveClubs = classifications.filter(team => team.classification === "reserve-club")
  const youthClubs = classifications.filter(team => team.classification === "youth-club")
  const seniorNationalTeams = classifications.filter(team => team.classification === "senior-national-team")
  const youthNationalTeams = classifications.filter(team => team.classification === "youth-national-team")
  const representativeTeams = classifications.filter(team => team.classification === "representative-team")
  const womenTeams = classifications.filter(team => team.classification === "women-team")

  const auditCandidates = classifications.filter(team =>
    team.confidence === "medium" &&
    (team.classification === "senior-club" || team.classification === "senior-national-team")
  )

  const providerClubYouthNationalCorrections = classifications.filter(team =>
    team.broadType === "club" &&
    team.classification === "youth-national-team"
  )

  const counts = {
    totalTeams: classifications.length,
    seniorClubs: seniorClubs.length,
    reserveClubs: reserveClubs.length,
    youthClubs: youthClubs.length,
    seniorNationalTeams: seniorNationalTeams.length,
    youthNationalTeams: youthNationalTeams.length,
    representativeTeams: representativeTeams.length,
    womenTeams: womenTeams.length,
    review: review.length,
    mediumConfidenceAuditCandidates: auditCandidates.length,
    providerClubYouthNationalCorrections: providerClubYouthNationalCorrections.length,
    currentTopFiveSeniorTeamsRecognized: classifications.filter(
      team => team.source === "current-top5-whitelist",
    ).length,
    builtInOverridesApplied: classifications.filter(
      team => team.source === "built-in-override",
    ).length,
    manualOverridesApplied: classifications.filter(
      team => team.source === "manual-override",
    ).length,
  }

  const write = (name: string, value: unknown) =>
    writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")

  write("team-classifications.json", classifications)
  write("team-classification-review.json", review)
  write("team-classification-audit.json", auditCandidates)
  write("senior-clubs.json", seniorClubs)
  write("senior-national-teams.json", seniorNationalTeams)
  write("representative-teams.json", representativeTeams)
  write("women-teams.json", womenTeams)
  write("provider-club-youth-national-corrections.json", providerClubYouthNationalCorrections)
  write("team-classification-summary.json", {
    ...counts,
    note: [
      "Classification is deterministic and conservative.",
      "The product scope is men's football only; explicit women's-team records are separated as women-team.",
      "API-Football team.national is broad provider evidence, not an infallible taxonomy.",
      "Youth teams with provider national=false are reclassified as youth-national-team only when their stripped base name exactly matches a known senior national team in the same snapshot.",
      "This avoids treating club youth teams such as Monaco U19 as national teams unless Monaco exists as a known senior national side in the snapshot.",
      "Current top-five team IDs from teams.json are treated as known senior clubs.",
      "Explicit youth/reserve/development markers are excluded from senior-club history.",
      "All-Star/select/regional representative sides are separated from clubs and national teams.",
      "Medium-confidence senior clubs/national teams remain available in team-classification-audit.json.",
      "Manual overrides in team-classification-overrides.json take precedence over built-in reviewed corrections.",
    ],
  })

  return counts
}
