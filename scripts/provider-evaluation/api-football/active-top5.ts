import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const SEASON = 2026
export const LEAGUES = [
  { id: 39, name: "Premier League" }, { id: 78, name: "Bundesliga" },
  { id: 140, name: "La Liga" }, { id: 135, name: "Serie A" }, { id: 61, name: "Ligue 1" },
] as const
export type Reply = { httpStatus: number; body: unknown }
export type Requester = (path: string) => Promise<Reply>
type Data = Record<string, unknown>
const obj = (x: unknown): Data | null => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Data : null
const id = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0
const optionalText = (x: unknown) => typeof x === "string" ? x : null
const female = (x: unknown) => typeof x === "string" && /^(female|women|f)$/i.test(x)

export type Failure = "authentication-error" | "quota-rate-limit" | "subscription-coverage" | "empty-response" | "malformed-response" | "http-error" | "network-error"
export function parseReply(reply: Reply): { rows: Data[]; failure?: Failure } {
  const body = obj(reply.body)
  const error = JSON.stringify(body?.errors ?? {}).toLowerCase()
  if (reply.httpStatus === 401 || /api.?key|token|authentication|unauthorized/.test(error)) return { rows: [], failure: "authentication-error" }
  if (reply.httpStatus === 429 || /quota|rate.limit|request.limit|too many requests/.test(error)) return { rows: [], failure: "quota-rate-limit" }
  if (reply.httpStatus === 403 || /subscription|coverage|not covered|plan|season.*available/.test(error)) return { rows: [], failure: "subscription-coverage" }
  if (reply.httpStatus >= 400 || (body?.errors && JSON.stringify(body.errors) !== "[]" && JSON.stringify(body.errors) !== "{}")) return { rows: [], failure: "http-error" }
  if (!Array.isArray(body?.response) || !body.response.every(x => obj(x))) return { rows: [], failure: "malformed-response" }
  if (!body.response.length) return { rows: [], failure: "empty-response" }
  return { rows: body.response as Data[] }
}

export function buildCatalog(leagueResponses: Map<number, Data[]>, squadResponses: Map<number, Data[]>) {
  const teamById = new Map<number, { externalRef: { provider: "api-football"; externalId: string }; name: string; leagueId: number; leagueName: string; season: number; country: string | null; logo: string | null; teamType: "senior-club" }>()
  const issues: string[] = []
  for (const league of LEAGUES) for (const row of leagueResponses.get(league.id) ?? []) {
    const team = obj(row.team)
    if (!team || !id(team.id) || typeof team.name !== "string") { issues.push(`Malformed team in league ${league.id}`); continue }
    if (team.national === true || female(team.gender)) continue
    if (teamById.has(team.id)) { issues.push(`Team ${team.id} appears in multiple target league lists; retained first league`); continue }
    teamById.set(team.id, { externalRef: { provider: "api-football", externalId: String(team.id) }, name: team.name,
      leagueId: league.id, leagueName: league.name, season: SEASON, country: optionalText(team.country), logo: optionalText(team.logo), teamType: "senior-club" })
  }
  const players = new Map<number, { externalRef: { provider: "api-football"; externalId: string }; name: string; age: number | null; number: number | null; position: string | null; photo: string | null }>()
  const memberships = new Map<string, { playerExternalRef: { provider: "api-football"; externalId: string }; teamExternalRef: { provider: "api-football"; externalId: string }; evidenceType: "current-squad-snapshot"; seasonContext: 2026 }>()
  const completedSquads = new Set<number>()
  for (const [teamId, rows] of squadResponses) {
    if (!teamById.has(teamId)) continue
    const matching = rows.filter(r => obj(r.team)?.id === teamId)
    if (matching.length !== 1 || !Array.isArray(matching[0].players) || !matching[0].players.every(p => obj(p) && id(obj(p)?.id) && typeof obj(p)?.name === "string")) {
      issues.push(`Malformed or mismatched squad for team ${teamId}`); continue
    }
    completedSquads.add(teamId)
    for (const raw of matching[0].players as Data[]) {
      const playerId = raw.id as number
      if (female(raw.gender)) continue
      const player = { externalRef: { provider: "api-football" as const, externalId: String(playerId) }, name: raw.name as string,
        age: typeof raw.age === "number" ? raw.age : null, number: typeof raw.number === "number" ? raw.number : null,
        position: optionalText(raw.position), photo: optionalText(raw.photo) }
      if (!players.has(playerId)) players.set(playerId, player)
      memberships.set(`${playerId}:${teamId}`, { playerExternalRef: player.externalRef, teamExternalRef: teamById.get(teamId)!.externalRef,
        evidenceType: "current-squad-snapshot", seasonContext: SEASON })
    }
  }
  const teams = [...teamById.values()].sort((a,b) => Number(a.externalRef.externalId)-Number(b.externalRef.externalId))
  return { teams, players: [...players.values()].sort((a,b) => Number(a.externalRef.externalId)-Number(b.externalRef.externalId)),
    memberships: [...memberships.values()].sort((a,b) => Number(a.teamExternalRef.externalId)-Number(b.teamExternalRef.externalId) || Number(a.playerExternalRef.externalId)-Number(b.playerExternalRef.externalId)),
    completedSquads, issues }
}

