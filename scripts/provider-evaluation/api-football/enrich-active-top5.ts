import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { LEAGUES, SEASON, type Reply, type Requester } from "./active-top5"

export const PAGES: Readonly<Record<number, number>> = { 39: 26, 78: 22, 140: 29, 135: 30, 61: 24 }
type Row = Record<string, unknown>
const object = (value: unknown): Row | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null
const nonnegative = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
const possibleAge = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null
const birthDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && date <= new Date() ? value : null
}
export type PageFailure = "authentication" | "quota" | "coverage" | "empty" | "malformed" | "http" | "network"
export function parsePage(reply: Reply, leagueId: number, page: number): { rows: Row[]; failure?: PageFailure } {
  const body = object(reply.body)
  const errors = body?.errors
  const message = JSON.stringify(errors ?? {}).toLowerCase()
  if (reply.httpStatus === 401 || /api.?key|token|authentication|unauthorized/.test(message)) return { rows: [], failure: "authentication" }
  if (reply.httpStatus === 429 || /quota|rate.limit|request.limit|too many requests/.test(message)) return { rows: [], failure: "quota" }
  if (reply.httpStatus === 403 || /subscription|coverage|not covered|plan|season.*available/.test(message)) return { rows: [], failure: "coverage" }
  if (reply.httpStatus >= 400 || (errors && JSON.stringify(errors) !== "[]" && JSON.stringify(errors) !== "{}")) return { rows: [], failure: "http" }
  if (!body || !Array.isArray(body.response) || !body.response.every(row => object(row))) return { rows: [], failure: "malformed" }
  const paging = object(body.paging)
  if (paging && (paging.current !== page || (typeof paging.total === "number" && paging.total < page))) return { rows: [], failure: "malformed" }
  const params = object(body.parameters)
  if (params && ((params.league != null && Number(params.league) !== leagueId) || (params.season != null && Number(params.season) !== SEASON) || (params.page != null && Number(params.page) !== page))) return { rows: [], failure: "malformed" }
  return { rows: body.response as Row[], ...(body.response.length ? {} : { failure: "empty" as const }) }
}

export type Profile = {
  externalRef: { provider: "api-football"; externalId: string }
  providerName: string | null; firstName: string | null; lastName: string | null
  birthDate: string | null; birthPlace: string | null; birthCountry: string | null
  nationality: string | null; height: string | null; weight: string | null; photo: string | null
  position: string | null; number: number | null; providerDerivedAge: number | null
}
export type Evidence = {
  playerExternalRef: Profile["externalRef"]
  teamExternalRef: Profile["externalRef"]
  leagueExternalRef: Profile["externalRef"]
  season: number; position: string | null; appearances: number | null; lineups: number | null
  minutes: number | null; bench: number | null; shirtNumber: number | null
  evidenceType: "provider-league-season-statistics"
}

function profileFromPlayer(player: Row): Profile {
  const birth = object(player.birth)
  return { externalRef: { provider: "api-football", externalId: String(player.id) },
    providerName: text(player.name), firstName: text(player.firstname), lastName: text(player.lastname),
    birthDate: birthDate(birth?.date), birthPlace: text(birth?.place), birthCountry: text(birth?.country),
    nationality: text(player.nationality), height: text(player.height), weight: text(player.weight), photo: text(player.photo),
    position: text(player.position), number: nonnegative(player.number), providerDerivedAge: possibleAge(player.age) }
}

export function parseProfileReply(reply: Reply, requestedId: string): { player: Row | null; failure?: PageFailure } {
  const body = object(reply.body)
  const message = JSON.stringify(body?.errors ?? {}).toLowerCase()
  if (reply.httpStatus === 401 || /api.?key|token|authentication|unauthorized/.test(message)) return { player: null, failure: "authentication" }
  if (reply.httpStatus === 429 || /quota|rate.limit|request.limit|too many requests/.test(message)) return { player: null, failure: "quota" }
  if (reply.httpStatus === 403 || /subscription|coverage|not covered|plan|season.*available/.test(message)) return { player: null, failure: "coverage" }
  if (reply.httpStatus >= 400 || (body?.errors && JSON.stringify(body.errors) !== "[]" && JSON.stringify(body.errors) !== "{}")) return { player: null, failure: "http" }
  if (!body || !Array.isArray(body.response)) return { player: null, failure: "malformed" }
  if (!body.response.length) return { player: null, failure: "empty" }
  if (body.response.length !== 1) return { player: null, failure: "malformed" }
  const entry = object(body.response[0])
  const player = object(entry?.player) ?? entry
  if (!player || !positiveId(player.id) || String(player.id) !== requestedId) return { player: null, failure: "malformed" }
  if (typeof player.gender === "string" && /^(female|women|f)$/i.test(player.gender)) return { player: null, failure: "malformed" }
  return { player }
}

