import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Requester } from "./active-top5"
import { importCareerHistory } from "./career-history"

const key = process.env.API_FOOTBALL_KEY?.trim()
if (!key) { console.error("API_FOOTBALL_KEY missing; no requests made."); process.exitCode = 1 }
else {
  const option = process.argv.find(arg => arg.startsWith("--max-requests="))
  const max = option ? Number(option.slice("--max-requests=".length)) : 500
  const directory = join(dirname(fileURLToPath(import.meta.url)), ".local", "active-top5")
  const requester: Requester = async path => {
    const response = await fetch(`https://v3.football.api-sports.io/${path}`, {
      headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(20000), redirect: "error",
    })
    let body: unknown
    try { body = await response.json() } catch { body = null }
    return { httpStatus: response.status, body }
  }
  importCareerHistory(directory, requester, max).then(summary => {
    console.log(`Whitelist players: ${summary.totalWhitelistPlayers}`)
    console.log(`Histories cached: ${summary.playersWithCachedHistory}`)
    console.log(`Still missing: ${summary.playersStillMissingHistory}`)
    console.log(`Team associations: ${summary.totalTeamAssociations}; unique teams: ${summary.uniqueTeams}`)
    console.log(`Live requests this run: ${summary.liveRequests}; cache hits: ${summary.cacheHits}`)
    if (summary.stopReason) console.log(`Stopped: ${summary.stopReason}`)
    if (summary.errors.length || summary.malformedAssociations.length) console.log(`Issues: ${summary.errors.length + summary.malformedAssociations.length} (see career-history-summary.json)`)
  }).catch(() => { console.error("Career history import failed before summary; credential and response details suppressed."); process.exitCode = 1 })
}
