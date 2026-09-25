import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Requester } from "./active-top5"
import { importTeamEnrichment } from "./team-enrichment"

const key = process.env.API_FOOTBALL_KEY?.trim()

if (!key) {
  console.error("API_FOOTBALL_KEY missing; no requests made.")
  process.exitCode = 1
} else {
  const option = process.argv.find(arg => arg.startsWith("--max-requests="))
  const max = option ? Number(option.slice("--max-requests=".length)) : 500
  const directory = join(dirname(fileURLToPath(import.meta.url)), ".local", "active-top5")

  const requester: Requester = async path => {
    const response = await fetch(`https://v3.football.api-sports.io/${path}`, {
      headers: { "x-apisports-key": key },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    })

    let body: unknown
    try { body = await response.json() } catch { body = null }
    return { httpStatus: response.status, body }
  }

  importTeamEnrichment(directory, requester, max).then(summary => {
    console.log(`Career teams: ${summary.totalCareerTeams}`)
    console.log(`Enriched teams: ${summary.enrichedTeams}`)
    console.log(`Still missing: ${summary.teamsStillMissing}`)
    console.log(`Clubs: ${summary.clubs}; national teams: ${summary.nationalTeams}; unknown: ${summary.unknownBroadType}`)
    console.log(`Live requests this run: ${summary.liveRequests}; cache hits: ${summary.cacheHits}`)
    if (summary.stopReason) console.log(`Stopped: ${summary.stopReason}`)
    if (summary.errors.length || summary.malformedRecords.length) {
      console.log(`Issues: ${summary.errors.length + summary.malformedRecords.length} (see team-enrichment-summary.json)`)
    }
  }).catch(() => {
    console.error("Team enrichment import failed before summary; credential and response details suppressed.")
    process.exitCode = 1
  })
}
