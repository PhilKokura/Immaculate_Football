import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Reply, Requester } from "./active-top5"

type RecordValue = Record<string, unknown>
const object = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0
const externalRef = (id: string) => ({ provider: "api-football" as const, externalId: id })

export type HistoryFailure = "authentication" | "quota" | "coverage" | "http" | "malformed" | "network" | "empty"
export function parseHistoryReply(reply: Reply, requestedId: string): { rows: RecordValue[]; failure?: HistoryFailure } {
  const body = object(reply.body)
  const message = JSON.stringify(body?.errors ?? {}).toLowerCase()
  if (reply.httpStatus === 401 || /api.?key|token|authentication|unauthorized/.test(message)) return { rows: [], failure: "authentication" }
  if (reply.httpStatus === 429 || /quota|rate.limit|request.limit|too many requests/.test(message)) return { rows: [], failure: "quota" }
  if (reply.httpStatus === 403 || /subscription|coverage|not covered|plan|season.*available/.test(message)) return { rows: [], failure: "coverage" }
  if (reply.httpStatus >= 400 || (body?.errors && JSON.stringify(body.errors) !== "[]" && JSON.stringify(body.errors) !== "{}")) return { rows: [], failure: "http" }
  if (!body || !Array.isArray(body.response) || !body.response.every(row => object(row))) return { rows: [], failure: "malformed" }
  const parameters = object(body.parameters)
  if (parameters?.player != null && String(parameters.player) !== requestedId) return { rows: [], failure: "malformed" }
  return { rows: body.response as RecordValue[], ...(body.response.length ? {} : { failure: "empty" as const }) }
}

export function buildCareerHistory(responses: Map<string, RecordValue[]>) {
  const associations: {
    playerExternalRef: ReturnType<typeof externalRef>; teamExternalRef: ReturnType<typeof externalRef>
    providerTeamName: string | null; providerTeamLogo: string | null; seasons: unknown[]
    evidenceType: "api-football-player-teams"
  }[] = []
  const teams = new Map<string, { externalRef: ReturnType<typeof externalRef>; providerTeamName: string | null; providerTeamLogo: string | null }>()
  const malformed: { playerId: string; row: number }[] = []
  let emptySeasonAssociations = 0
  for (const [playerId, rows] of responses) for (const [index, row] of rows.entries()) {
    const team = object(row.team)
    if (!team || !positiveId(team.id) || !Array.isArray(row.seasons)) {
      malformed.push({ playerId, row: index }); continue
    }
    const teamId = String(team.id)
    const providerTeamName = typeof team.name === "string" ? team.name : null
    const providerTeamLogo = typeof team.logo === "string" ? team.logo : null
    // Association is provider evidence only. Seasons are copied without sorting, coercion, or appearance inference.
    associations.push({ playerExternalRef: externalRef(playerId), teamExternalRef: externalRef(teamId),
      providerTeamName, providerTeamLogo, seasons: row.seasons, evidenceType: "api-football-player-teams" })
    if (row.seasons.length === 0) emptySeasonAssociations++
    if (!teams.has(teamId)) teams.set(teamId, { externalRef: externalRef(teamId), providerTeamName, providerTeamLogo })
  }
  associations.sort((a,b) => Number(a.playerExternalRef.externalId)-Number(b.playerExternalRef.externalId) || Number(a.teamExternalRef.externalId)-Number(b.teamExternalRef.externalId))
  return { associations, teams: [...teams.values()].sort((a,b) => Number(a.externalRef.externalId)-Number(b.externalRef.externalId)),
    emptySeasonAssociations, malformed }
}

export async function importCareerHistory(directory: string, requester: Requester, maxLiveRequests = 500, delayMs = 300) {
  if (!Number.isInteger(maxLiveRequests) || maxLiveRequests < 0 || maxLiveRequests > 500) throw new Error("maxLiveRequests must be an integer from 0 to 500")
  if (!Number.isFinite(delayMs) || delayMs < 250) throw new Error("delayMs must keep requests at or below 4 per second")
  const input = JSON.parse(readFileSync(join(directory, "players.json"), "utf8")) as unknown
  if (!Array.isArray(input) || !input.length) throw new Error("Active squad whitelist is missing or empty")
  const ids = new Set<string>()
  for (const row of input) {
    const ref = object(object(row)?.externalRef)
    if (ref?.provider !== "api-football" || typeof ref.externalId !== "string" || !/^[1-9]\d*$/.test(ref.externalId) || !Number.isSafeInteger(Number(ref.externalId))) throw new Error("Invalid active squad whitelist")
    ids.add(ref.externalId)
  }
  const cacheDir = join(directory, "raw", "player-team-history")
  mkdirSync(cacheDir, { recursive: true })
  const responses = new Map<string, RecordValue[]>()
  const errors: { playerId: string; type: HistoryFailure }[] = []
  let liveRequests = 0, cacheHits = 0, lastRequestAt = 0
  let stopReason: "budget" | "authentication" | "quota" | null = null
  for (const id of [...ids].sort((a,b) => Number(a)-Number(b))) {
    const file = join(cacheDir, `${id}.json`)
    let reply: Reply
    if (existsSync(file)) {
      try { reply = { httpStatus: 200, body: JSON.parse(readFileSync(file, "utf8")) } }
      catch { errors.push({ playerId: id, type: "malformed" }); continue }
      const parsed = parseHistoryReply(reply, id)
      if (parsed.failure && parsed.failure !== "empty") { errors.push({ playerId: id, type: "malformed" }); continue }
      cacheHits++
      responses.set(id, parsed.rows)
      continue
    }
    if (stopReason) continue
    if (liveRequests >= maxLiveRequests) { stopReason = "budget"; continue }
    const waitMs = delayMs - (Date.now() - lastRequestAt)
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
    liveRequests++; lastRequestAt = Date.now()
    try { reply = await requester(`players/teams?player=${id}`) }
    catch { errors.push({ playerId: id, type: "network" }); continue }
    const parsed = parseHistoryReply(reply, id)
    if (parsed.failure && parsed.failure !== "empty") {
      errors.push({ playerId: id, type: parsed.failure })
      if (parsed.failure === "authentication" || parsed.failure === "quota") stopReason = parsed.failure
      continue
    }
    writeFileSync(file, JSON.stringify(reply.body) + "\n", { flag: "wx" })
    responses.set(id, parsed.rows)
  }
  const history = buildCareerHistory(responses)
  const summary = { totalWhitelistPlayers: ids.size, playersWithCachedHistory: responses.size,
    playersStillMissingHistory: ids.size - responses.size, totalTeamAssociations: history.associations.length,
    uniqueTeams: history.teams.length, associationsWithEmptySeasonArrays: history.emptySeasonAssociations,
    liveRequests, cacheHits, errors, malformedAssociations: history.malformed,
    stopReason, complete: responses.size === ids.size,
    note: "players/teams records are team associations, not proof of competitive appearances." }
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")
  write("player-team-history.json", history.associations)
  write("career-teams.json", history.teams)
  write("career-history-summary.json", summary)
  return summary
}
