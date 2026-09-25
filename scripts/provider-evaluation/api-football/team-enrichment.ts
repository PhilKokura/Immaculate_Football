import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Reply, Requester } from "./active-top5"

type RecordValue = Record<string, unknown>

const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null

const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const optionalText = (value: unknown) => typeof value === "string" ? value : null
const optionalNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const externalRef = (id: string) => ({ provider: "api-football" as const, externalId: id })

export type TeamEnrichmentFailure =
  | "authentication"
  | "quota"
  | "coverage"
  | "http"
  | "malformed"
  | "network"
  | "empty"

export function parseTeamReply(
  reply: Reply,
  requestedId: string,
): { rows: RecordValue[]; failure?: TeamEnrichmentFailure } {
  const body = object(reply.body)
  const message = JSON.stringify(body?.errors ?? {}).toLowerCase()

  if (reply.httpStatus === 401 || /api.?key|token|authentication|unauthorized/.test(message)) {
    return { rows: [], failure: "authentication" }
  }
  if (reply.httpStatus === 429 || /quota|rate.limit|request.limit|too many requests/.test(message)) {
    return { rows: [], failure: "quota" }
  }
  if (reply.httpStatus === 403 || /subscription|coverage|not covered|plan/.test(message)) {
    return { rows: [], failure: "coverage" }
  }
  if (
    reply.httpStatus >= 400 ||
    (body?.errors && JSON.stringify(body.errors) !== "[]" && JSON.stringify(body.errors) !== "{}")
  ) {
    return { rows: [], failure: "http" }
  }
  if (!body || !Array.isArray(body.response) || !body.response.every(row => object(row))) {
    return { rows: [], failure: "malformed" }
  }
  if (!body.response.length) return { rows: [], failure: "empty" }

  const parameters = object(body.parameters)
  if (parameters?.id != null && String(parameters.id) !== requestedId) {
    return { rows: [], failure: "malformed" }
  }

  return { rows: body.response as RecordValue[] }
}

export function buildTeamProfiles(responses: Map<string, RecordValue[]>) {
  const profiles: {
    externalRef: ReturnType<typeof externalRef>
    providerName: string | null
    code: string | null
    country: string | null
    founded: number | null
    national: boolean | null
    broadType: "club" | "national-team" | "unknown"
    logo: string | null
    venue: {
      externalRef: ReturnType<typeof externalRef> | null
      name: string | null
      address: string | null
      city: string | null
      capacity: number | null
      surface: string | null
      image: string | null
    } | null
  }[] = []

  const malformed: { teamId: string; row: number; reason: string }[] = []

  for (const [requestedId, rows] of responses) {
    const matchingRows = rows.filter(row => String(object(row.team)?.id ?? "") === requestedId)
    if (matchingRows.length !== 1) {
      malformed.push({ teamId: requestedId, row: -1, reason: `expected exactly one matching team row, got ${matchingRows.length}` })
      continue
    }

    const row = matchingRows[0]
    const team = object(row.team)
    if (!team || !positiveId(team.id)) {
      malformed.push({ teamId: requestedId, row: 0, reason: "missing or invalid team" })
      continue
    }

    const national = typeof team.national === "boolean" ? team.national : null
    const broadType = national === true ? "national-team" as const : national === false ? "club" as const : "unknown" as const
    const venueRaw = object(row.venue)

    const venue = venueRaw ? {
      externalRef: positiveId(venueRaw.id) ? externalRef(String(venueRaw.id)) : null,
      name: optionalText(venueRaw.name),
      address: optionalText(venueRaw.address),
      city: optionalText(venueRaw.city),
      capacity: optionalNumber(venueRaw.capacity),
      surface: optionalText(venueRaw.surface),
      image: optionalText(venueRaw.image),
    } : null

    profiles.push({
      externalRef: externalRef(requestedId),
      providerName: optionalText(team.name),
      code: optionalText(team.code),
      country: optionalText(team.country),
      founded: optionalNumber(team.founded),
      national,
      broadType,
      logo: optionalText(team.logo),
      venue,
    })
  }

  profiles.sort((a, b) => Number(a.externalRef.externalId) - Number(b.externalRef.externalId))
  return { profiles, malformed }
}

