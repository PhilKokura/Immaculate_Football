import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildEnrichment, enrichActiveTop5, parsePage, parseProfileReply, PAGES } from "../scripts/provider-evaluation/api-football/enrich-active-top5"
import { LEAGUES, type Requester } from "../scripts/provider-evaluation/api-football/active-top5"

const reply = (response: unknown[], page = 1) => ({ httpStatus: 200, body: { errors: [], parameters: { league: "39", season: "2026", page: String(page) }, paging: { current: page, total: 26 }, response } })
const row = (id: number, age = 28, team = 10) => ({
  player: { id, name: "Same Name", firstname: "First", lastname: "Last", age,
    birth: { date: "1998-01-02", place: "Town", country: "Country" }, nationality: "Country", height: "180 cm", weight: "75 kg", photo: "photo" },
  statistics: [{ team: { id: team }, league: { id: 39, season: 2026 }, games: { position: "Midfielder", appearences: 12, lineups: 8, minutes: 700, number: 7 }, substitutes: { bench: 4 } }],
})

test("joins solely by player ID, retains distinct same-name players, and rejects malformed age", () => {
  const result = buildEnrichment(new Set(["1", "2", "3"]), [
    { leagueId: 39, page: 1, rows: [row(1, 2025), row(99)] },
    { leagueId: 39, page: 2, rows: [row(2)] },
  ])
  assert.deepEqual(result.profiles.map(profile => profile.externalRef.externalId), ["1", "2"])
  assert.equal(result.profiles[0].providerDerivedAge, null)
  assert.equal(result.profiles[0].birthDate, "1998-01-02")
  assert.equal(result.profiles[0].providerName, result.profiles[1].providerName)
  assert.equal(result.ignoredProviderRows, 1)
  assert.equal(result.invalidAges, 1)
  assert.equal(result.evidence[0].evidenceType, "provider-league-season-statistics")
  assert.deepEqual([result.evidence[0].playerExternalRef.externalId, result.evidence[0].teamExternalRef.externalId, result.evidence[0].leagueExternalRef.externalId], ["1", "10", "39"])
  assert.deepEqual([result.evidence[0].season, result.evidence[0].appearances, result.evidence[0].lineups, result.evidence[0].minutes, result.evidence[0].bench, result.evidence[0].shirtNumber], [2026, 12, 8, 700, 4, 7])
})

test("preserves distinct competition evidence and excludes non-2026 statistics", () => {
  const player = row(1)
  player.statistics.push({ ...player.statistics[0], league: { id: 2, season: 2026 } })
  player.statistics.push({ ...player.statistics[0], league: { id: 39, season: 2025 } })
  const result = buildEnrichment(new Set(["1"]), [{ leagueId: 39, page: 1, rows: [player] }])
  assert.deepEqual(result.evidence.map(entry => entry.leagueExternalRef.externalId), ["2", "39"])
})