export function buildEnrichment(activeIds: ReadonlySet<string>, pages: { leagueId: number; page: number; rows: Row[] }[]) {
  const profiles = new Map<string, Profile>()
  const evidence = new Map<string, Evidence>()
  let ignoredProviderRows = 0, malformedRecords = 0, invalidAges = 0
  for (const { rows } of pages) for (const row of rows) {
    const player = object(row.player)
    if (!player || !positiveId(player.id)) { malformedRecords++; continue }
    const externalId = String(player.id)
    if (!activeIds.has(externalId)) { ignoredProviderRows++; continue }
    if (typeof player.gender === "string" && /^(female|women|f)$/i.test(player.gender)) { malformedRecords++; continue }
    const age = possibleAge(player.age)
    if (player.age != null && age === null) { invalidAges++; malformedRecords++ }
    const birth = object(player.birth)
    const dob = birthDate(birth?.date)
    if (birth?.date != null && dob === null) malformedRecords++
    const externalRef = { provider: "api-football" as const, externalId }
    if (!profiles.has(externalId)) profiles.set(externalId, profileFromPlayer(player))
    if (row.statistics != null && !Array.isArray(row.statistics)) { malformedRecords++; continue }
    for (const statistic of (row.statistics ?? []) as unknown[]) {
      const item = object(statistic), team = object(item?.team), league = object(item?.league), games = object(item?.games), substitutes = object(item?.substitutes)
      if (!item || !team || !league || !positiveId(team.id) || !positiveId(league.id) || league.season !== SEASON) {
        malformedRecords++; continue
      }
      const key = `${externalId}:${team.id}:${league.id}:${SEASON}`
      if (evidence.has(key)) continue
      evidence.set(key, { playerExternalRef: externalRef, teamExternalRef: { provider: "api-football", externalId: String(team.id) },
        leagueExternalRef: { provider: "api-football", externalId: String(league.id) }, season: SEASON,
        position: text(games?.position), appearances: nonnegative(games?.appearences ?? games?.appearances),
        lineups: nonnegative(games?.lineups), minutes: nonnegative(games?.minutes), bench: nonnegative(substitutes?.bench),
        shirtNumber: nonnegative(games?.number), evidenceType: "provider-league-season-statistics" })
    }
  }
  const sortId = (a: string, b: string) => Number(a) - Number(b)
  return { profiles: [...profiles.values()].sort((a, b) => sortId(a.externalRef.externalId, b.externalRef.externalId)),
    evidence: [...evidence.values()].sort((a,b) => sortId(a.playerExternalRef.externalId,b.playerExternalRef.externalId) || sortId(a.leagueExternalRef.externalId,b.leagueExternalRef.externalId) || sortId(a.teamExternalRef.externalId,b.teamExternalRef.externalId)),
    ignoredProviderRows, malformedRecords, invalidAges }
}