export async function importTeamEnrichment(
  directory: string,
  requester: Requester,
  maxLiveRequests = 500,
  delayMs = 300,
) {
  if (!Number.isInteger(maxLiveRequests) || maxLiveRequests < 0 || maxLiveRequests > 500) {
    throw new Error("maxLiveRequests must be an integer from 0 to 500")
  }
  if (!Number.isFinite(delayMs) || delayMs < 250) {
    throw new Error("delayMs must keep requests at or below 4 per second")
  }

  const input = JSON.parse(readFileSync(join(directory, "career-teams.json"), "utf8")) as unknown
  if (!Array.isArray(input) || !input.length) throw new Error("career-teams.json is missing or empty")

  const ids = new Set<string>()
  for (const row of input) {
    const ref = object(object(row)?.externalRef)
    if (
      ref?.provider !== "api-football" ||
      typeof ref.externalId !== "string" ||
      !/^[1-9]\d*$/.test(ref.externalId) ||
      !Number.isSafeInteger(Number(ref.externalId))
    ) {
      throw new Error("Invalid career team whitelist")
    }
    ids.add(ref.externalId)
  }

  const cacheDir = join(directory, "raw", "team-profiles")
  mkdirSync(cacheDir, { recursive: true })

  const responses = new Map<string, RecordValue[]>()
  const errors: { teamId: string; type: TeamEnrichmentFailure }[] = []
  let liveRequests = 0
  let cacheHits = 0
  let lastRequestAt = 0
  let stopReason: "budget" | "authentication" | "quota" | null = null

  for (const id of [...ids].sort((a, b) => Number(a) - Number(b))) {
    const file = join(cacheDir, `${id}.json`)
    let reply: Reply

    if (existsSync(file)) {
      try {
        reply = { httpStatus: 200, body: JSON.parse(readFileSync(file, "utf8")) }
      } catch {
        errors.push({ teamId: id, type: "malformed" })
        continue
      }

      const parsed = parseTeamReply(reply, id)
      if (parsed.failure && parsed.failure !== "empty") {
        errors.push({ teamId: id, type: "malformed" })
        continue
      }

      cacheHits++
      responses.set(id, parsed.rows)
      continue
    }

    if (stopReason) continue
    if (liveRequests >= maxLiveRequests) {
      stopReason = "budget"
      continue
    }

    const waitMs = delayMs - (Date.now() - lastRequestAt)
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))

    liveRequests++
    lastRequestAt = Date.now()

    try {
      reply = await requester(`teams?id=${id}`)
    } catch {
      errors.push({ teamId: id, type: "network" })
      continue
    }

    const parsed = parseTeamReply(reply, id)
    if (parsed.failure && parsed.failure !== "empty") {
      errors.push({ teamId: id, type: parsed.failure })
      if (parsed.failure === "authentication" || parsed.failure === "quota") stopReason = parsed.failure
      continue
    }

    writeFileSync(file, JSON.stringify(reply.body) + "\n", { flag: "wx" })
    responses.set(id, parsed.rows)
  }

  const built = buildTeamProfiles(responses)
  const nationalTeams = built.profiles.filter(team => team.broadType === "national-team").length
  const clubs = built.profiles.filter(team => team.broadType === "club").length
  const unknownBroadType = built.profiles.filter(team => team.broadType === "unknown").length

  const summary = {
    totalCareerTeams: ids.size,
    enrichedTeams: built.profiles.length,
    teamsStillMissing: ids.size - responses.size,
    nationalTeams,
    clubs,
    unknownBroadType,
    liveRequests,
    cacheHits,
    errors,
    malformedRecords: built.malformed,
    stopReason,
    complete: responses.size === ids.size,
    note: "broadType uses only API-Football's team.national flag. Senior/reserve/youth classification is intentionally deferred.",
  }

  const write = (name: string, value: unknown) =>
    writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n")

  write("career-team-profiles.json", built.profiles)
  write("team-enrichment-summary.json", summary)

  return summary
}
