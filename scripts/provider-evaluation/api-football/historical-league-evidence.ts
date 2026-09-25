import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import type { Reply, Requester } from "./active-top5"

type Row = Record<string, unknown>

export const HISTORICAL_TARGET_LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 78, name: "Bundesliga" },
  { id: 140, name: "La Liga" },
  { id: 135, name: "Serie A" },
  { id: 61, name: "Ligue 1" },
] as const

export const MAX_GAME_SEASON = 2026

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type Failure =
  | "authentication"
  | "quota"
  | "coverage"
  | "http"
  | "malformed"
  | "network"

type LeagueCatalog = {
  leagueId: number
  leagueName: string
  supportedPlayerSeasons: number[]
}

type PlayerPage = {
  rows: Row[]
  currentPage: number
  totalPages: number
}

export type LeagueSeasonEvidence = {
  playerExternalRef: ExternalRef
  leagueExternalRef: ExternalRef
  leagueName: string
  season: number
  teamExternalRef: ExternalRef
  providerTeamName: string | null
  appearances: number | null
  lineups: number | null
  minutes: number | null
  evidenceType: "provider-league-season-statistics"
  eligibilityEvidence: "appearance-confirmed"
}

type LeagueHistory = {
  playerExternalRef: ExternalRef
  leagueExternalRef: ExternalRef
  leagueName: string
  seasons: number[]
  teamExternalIds: string[]
  evidenceType: "provider-league-season-statistics"
  eligibilityEvidence: "appearance-confirmed"
}

const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null

const positiveId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0

const nonnegativeInteger = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0
    ? value
    : null

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim()
    ? value.trim()
    : null

const externalRef = (id: string): ExternalRef => ({
  provider: "api-football",
  externalId: id,
})

function hasProviderErrors(body: Row | null) {
  if (!body?.errors) return false
  const serialized = JSON.stringify(body.errors)
  return serialized !== "[]" && serialized !== "{}"
}

function classifyFailure(reply: Reply): Failure | null {
  const body = object(reply.body)
  const message = JSON.stringify(body?.errors ?? {}).toLowerCase()

  if (
    reply.httpStatus === 401 ||
    /api.?key|token|authentication|unauthorized/.test(message)
  ) {
    return "authentication"
  }

  if (
    reply.httpStatus === 429 ||
    /quota|rate.limit|request.limit|too many requests/.test(message)
  ) {
    return "quota"
  }

  if (
    reply.httpStatus === 403 ||
    /subscription|coverage|not covered|plan|season.*available/.test(message)
  ) {
    return "coverage"
  }

  if (reply.httpStatus >= 400 || hasProviderErrors(body)) {
    return "http"
  }

  return null
}

export function parseLeagueCatalog(
  reply: Reply,
  requestedLeagueId: number,
  requestedLeagueName: string,
): { catalog: LeagueCatalog | null; failure?: Failure } {
  const failure = classifyFailure(reply)
  if (failure) return { catalog: null, failure }

  const body = object(reply.body)
  if (!body || !Array.isArray(body.response)) {
    return { catalog: null, failure: "malformed" }
  }

  const matching = body.response
    .map(object)
    .filter((row): row is Row => row !== null)
    .filter(row => object(row.league)?.id === requestedLeagueId)

  if (matching.length !== 1) {
    return { catalog: null, failure: "malformed" }
  }

  const row = matching[0]
  if (!Array.isArray(row.seasons)) {
    return { catalog: null, failure: "malformed" }
  }

  const seasons: number[] = []

  for (const rawSeason of row.seasons) {
    const season = object(rawSeason)
    if (!season || !Number.isInteger(season.year)) continue

    const coverage = object(season.coverage)
    if (coverage?.players === true) {
      seasons.push(season.year as number)
    }
  }

  return {
    catalog: {
      leagueId: requestedLeagueId,
      leagueName: requestedLeagueName,
      supportedPlayerSeasons: [...new Set(seasons)].sort((a, b) => a - b),
    },
  }
}

