import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildGameData } from "./game-data"

const directory = join(
  dirname(fileURLToPath(import.meta.url)),
  ".local",
  "active-top5",
)

try {
  const summary = buildGameData(directory)

  console.log(`Active players: ${summary.activePlayers}`)
  console.log(`Profiles found: ${summary.profilesFound}`)
  console.log(`Profiles missing: ${summary.profilesMissing}`)
  console.log(`Players with nationality: ${summary.playersWithNationality}`)
  console.log(`Players without nationality: ${summary.playersWithoutNationality}`)
  console.log(`Players with position: ${summary.playersWithPosition}`)
  console.log(`Players without position: ${summary.playersWithoutPosition}`)
  console.log(`Players with current club: ${summary.playersWithCurrentClub}`)
  console.log(`Players without current club: ${summary.playersWithoutCurrentClub}`)
  console.log(`Players with ambiguous current club: ${summary.playersWithAmbiguousCurrentClub}`)
  console.log(`Current memberships: ${summary.currentMemberships}`)
  console.log(`Players with >=1 eligible club: ${summary.playersWithAtLeastOneEligibleClub}`)
  console.log(`Players without eligible club: ${summary.playersWithoutEligibleClub}`)
  console.log(`Eligible club associations: ${summary.eligibleClubAssociations}`)
  console.log(`Excluded weak senior-club associations: ${summary.excludedWeakSeniorClubAssociations}`)
  console.log(`Unique eligible clubs: ${summary.uniqueEligibleClubs}`)
  console.log(`Unique nations: ${summary.uniqueNations}`)
  console.log(`Position counts: ${JSON.stringify(summary.positionCounts)}`)
  console.log(`Duplicate normalized display-name groups: ${summary.duplicateNormalizedDisplayNameGroups}`)
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : "Unknown game-data build error"

  console.error(`Game-data build failed: ${message}`)
  process.exitCode = 1
}
