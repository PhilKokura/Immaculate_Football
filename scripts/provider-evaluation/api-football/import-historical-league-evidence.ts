import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Requester } from "./active-top5"
import { importHistoricalLeagueEvidence } from "./historical-league-evidence"

const key = process.env.API_FOOTBALL_KEY?.trim()

if (!key) {
  console.error("API_FOOTBALL_KEY missing; no requests made.")
  process.exitCode = 1
} else {
  const option = process.argv.find(
    arg => arg.startsWith("--max-requests="),
  )

  const max = option
    ? Number(option.slice("--max-requests=".length))
    : 500

  const directory = join(
    dirname(fileURLToPath(import.meta.url)),
    ".local",
    "active-top5",
  )

  const requester: Requester = async path => {
    const response = await fetch(
      `https://v3.football.api-sports.io/${path}`,
      {
        headers: { "x-apisports-key": key },
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      },
    )

    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = null
    }

    return {
      httpStatus: response.status,
      body,
    }
  }

  importHistoricalLeagueEvidence(
    directory,
    requester,
    max,
  )
    .then(summary => {
      console.log(
        `Active players: ${summary.activePlayers}`,
      )
      console.log(
        `Career seasons: ${summary.careerSeasonRange.min} - ${summary.careerSeasonRange.max}`,
      )
      console.log(
        `League catalogs loaded: ${summary.leagueCatalogsLoaded} / ${summary.targetLeagues.length}`,
      )
      console.log(
        `Target league-seasons: ${summary.targetLeagueSeasons}`,
      )
      console.log(
        `Complete league-seasons: ${summary.completeLeagueSeasons}`,
      )
      console.log(
        `Incomplete league-seasons: ${summary.incompleteLeagueSeasons}`,
      )
      console.log(
        `Player pages loaded this output: ${summary.loadedPlayerPages}`,
      )
      console.log(
        `Live requests this run: ${summary.liveRequests}`,
      )
      console.log(
        `Cache hits this run: ${summary.cacheHits}`,
      )
      console.log(
        `Appearance-confirmed evidence records: ${summary.evidenceRecords}`,
      )
      console.log(
        `Players with >=1 target-league appearance: ${summary.uniquePlayersWithLeagueEvidence}`,
      )
      console.log(
        `Players without target-league evidence yet: ${summary.uniquePlayersWithoutLeagueEvidence}`,
      )
      console.log(
        `Player-league history rows: ${summary.playerLeagueHistoryRows}`,
      )
      console.log(
        `Zero-appearance statistics ignored: ${summary.zeroAppearanceStatistics}`,
      )

      if (summary.stopReason) {
        console.log(`Stopped: ${summary.stopReason}`)
      }

      if (summary.errors.length) {
        console.log(
          `Issues: ${summary.errors.length} (see historical-league-evidence-summary.json)`,
        )
      }

      console.log(
        summary.complete
          ? "Historical league evidence import complete."
          : "Historical league evidence import incomplete; rerun the same command to resume.",
      )
    })
    .catch(error => {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown importer failure"

      console.error(
        `Historical league evidence import failed: ${message}`,
      )
      process.exitCode = 1
    })
}
