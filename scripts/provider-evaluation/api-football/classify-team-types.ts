import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { classifyCareerTeams } from "./team-classification"

const directory = join(dirname(fileURLToPath(import.meta.url)), ".local", "active-top5")

try {
  const summary = classifyCareerTeams(directory)
  console.log(`Teams classified: ${summary.totalTeams}`)
  console.log(`Senior clubs: ${summary.seniorClubs}`)
  console.log(`Reserve clubs: ${summary.reserveClubs}`)
  console.log(`Youth clubs: ${summary.youthClubs}`)
  console.log(`Senior national teams: ${summary.seniorNationalTeams}`)
  console.log(`Youth national teams: ${summary.youthNationalTeams}`)
  console.log(`Representative teams: ${summary.representativeTeams}`)
  console.log(`Women teams: ${summary.womenTeams}`)
  console.log(`Needs review: ${summary.review}`)
  console.log(`Provider club -> youth national corrections: ${summary.providerClubYouthNationalCorrections}`)
  console.log(`Medium-confidence audit candidates: ${summary.mediumConfidenceAuditCandidates}`)
  console.log(`Current top-five senior teams recognized: ${summary.currentTopFiveSeniorTeamsRecognized}`)
  console.log(`Built-in overrides applied: ${summary.builtInOverridesApplied}`)
  console.log(`Manual overrides applied: ${summary.manualOverridesApplied}`)
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown classification error"
  console.error(`Team classification failed: ${message}`)
  process.exitCode = 1
}
