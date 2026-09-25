import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { enrichActiveTop5 } from "./enrich-active-top5"
import type { Requester } from "./active-top5"

const key = process.env.API_FOOTBALL_KEY?.trim()
if (!key) { console.error("API_FOOTBALL_KEY missing; no requests made."); process.exitCode = 1 }
else {
  const option = process.argv.find(arg => arg.startsWith("--max-requests="))
  const max = option ? Number(option.slice("--max-requests=".length)) : 75
  const directory = join(dirname(fileURLToPath(import.meta.url)), ".local", "active-top5")
  const requester: Requester = async path => {
    const response = await fetch(`https://v3.football.api-sports.io/${path}`, { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(20000), redirect: "error" })
    let body: unknown
    try { body = await response.json() } catch { body = null }
    return { httpStatus: response.status, body }
  }
  enrichActiveTop5(directory, requester, max).then(summary => {
    console.log(`Active squad players: ${summary.totalActiveSquadPlayers}`)
    console.log(`Enriched active players: ${summary.enrichedActivePlayers}`)
    console.log(`League-season profiles: ${summary.enrichedFromLeagueSeason}`)
    console.log(`Profiles fallback: ${summary.enrichedFromProfilesFallback} (${summary.fallbackRequests} requests, ${summary.fallbackCacheHits} cache hits)`)
    console.log(`Still missing profiles: ${summary.activePlayersStillMissingProfile}`)
    console.log(`Pages cached: ${summary.pagesCached} / ${summary.totalPages}`)
    console.log(`Live requests this run: ${summary.liveRequests}`)
    console.log(`Remaining pages: ${summary.remainingPages}`)
    if (summary.stopReason) console.log(`Stopped: ${summary.stopReason}`)
    if (summary.errors.length) console.log(`Page errors: ${summary.errors.length} (see enrichment-summary.json)`)
    if (summary.fallbackErrors.length) console.log(`Fallback errors: ${summary.fallbackErrors.length} (see enrichment-summary.json)`)
  }).catch(() => { console.error("Enrichment import failed before summary; credential and response details suppressed."); process.exitCode = 1 })
}