export function parsePlayerPage(
  reply: Reply,
  requestedLeagueId: number,
  requestedSeason: number,
  requestedPage: number,
): { page: PlayerPage | null; failure?: Failure } {
  const failure = classifyFailure(reply)
  if (failure) return { page: null, failure }

  const body = object(reply.body)
  if (!body || !Array.isArray(body.response)) {
    return { page: null, failure: "malformed" }
  }

  const parameters = object(body.parameters)
  if (
    parameters?.league != null &&
    Number(parameters.league) !== requestedLeagueId
  ) {
    return { page: null, failure: "malformed" }
  }

  if (
    parameters?.season != null &&
    Number(parameters.season) !== requestedSeason
  ) {
    return { page: null, failure: "malformed" }
  }

  if (
    parameters?.page != null &&
    Number(parameters.page) !== requestedPage
  ) {
    return { page: null, failure: "malformed" }
  }

  const paging = object(body.paging)
  const currentPage = Number(paging?.current ?? requestedPage)
  const totalPages = Number(paging?.total ?? 1)

  if (
    !Number.isInteger(currentPage) ||
    !Number.isInteger(totalPages) ||
    currentPage !== requestedPage ||
    totalPages < 0 ||
    (totalPages > 0 && currentPage > totalPages)
  ) {
    return { page: null, failure: "malformed" }
  }

  if (!body.response.every(row => object(row))) {
    return { page: null, failure: "malformed" }
  }

  return {
    page: {
      rows: body.response as Row[],
      currentPage,
      totalPages,
    },
  }
}

function activePlayerIds(directory: string): Set<string> {
  const path = join(directory, "players.json")
  const input = JSON.parse(readFileSync(path, "utf8")) as unknown

  if (!Array.isArray(input) || !input.length) {
    throw new Error("players.json is missing or empty")
  }

  const ids = new Set<string>()

  for (const raw of input) {
    const row = object(raw)
    const ref = object(row?.externalRef)

    if (
      ref?.provider !== "api-football" ||
      typeof ref.externalId !== "string" ||
      !/^[1-9]\d*$/.test(ref.externalId)
    ) {
      throw new Error("Invalid players.json externalRef")
    }

    if (ids.has(ref.externalId)) {
      throw new Error(`Duplicate active player ID: ${ref.externalId}`)
    }

    ids.add(ref.externalId)
  }

  return ids
}

function relevantCareerSeasons(directory: string): number[] {
  const path = join(directory, "player-career-clubs.json")
  const input = JSON.parse(readFileSync(path, "utf8")) as unknown

  if (!Array.isArray(input) || !input.length) {
    throw new Error("player-career-clubs.json is missing or empty")
  }

  const seasons = new Set<number>([MAX_GAME_SEASON])

  for (const rawPlayer of input) {
    const player = object(rawPlayer)
    if (!player || !Array.isArray(player.clubs)) {
      throw new Error("Malformed player-career-clubs.json row")
    }

    for (const rawClub of player.clubs) {
      const club = object(rawClub)
      if (!club || !Array.isArray(club.seasons)) {
        throw new Error("Malformed career club row")
      }

      for (const season of club.seasons) {
        if (
          typeof season === "number" &&
          Number.isInteger(season) &&
          season >= 1900 &&
          season <= MAX_GAME_SEASON
        ) {
          seasons.add(season)
        }
      }
    }
  }

  return [...seasons].sort((a, b) => a - b)
}

function buildEvidenceFromRows(
  activeIds: ReadonlySet<string>,
  leagueId: number,
  leagueName: string,
  season: number,
  rows: Row[],
): {
  evidence: LeagueSeasonEvidence[]
  ignoredInactivePlayers: number
  malformedStatistics: number
  zeroAppearanceStatistics: number
} {
  const evidence = new Map<string, LeagueSeasonEvidence>()
  let ignoredInactivePlayers = 0
  let malformedStatistics = 0
  let zeroAppearanceStatistics = 0

  for (const row of rows) {
    const player = object(row.player)

    if (!player || !positiveId(player.id)) {
      malformedStatistics++
      continue
    }

    const playerId = String(player.id)

    if (!activeIds.has(playerId)) {
      ignoredInactivePlayers++
      continue
    }

    if (!Array.isArray(row.statistics)) {
      malformedStatistics++
      continue
    }

    for (const rawStatistic of row.statistics) {
      const statistic = object(rawStatistic)
      const team = object(statistic?.team)
      const league = object(statistic?.league)
      const games = object(statistic?.games)

      if (
        !statistic ||
        !team ||
        !league ||
        !positiveId(team.id) ||
        !positiveId(league.id) ||
        league.id !== leagueId ||
        league.season !== season
      ) {
        malformedStatistics++
        continue
      }

      const appearances = nonnegativeInteger(
        games?.appearences ?? games?.appearances,
      )
      const lineups = nonnegativeInteger(games?.lineups)
      const minutes = nonnegativeInteger(games?.minutes)

      // For "played in league", require positive competition participation.
      // A provider row with only squad/team association and zero/null playing
      // statistics is retained nowhere in league eligibility.
      const hasAppearanceEvidence =
        (appearances != null && appearances > 0) ||
        (minutes != null && minutes > 0)

      if (!hasAppearanceEvidence) {
        zeroAppearanceStatistics++
        continue
      }

      const teamId = String(team.id)
      const key = `${playerId}:${leagueId}:${season}:${teamId}`

      evidence.set(key, {
        playerExternalRef: externalRef(playerId),
        leagueExternalRef: externalRef(String(leagueId)),
        leagueName,
        season,
        teamExternalRef: externalRef(teamId),
        providerTeamName: text(team.name),
        appearances,
        lineups,
        minutes,
        evidenceType: "provider-league-season-statistics",
        eligibilityEvidence: "appearance-confirmed",
      })
    }
  }

  return {
    evidence: [...evidence.values()],
    ignoredInactivePlayers,
    malformedStatistics,
    zeroAppearanceStatistics,
  }
}

