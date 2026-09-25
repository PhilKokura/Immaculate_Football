import type { CriterionType } from "@/components/data/gameData"

export const CURATED_V1_CLUB_IDS = [
  // Premier League
  "5ae41a8c-ac3b-4f94-b07b-ba7ddfcce98e", // Arsenal
  "4a05c912-a648-4718-9510-046b97aa4b88", // Chelsea
  "7dc07535-0370-4667-8f5b-02e72c29506b", // Liverpool
  "baf1c77d-ac88-4f5c-89b1-f7d0fe7a8746", // Manchester City
  "64ff9b2b-54c6-4871-a371-d09112e37f74", // Manchester United
  "d0aac596-2bba-45c6-9312-585f868b3c2c", // Tottenham Hotspur
  // Bundesliga
  "20715314-e71c-4ba8-a30c-fe5cdb3550b5", // Bayern Munich
  "fc30e10a-b77a-403e-857c-947c5020fe92", // Borussia Dortmund
  "232d3a4c-2f38-4b09-83a6-eca98b1dddd4", // Bayer Leverkusen
  "5cd2f933-2010-490e-b8a4-88c5bfb820f6", // RB Leipzig
  "3b2d81e0-2319-4fee-88d5-2891d06b82ce", // Eintracht Frankfurt
  "25e43b4b-0695-44c5-a26b-edbc2ec925c1", // Schalke 04
  // La Liga
  "03a03c26-c009-46db-94c3-e248b59cd065", // Real Madrid
  "b10daf39-b666-4840-8938-3a5c32c965df", // Barcelona
  "4add3298-bdca-4651-aedc-b5489a5a3c96", // Atletico Madrid
  "93f60b2d-fd78-41c7-9e05-e834f8fbb904", // Sevilla
  "b94f83f2-eddf-4ab6-b7b2-1e9373cd34e3", // Valencia
  "961567db-6dac-4cae-bea5-c4392678adc0", // Athletic Club
  // Serie A
  "cb65707e-1910-4170-b2ce-86237bf40e2a", // Inter
  "fd11d745-7f58-432b-9910-d38bffdcaee6", // AC Milan
  "983634f3-0766-49af-93ca-0de22a05f31a", // Juventus
  "7c7ab879-0b22-49f7-8178-1d7f3b42f261", // AS Roma
  "1adc778d-0eb4-45a3-ae9f-3b0547cf3b9c", // Napoli
  "9cecda32-1f7b-4e59-b7c4-78f906edc740", // Lazio
  // Ligue 1
  "68e3cfad-ee2d-4208-9bdd-1e17950bb7ba", // Paris Saint Germain
  "4d9b241d-5110-47c7-ba1a-54f9b9048ee0", // Marseille
  "1d844080-f6ab-40f9-98f5-4841b210d0c4", // Lyon
  "4d6e33f3-1141-4f44-9b89-2370baee5b87", // Monaco
  "f8be53e4-2a34-425c-8fd3-012071f30d2a", // Lille
  "af6ad306-d8bd-4f2b-b558-57f0fc253bf7", // Rennes
] as const

export const MIN_NATION_ACTIVE_PLAYERS = 15
export const MIN_NATION_QUALIFYING_INTERSECTIONS = 5
export const MIN_NATION_INTERSECTION_PLAYERS = 5

/** Only keys in the V1 club/league/position countercriterion pool contribute. */
export function qualifiesV1NationHeader(
  activePlayerCount: number,
  intersectionCounts: ReadonlyMap<string, number>,
  allowedCountercriteria: ReadonlySet<string>,
): boolean {
  if (activePlayerCount < MIN_NATION_ACTIVE_PLAYERS) return false
  let qualifying = 0
  for (const key of allowedCountercriteria) {
    if ((intersectionCounts.get(key) ?? 0) >= MIN_NATION_INTERSECTION_PLAYERS) {
      qualifying++
    }
  }
  return qualifying >= MIN_NATION_QUALIFYING_INTERSECTIONS
}

export const MIN_CELL_SOLUTIONS = 3
export const HARD_MAX_SOLUTIONS = 5
export const MAX_HARD_CELLS = 1
export const SOFT_MAX_SOLUTIONS = 10
export const MIN_SOFT_CELLS = 1
export const EASY_MIN_SOLUTIONS = 11
export const MIN_EASY_CELLS = 2
export const MIN_CRITERION_TYPES_PER_AXIS = 2

export function hasV1AxisDiversity(types: readonly CriterionType[]): boolean {
  return new Set(types).size >= MIN_CRITERION_TYPES_PER_AXIS
}

export function v1DifficultyCounts(counts: readonly number[]) {
  return {
    hard: counts.filter(count => count >= MIN_CELL_SOLUTIONS && count <= HARD_MAX_SOLUTIONS).length,
    soft: counts.filter(count => count >= MIN_CELL_SOLUTIONS && count <= SOFT_MAX_SOLUTIONS).length,
    easy: counts.filter(count => count >= EASY_MIN_SOLUTIONS).length,
  }
}

export function meetsV1CellPolicy(counts: readonly number[]): boolean {
  if (counts.length !== 9 || counts.some(count => count < MIN_CELL_SOLUTIONS)) return false
  const { hard, soft, easy } = v1DifficultyCounts(counts)
  return hard <= MAX_HARD_CELLS && soft >= MIN_SOFT_CELLS && easy >= MIN_EASY_CELLS
}

