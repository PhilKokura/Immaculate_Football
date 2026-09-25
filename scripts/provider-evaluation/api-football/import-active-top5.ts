import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { importTop5, type Requester } from "./active-top5"

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
  importTop5(directory, requester, max).then(s => {
    console.log(`Teams loaded: ${s.teamsLoaded}`)
    console.log(`Squads cached: ${s.squadsCached} / ${s.teamsLoaded}`)
    console.log(`Unique players: ${s.uniquePlayers}`)
    console.log(`Live requests this run: ${s.liveRequests}`)
    console.log(`Remaining squads: ${s.remainingSquads ?? "unknown until league lists load"}`)
    if (s.remainingLeagues) console.log(`Remaining leagues: ${s.remainingLeagues}`)
    if (s.stopReason) console.log(`Stopped: ${s.stopReason}`)
    if (s.errors.length) console.log(`Endpoint errors: ${s.errors.length} (see import-summary.json)`)
  }).catch(() => { console.error("Importer failed before summary generation; credentials and response details suppressed."); process.exitCode = 1 })
}