test("resumes from raw page caches without dropping unenriched squad players", async () => {
  const directory = mkdtempSync(join(tmpdir(), "top5-enrichment-"))
  const whitelist = [1, 2, 3].map(id => ({ externalRef: { provider: "api-football", externalId: String(id) }, name: `Squad ${id}` }))
  writeFileSync(join(directory, "players.json"), JSON.stringify(whitelist))
  const calls: string[] = []
  const requester: Requester = async path => {
    calls.push(path)
    return reply(path.endsWith("page=1") ? [row(1), row(99)] : [row(2)], path.endsWith("page=1") ? 1 : 2)
  }
  try {
    const first = await enrichActiveTop5(directory, requester, 1, 250)
    assert.equal(first.liveRequests, 1)
    assert.equal(first.pagesCached, 1)
    assert.equal(first.enrichedActivePlayers, 1)
    const second = await enrichActiveTop5(directory, requester, 1, 250)
    assert.equal(second.liveRequests, 1)
    assert.equal(second.pagesCached, 2)
    assert.equal(second.enrichedActivePlayers, 2)
    assert.equal(second.activePlayersNotFoundInPlayers, 1)
    assert.equal(second.ignoredProviderPlayerRows, 1)
    const third = await enrichActiveTop5(directory, requester, 0, 250)
    assert.equal(third.liveRequests, 0)
    assert.equal(third.pagesCached, 2)
    assert.equal(calls.length, 2)
    assert.equal(JSON.parse(readFileSync(join(directory, "players.json"), "utf8")).length, 3)
    assert.equal(JSON.parse(readFileSync(join(directory, "player-profiles.json"), "utf8")).length, 2)
    assert.equal(JSON.parse(readFileSync(join(directory, "raw", "player-pages", "39-2026-1.json"), "utf8")).response.length, 2)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("accepts empty pages and classifies provider failures", () => {
  assert.equal(parsePage(reply([]), 39, 1).failure, "empty")
  assert.equal(parsePage({ httpStatus: 429, body: { errors: { requests: "rate limit" } } }, 39, 1).failure, "quota")
  assert.equal(parsePage({ httpStatus: 401, body: {} }, 39, 1).failure, "authentication")
  assert.equal(parsePage({ httpStatus: 200, body: { response: "bad" } }, 39, 1).failure, "malformed")
})

test("profile fallback only requests missing whitelist IDs, rejects mismatches, and resumes from individual caches", async () => {
  const directory = mkdtempSync(join(tmpdir(), "top5-fallback-"))
  const squad = [1, 2, 3].map(id => ({ externalRef: { provider: "api-football", externalId: String(id) }, name: `Squad ${id}`, age: 19, position: "Defender", number: 11 }))
  writeFileSync(join(directory, "players.json"), JSON.stringify(squad))
  const pageDir = join(directory, "raw", "player-pages")
  mkdirSync(pageDir, { recursive: true })
  for (const league of LEAGUES) for (let page = 1; page <= PAGES[league.id]; page++) {
    const body = reply(league.id === 39 && page === 1 ? [row(1), row(99)] : [], page).body
    body.parameters.league = String(league.id)
    body.paging.total = PAGES[league.id]
    writeFileSync(join(pageDir, `${league.id}-2026-${page}.json`), JSON.stringify(body))
  }
  const calls: string[] = []
  let badThird = true
  const requester: Requester = async path => {
    calls.push(path)
    const id = Number(path.split("=")[1])
    if (id === 3 && badThird) return { httpStatus: 200, body: { errors: [], response: [{ player: { id: 99, name: "Wrong ID" } }] } }
    return { httpStatus: 200, body: { errors: [], response: [{ player: {
      id, name: `Provider ${id}`, firstname: "First", lastname: "Last", age: 25,
      birth: { date: "2000-01-01", place: "Town", country: "Country" }, nationality: "Country",
      height: "180 cm", weight: "75 kg", photo: "photo", position: "Midfielder", number: 8,
    } }] } }
  }
  try {
    const first = await enrichActiveTop5(directory, requester, 1, 250)
    assert.deepEqual(calls, ["players/profiles?player=2"])
    assert.equal(first.enrichedFromLeagueSeason, 1)
    assert.equal(first.enrichedFromProfilesFallback, 1)
    assert.equal(first.activePlayersStillMissingProfile, 1)
    assert.equal(first.fallbackRequests, 1)
    assert.equal(first.ignoredProviderPlayerRows, 1)
    const profiles = JSON.parse(readFileSync(join(directory, "player-profiles.json"), "utf8"))
    assert.deepEqual(profiles.map((profile: { externalRef: { externalId: string } }) => profile.externalRef.externalId), ["1", "2"])
    assert.equal(profiles[1].birthDate, "2000-01-01")
    assert.equal(profiles[1].providerDerivedAge, 25)
    assert.equal(profiles[1].position, "Midfielder")
    assert.equal(profiles[1].number, 8)
    assert.equal(JSON.parse(readFileSync(join(directory, "player-season-evidence.json"), "utf8")).length, 1)
    const second = await enrichActiveTop5(directory, requester, 1, 250)
    assert.deepEqual(calls, ["players/profiles?player=2", "players/profiles?player=3"])
    assert.equal(second.fallbackCacheHits, 1)
    assert.deepEqual(second.fallbackErrors, [{ playerId: "3", type: "malformed" }])
    assert.equal(second.activePlayersStillMissingProfile, 1)
    badThird = false
    const third = await enrichActiveTop5(directory, requester, 1, 250)
    assert.equal(third.enrichedFromProfilesFallback, 2)
    assert.equal(third.activePlayersStillMissingProfile, 0)
    const fourth = await enrichActiveTop5(directory, requester, 0, 250)
    assert.equal(fourth.fallbackRequests, 0)
    assert.equal(fourth.fallbackCacheHits, 2)
    assert.equal(calls.length, 3)
    assert.equal(JSON.parse(readFileSync(join(directory, "players.json"), "utf8")).length, 3)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("profile endpoint empty result and wrong identity never produce a player", () => {
  assert.equal(parseProfileReply({ httpStatus: 200, body: { errors: [], response: [] } }, "7").failure, "empty")
  assert.equal(parseProfileReply({ httpStatus: 200, body: { errors: [], response: [{ player: { id: 8 } }] } }, "7").failure, "malformed")
})