export async function enrichActiveTop5(directory: string, requester: Requester, maxLiveRequests = 75, delayMs = 300) {
  if (!Number.isInteger(maxLiveRequests) || maxLiveRequests < 0 || maxLiveRequests > 75) throw new Error("maxLiveRequests must be an integer from 0 to 75")
  if (!Number.isFinite(delayMs) || delayMs < 250) throw new Error("delayMs must keep requests at or below 4 per second")
  const input = JSON.parse(readFileSync(join(directory, "players.json"), "utf8")) as unknown
  if (!Array.isArray(input) || !input.length) throw new Error("Active squad whitelist is missing or empty")
  const ids = new Set<string>()
  const squadById = new Map<string, Row>()
  for (const row of input) {
    const ref = object(object(row)?.externalRef)
    if (ref?.provider !== "api-football" || typeof ref.externalId !== "string" || !/^\d+$/.test(ref.externalId)) throw new Error("Invalid active squad whitelist")
    ids.add(ref.externalId)
    squadById.set(ref.externalId, object(row)!)
  }
  const cacheDir = join(directory, "raw", "player-pages")
  mkdirSync(cacheDir, { recursive: true })
  const pages: { leagueId: number; page: number; rows: Row[] }[] = []
  const errors: { leagueId: number; page: number; type: PageFailure }[] = []
  let liveRequests = 0, cachedPages = 0, stopReason: "budget" | "authentication" | "quota" | null = null
  let lastRequestAt = 0
  for (const league of LEAGUES) for (let page = 1; page <= PAGES[league.id]; page++) {
    const file = join(cacheDir, `${league.id}-${SEASON}-${page}.json`)
    let reply: Reply
    if (existsSync(file)) {
      try { reply = { httpStatus: 200, body: JSON.parse(readFileSync(file, "utf8")) } }
      catch { errors.push({ leagueId: league.id, page, type: "malformed" }); continue }
      const parsed = parsePage(reply, league.id, page)
      if (parsed.failure && parsed.failure !== "empty") { errors.push({ leagueId: league.id, page, type: "malformed" }); continue }
      cachedPages++
      pages.push({ leagueId: league.id, page, rows: parsed.rows })
      continue
    }
    if (stopReason) continue
    if (liveRequests >= maxLiveRequests) { stopReason = "budget"; continue }
    const waitMs = delayMs - (Date.now() - lastRequestAt)
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
    liveRequests++; lastRequestAt = Date.now()
    try { reply = await requester(`players?league=${league.id}&season=${SEASON}&page=${page}`) }
    catch { errors.push({ leagueId: league.id, page, type: "network" }); continue }
    const parsed = parsePage(reply, league.id, page)
    if (parsed.failure && parsed.failure !== "empty") {
      errors.push({ leagueId: league.id, page, type: parsed.failure })
      if (parsed.failure === "authentication" || parsed.failure === "quota") stopReason = parsed.failure
      continue
    }
    // Preserve the provider JSON body before any projection. Empty 200 pages are valid.
    writeFileSync(file, JSON.stringify(reply.body) + "\n", { flag: "wx" })
    cachedPages++
    pages.push({ leagueId: league.id, page, rows: parsed.rows })
  }
  const result = buildEnrichment(ids, pages)
  const enrichedFromLeagueSeason = result.profiles.length
  const profileById = new Map(result.profiles.map(profile => [profile.externalRef.externalId, profile]))
  const totalPages = Object.values(PAGES).reduce((a,b) => a+b,0)
  const coverageComplete = cachedPages === totalPages
  const fallbackErrors: { playerId: string; type: PageFailure }[] = []
  let fallbackRequests = 0, fallbackCacheHits = 0, enrichedFromProfilesFallback = 0
  if (coverageComplete) {
    const profileCacheDir = join(directory, "raw", "player-profiles")
    mkdirSync(profileCacheDir, { recursive: true })
    for (const id of [...ids].filter(id => !profileById.has(id)).sort((a,b) => Number(a)-Number(b))) {
      const file = join(profileCacheDir, `${id}.json`)
      let reply: Reply
      if (existsSync(file)) {
        fallbackCacheHits++
        try { reply = { httpStatus: 200, body: JSON.parse(readFileSync(file, "utf8")) } }
        catch { fallbackErrors.push({ playerId: id, type: "malformed" }); continue }
      } else {
        if (stopReason) continue
        if (liveRequests >= maxLiveRequests) { stopReason = "budget"; continue }
        const waitMs = delayMs - (Date.now() - lastRequestAt)
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
        liveRequests++; fallbackRequests++; lastRequestAt = Date.now()
        try { reply = await requester(`players/profiles?player=${id}`) }
        catch { fallbackErrors.push({ playerId: id, type: "network" }); continue }
      }
      const parsed = parseProfileReply(reply, id)
      if (parsed.failure && parsed.failure !== "empty") {
        fallbackErrors.push({ playerId: id, type: parsed.failure })
        if (parsed.failure === "authentication" || parsed.failure === "quota") stopReason = parsed.failure
        continue
      }
      if (!existsSync(file)) writeFileSync(file, JSON.stringify(reply.body) + "\n", { flag: "wx" })
      if (!parsed.player) { fallbackErrors.push({ playerId: id, type: "empty" }); continue }
      if (parsed.player.age != null && possibleAge(parsed.player.age) === null) { result.invalidAges++; result.malformedRecords++ }
      const birth = object(parsed.player.birth)
      if (birth?.date != null && birthDate(birth.date) === null) result.malformedRecords++
      profileById.set(id, profileFromPlayer(parsed.player))
      enrichedFromProfilesFallback++
    }
  }
  const profiles = [...profileById.values()].map(profile => {
    const squad = squadById.get(profile.externalRef.externalId)
    return { ...profile, position: profile.position ?? text(squad?.position), number: profile.number ?? nonnegative(squad?.number) }
  }).sort((a,b) => Number(a.externalRef.externalId)-Number(b.externalRef.externalId))
  const completeness = Object.fromEntries(["providerName", "firstName", "lastName", "birthDate", "birthPlace", "birthCountry", "nationality", "height", "weight", "photo", "position", "number", "providerDerivedAge"].map(field => [field, profiles.filter(profile => profile[field as keyof Profile] != null).length]))
  const summary = { season: SEASON, totalActiveSquadPlayers: ids.size, enrichedActivePlayers: profiles.length,
    enrichedFromLeagueSeason, enrichedFromProfilesFallback, activePlayersStillMissingProfile: ids.size - profiles.length,
    fallbackRequests, fallbackCacheHits, fallbackErrors,
    activePlayersNotFoundInPlayers: ids.size - enrichedFromLeagueSeason, ignoredProviderPlayerRows: result.ignoredProviderRows,
    pagesCached: cachedPages, totalPages, remainingPages: totalPages - cachedPages,
    liveRequests, stopReason, coverageComplete,
    errors, malformedRecords: result.malformedRecords, invalidAges: result.invalidAges,
    profileFieldCompleteness: completeness, seasonEvidenceRecords: result.evidence.length,
    note: "League-season absence is meaningful only after all pages are cached. Profiles fallback adds identity data only; season evidence remains from /players." }
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")
  write("player-profiles.json", profiles)
  write("player-season-evidence.json", result.evidence)
  write("enrichment-summary.json", summary)
  return summary
}
