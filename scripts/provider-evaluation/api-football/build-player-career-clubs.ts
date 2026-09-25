import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildPlayerCareerClubs } from "./player-career-clubs"

const directory = join(
  dirname(fileURLToPath(import.meta.url)),
  ".local",
  "active-top5",
)

try {
  const summary = buildPlayerCareerClubs(directory)

  console.log(`Active players: ${summary.activePlayers}`)
  console.log(`Players with provider history: ${summary.playersWithAnyProviderHistory}`)
  console.log(`Players without provider history: ${summary.playersWithoutProviderHistory}`)
  console.log(`Players with >=1 senior club: ${summary.playersWithAtLeastOneSeniorClub}`)
  console.log(`Players without senior club: ${summary.playersWithoutSeniorClub}`)
  console.log(`Players with >=1 season-backed senior club: ${summary.playersWithAtLeastOneSeasonBackedSeniorClub}`)
  console.log(`Players with senior clubs but only weak/no-season evidence: ${summary.playersWithSeniorClubsButNoSeasonBackedSeniorClub}`)
  console.log(`Senior-club associations: ${summary.seniorClubAssociations}`)
  console.log(`Season-backed senior-club associations: ${summary.seasonBackedSeniorClubAssociations}`)
  console.log(`Senior-club associations without season: ${summary.seniorClubAssociationsWithoutSeason}`)
  console.log(`Unique senior clubs referenced: ${summary.uniqueSeniorClubsReferenced}`)
  console.log(`Input associations: ${summary.totalInputAssociations}`)
  console.log(`Ignored empty season values: ${summary.ignoredEmptySeasonValues}`)
  console.log(`Associations containing ignored empty season values: ${summary.associationsWithIgnoredEmptySeasonValues}`)
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : "Unknown player career club build error"

  console.error(`Player career club build failed: ${message}`)
  process.exitCode = 1
}
