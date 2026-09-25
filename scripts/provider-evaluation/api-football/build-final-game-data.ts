import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildFinalGameData } from "./final-game-data"

const directory = join(
  dirname(fileURLToPath(import.meta.url)),
  ".local",
  "active-top5",
)

try {
  const summary = buildFinalGameData(directory)

  console.log(`Final players: ${summary.finalPlayers}`)
  console.log(`League history rows: ${summary.leagueHistoryRows}`)
  console.log(`Players with club criterion: ${summary.playersWithClubCriterion}`)
  console.log(`Players without club criterion: ${summary.playersWithoutClubCriterion}`)
  console.log(`Players with league criterion: ${summary.playersWithLeagueCriterion}`)
  console.log(`Players without league criterion: ${summary.playersWithoutLeagueCriterion}`)
  console.log(`Players with nation criterion: ${summary.playersWithNationCriterion}`)
  console.log(`Players without nation criterion: ${summary.playersWithoutNationCriterion}`)
  console.log(`Players with position criterion: ${summary.playersWithPositionCriterion}`)
  console.log(`Players without position criterion: ${summary.playersWithoutPositionCriterion}`)
  console.log(`Players with all 4 criterion types: ${summary.playersWithAllFourCriterionTypes}`)
  console.log(`League player counts: ${JSON.stringify(summary.leaguePlayerCounts)}`)
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown final game-data build error"

  console.error(`Final game-data build failed: ${message}`)
  process.exitCode = 1
}