function buildLeagueHistory(
  evidence: LeagueSeasonEvidence[],
): LeagueHistory[] {
  const grouped = new Map<string, {
    playerExternalRef: ExternalRef
    leagueExternalRef: ExternalRef
    leagueName: string
    seasons: Set<number>
    teamExternalIds: Set<string>
  }>()

  for (const row of evidence) {
    const key =
      `${row.playerExternalRef.externalId}:` +
      `${row.leagueExternalRef.externalId}`

    const current = grouped.get(key) ?? {
      playerExternalRef: row.playerExternalRef,
      leagueExternalRef: row.leagueExternalRef,
      leagueName: row.leagueName,
      seasons: new Set<number>(),
      teamExternalIds: new Set<string>(),
    }

    current.seasons.add(row.season)
    current.teamExternalIds.add(row.teamExternalRef.externalId)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map(row => ({
      playerExternalRef: row.playerExternalRef,
      leagueExternalRef: row.leagueExternalRef,
      leagueName: row.leagueName,
      seasons: [...row.seasons].sort((a, b) => a - b),
      teamExternalIds: [...row.teamExternalIds]
        .sort((a, b) => Number(a) - Number(b)),
      evidenceType: "provider-league-season-statistics" as const,
      eligibilityEvidence: "appearance-confirmed" as const,
    }))
    .sort(
      (a, b) =>
        Number(a.playerExternalRef.externalId) -
          Number(b.playerExternalRef.externalId) ||
        Number(a.leagueExternalRef.externalId) -
          Number(b.leagueExternalRef.externalId),
    )
}

function writeJson(directory: string, name: string, value: unknown) {
  writeFileSync(
    join(directory, name),
    JSON.stringify(value, null, 2) + "\n",
  )
}

export async function importHistoricalLeagueEvidence(
  directory: string,
  requester: Requester,
  maxLiveRequests = 500,
  delayMs = 300,
) {
  if (
    !Number.isInteger(maxLiveRequests) ||
    maxLiveRequests < 0 ||
    maxLiveRequests > 5000
  ) {
    throw new Error(
      "maxLiveRequests must be an integer from 0 to 5000",
    )
  }

  if (!Number.isFinite(delayMs) || delayMs < 250) {
    throw new Error(
      "delayMs must keep requests at or below 4 per second",
    )
  }

  const activeIds = activePlayerIds(directory)
  const careerSeasons = relevantCareerSeasons(directory)

  const rawDirectory = join(directory, "raw")
  const leagueCatalogDirectory = join(rawDirectory, "league-catalog")
  const playerPagesDirectory = join(rawDirectory, "player-pages")

  mkdirSync(leagueCatalogDirectory, { recursive: true })
  mkdirSync(playerPagesDirectory, { recursive: true })

  let liveRequests = 0
  let cacheHits = 0
  let lastRequestAt = 0

  let stopReason:
    | "budget"
    | "authentication"
    | "quota"
    | null = null

  const errors: Array<{
    endpoint: string
    type: Failure
  }> = []

  const waitForRateLimit = async () => {
    const waitMs = delayMs - (Date.now() - lastRequestAt)
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }

  const requestOrCache = async (
    endpoint: string,
    cacheFile: string,
  ): Promise<Reply | null> => {
    if (existsSync(cacheFile)) {
      try {
        const body = JSON.parse(readFileSync(cacheFile, "utf8")) as unknown
        cacheHits++
        return { httpStatus: 200, body }
      } catch {
        errors.push({ endpoint, type: "malformed" })
        return null
      }
    }

    if (stopReason) return null

    if (liveRequests >= maxLiveRequests) {
      stopReason = "budget"
      return null
    }

    await waitForRateLimit()
    lastRequestAt = Date.now()
    liveRequests++

    let reply: Reply
    try {
      reply = await requester(endpoint)
    } catch {
      errors.push({ endpoint, type: "network" })
      return null
    }

    const failure = classifyFailure(reply)
    if (failure) {
      errors.push({ endpoint, type: failure })

      if (
        failure === "authentication" ||
        failure === "quota"
      ) {
        stopReason = failure
      }

      return null
    }

    // Cache the exact successful provider response body.
    writeFileSync(
      cacheFile,
      JSON.stringify(reply.body) + "\n",
      { flag: "wx" },
    )

    return reply
  }

  const catalogs = new Map<number, LeagueCatalog>()

  for (const league of HISTORICAL_TARGET_LEAGUES) {
    const endpoint = `leagues?id=${league.id}`
    const cacheFile = join(
      leagueCatalogDirectory,
      `${league.id}.json`,
    )

    const reply = await requestOrCache(endpoint, cacheFile)
    if (!reply) continue

    const parsed = parseLeagueCatalog(
      reply,
      league.id,
      league.name,
    )

    if (!parsed.catalog) {
      errors.push({
        endpoint,
        type: parsed.failure ?? "malformed",
      })
      continue
    }

    catalogs.set(league.id, parsed.catalog)
  }

  const targetPairs: Array<{
    leagueId: number
    leagueName: string
    season: number
  }> = []

  for (const league of HISTORICAL_TARGET_LEAGUES) {
    const catalog = catalogs.get(league.id)
    if (!catalog) continue

    const supported = new Set(catalog.supportedPlayerSeasons)

    for (const season of careerSeasons) {
      if (!supported.has(season)) continue

      targetPairs.push({
        leagueId: league.id,
        leagueName: league.name,
        season,
      })
    }
  }

  const loadedPages: Array<{
    leagueId: number
    leagueName: string
    season: number
    page: number
    rows: Row[]
  }> = []

  const pairProgress: Array<{
    leagueId: number
    leagueName: string
    season: number
    totalPages: number | null
    loadedPages: number
    complete: boolean
  }> = []

  for (const pair of targetPairs) {
    if (
      stopReason === "authentication" ||
      stopReason === "quota"
    ) {
      break
    }

    const firstEndpoint =
      `players?league=${pair.leagueId}` +
      `&season=${pair.season}&page=1`

    const firstCache = join(
      playerPagesDirectory,
      `${pair.leagueId}-${pair.season}-1.json`,
    )

    const firstReply = await requestOrCache(
      firstEndpoint,
      firstCache,
    )

    if (!firstReply) {
      pairProgress.push({
        ...pair,
        totalPages: null,
        loadedPages: 0,
        complete: false,
      })
      continue
    }

    const parsedFirst = parsePlayerPage(
      firstReply,
      pair.leagueId,
      pair.season,
      1,
    )

    if (!parsedFirst.page) {
      errors.push({
        endpoint: firstEndpoint,
        type: parsedFirst.failure ?? "malformed",
      })

      pairProgress.push({
        ...pair,
        totalPages: null,
        loadedPages: 0,
        complete: false,
      })
      continue
    }

    const totalPages = parsedFirst.page.totalPages
    let pairLoadedPages = 1

    loadedPages.push({
      ...pair,
      page: 1,
      rows: parsedFirst.page.rows,
    })

    // An empty valid result can report total=0. Treat page 1 as the
    // complete request in that case.
    const pagesToLoad = Math.max(totalPages, 1)

    for (let page = 2; page <= pagesToLoad; page++) {
      const endpoint =
        `players?league=${pair.leagueId}` +
        `&season=${pair.season}&page=${page}`

      const cacheFile = join(
        playerPagesDirectory,
        `${pair.leagueId}-${pair.season}-${page}.json`,
      )

      const reply = await requestOrCache(endpoint, cacheFile)
      if (!reply) break

      const parsed = parsePlayerPage(
        reply,
        pair.leagueId,
        pair.season,
        page,
      )

      if (!parsed.page) {
        errors.push({
          endpoint,
          type: parsed.failure ?? "malformed",
        })
        break
      }

      if (
        totalPages > 0 &&
        parsed.page.totalPages !== totalPages
      ) {
        errors.push({ endpoint, type: "malformed" })
        break
      }

      pairLoadedPages++

      loadedPages.push({
        ...pair,
        page,
        rows: parsed.page.rows,
      })
    }

    pairProgress.push({
      ...pair,
      totalPages,
      loadedPages: pairLoadedPages,
      complete:
        pairLoadedPages === pagesToLoad,
    })

    if (stopReason === "budget") {
      break
    }
  }

  const evidenceMap = new Map<string, LeagueSeasonEvidence>()

  let ignoredInactivePlayers = 0
  let malformedStatistics = 0
  let zeroAppearanceStatistics = 0

  for (const page of loadedPages) {
    const built = buildEvidenceFromRows(
      activeIds,
      page.leagueId,
      page.leagueName,
      page.season,
      page.rows,
    )

    ignoredInactivePlayers += built.ignoredInactivePlayers
    malformedStatistics += built.malformedStatistics
    zeroAppearanceStatistics += built.zeroAppearanceStatistics

    for (const row of built.evidence) {
      const key =
        `${row.playerExternalRef.externalId}:` +
        `${row.leagueExternalRef.externalId}:` +
        `${row.season}:` +
        `${row.teamExternalRef.externalId}`

      evidenceMap.set(key, row)
    }
  }

  const evidence = [...evidenceMap.values()].sort(
    (a, b) =>
      Number(a.playerExternalRef.externalId) -
        Number(b.playerExternalRef.externalId) ||
      a.season - b.season ||
      Number(a.leagueExternalRef.externalId) -
        Number(b.leagueExternalRef.externalId) ||
      Number(a.teamExternalRef.externalId) -
        Number(b.teamExternalRef.externalId),
  )

  const history = buildLeagueHistory(evidence)

  const playersWithEvidence = new Set(
    evidence.map(row => row.playerExternalRef.externalId),
  )

  const evidenceByLeague = Object.fromEntries(
    HISTORICAL_TARGET_LEAGUES.map(league => {
      const rows = evidence.filter(
        row =>
          row.leagueExternalRef.externalId ===
          String(league.id),
      )

      return [
        league.name,
        {
          leagueId: league.id,
          evidenceRecords: rows.length,
          uniquePlayers: new Set(
            rows.map(row => row.playerExternalRef.externalId),
          ).size,
          seasonsWithEvidence: [
            ...new Set(rows.map(row => row.season)),
          ].sort((a, b) => a - b),
        },
      ]
    }),
  )

  const completePairs = pairProgress.filter(
    pair => pair.complete,
  ).length

  const summary = {
    activePlayers: activeIds.size,
    careerSeasonRange: {
      min: careerSeasons.length
        ? Math.min(...careerSeasons)
        : null,
      max: careerSeasons.length
        ? Math.max(...careerSeasons)
        : null,
      seasons: careerSeasons,
    },
    targetLeagues: HISTORICAL_TARGET_LEAGUES,
    leagueCatalogsLoaded: catalogs.size,
    targetLeagueSeasons: targetPairs.length,
    completeLeagueSeasons: completePairs,
    incompleteLeagueSeasons:
      targetPairs.length - completePairs,
    loadedPlayerPages: loadedPages.length,
    liveRequests,
    cacheHits,
    stopReason,
    errors,
    evidenceRecords: evidence.length,
    uniquePlayersWithLeagueEvidence:
      playersWithEvidence.size,
    uniquePlayersWithoutLeagueEvidence:
      activeIds.size - playersWithEvidence.size,
    playerLeagueHistoryRows: history.length,
    ignoredInactivePlayerRows:
      ignoredInactivePlayers,
    malformedStatistics,
    zeroAppearanceStatistics,
    evidenceByLeague,
    complete:
      catalogs.size === HISTORICAL_TARGET_LEAGUES.length &&
      completePairs === targetPairs.length,
    note: [
      "Only the five V1 target leagues are imported.",
      "League eligibility requires positive player competition statistics: appearances > 0 or minutes > 0.",
      "Team/club association alone never creates league eligibility.",
      "The importer dynamically follows API pagination and resumes from exact raw caches.",
      "The existing raw/player-pages cache is reused, including already cached 2026 league-season pages.",
      "Only positive evidence is emitted; an incomplete run is safe to resume but must not be interpreted as proof that a player never played in a league.",
      "API season values are starting years and are capped at 2026 for the current game snapshot.",
    ],
  }

  writeJson(
    directory,
    "player-league-season-evidence.json",
    evidence,
  )
  writeJson(
    directory,
    "player-league-history.json",
    history,
  )
  writeJson(
    directory,
    "historical-league-evidence-summary.json",
    summary,
  )
  writeJson(
    directory,
    "historical-league-evidence-progress.json",
    pairProgress,
  )

  return summary
}