export async function importTop5(directory: string, requester: Requester, maxLiveRequests = 75) {
  if (!Number.isInteger(maxLiveRequests) || maxLiveRequests < 0 || maxLiveRequests > 75) throw new Error("maxLiveRequests must be an integer from 0 to 75")
  const rawDir = join(directory, "raw")
  mkdirSync(join(rawDir, "leagues"), { recursive: true })
  mkdirSync(join(rawDir, "squads"), { recursive: true })
  let liveRequests = 0, cacheHits = 0
  let stopReason: "budget" | "authentication-error" | "quota-rate-limit" | null = null
  const errors: { endpoint: string; type: Failure }[] = []
  const load = async (path: string, cacheFile: string): Promise<Data[] | null> => {
    if (existsSync(cacheFile)) {
      // Cache contains the exact successful provider envelope, not normalized data.
      const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as Reply
      const parsed = parseReply(cached)
      if (!parsed.failure || parsed.failure === "empty-response") { cacheHits++; return parsed.rows }
      errors.push({ endpoint: path, type: "malformed-response" }); return null
    }
    if (stopReason) return null
    if (liveRequests >= maxLiveRequests) { stopReason = "budget"; return null }
    liveRequests++
    let reply: Reply
    try { reply = await requester(path) } catch { errors.push({ endpoint: path, type: "network-error" }); return null }
    const parsed = parseReply(reply)
    if (parsed.failure && parsed.failure !== "empty-response") {
      errors.push({ endpoint: path, type: parsed.failure })
      if (parsed.failure === "authentication-error" || parsed.failure === "quota-rate-limit") stopReason = parsed.failure
      return null
    }
    writeFileSync(cacheFile, JSON.stringify(reply) + "\n", { flag: "wx" })
    if (parsed.failure === "empty-response") errors.push({ endpoint: path, type: "empty-response" })
    return parsed.rows
  }
  const leagues = new Map<number, Data[]>()
  for (const league of LEAGUES) {
    const rows = await load(`teams?league=${league.id}&season=${SEASON}`, join(rawDir, "leagues", `${league.id}-${SEASON}.json`))
    if (rows !== null) leagues.set(league.id, rows)
  }
  const preliminary = buildCatalog(leagues, new Map())
  const squads = new Map<number, Data[]>()
  for (const team of preliminary.teams) {
    const teamId = Number(team.externalRef.externalId)
    const rows = await load(`players/squads?team=${teamId}`, join(rawDir, "squads", `${teamId}.json`))
    if (rows !== null) squads.set(teamId, rows)
  }
  const catalog = buildCatalog(leagues, squads)
  const summary = { season: SEASON, targetLeagues: LEAGUES, loadedLeagues: leagues.size, teamsLoaded: catalog.teams.length,
    squadsCached: catalog.completedSquads.size, uniquePlayers: catalog.players.length, memberships: catalog.memberships.length,
    liveRequests, cacheHits, remainingSquads: leagues.size === LEAGUES.length ? catalog.teams.length - catalog.completedSquads.size : null,
    remainingLeagues: LEAGUES.length - leagues.size, partial: leagues.size < LEAGUES.length || catalog.completedSquads.size < catalog.teams.length,
    stopReason, errors, issues: catalog.issues }
  const write = (name: string, data: unknown) => writeFileSync(join(directory, name), JSON.stringify(data, null, 2) + "\n")
  write("teams.json", catalog.teams)
  write("players.json", catalog.players)
  write("player-team-memberships.json", catalog.memberships)
  write("import-summary.json", summary)
  return summary
}
