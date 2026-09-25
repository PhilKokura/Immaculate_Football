import playersJson from "./runtime_players.json"
import criteriaJson from "./runtime_criteria.json"

export type CriterionType = "club" | "league" | "nation" | "position"
export type PositionCode = "GK" | "DEF" | "MID" | "ATT"

export interface GameCriterion {
  key: string
  type: CriterionType
  value: string
  label: string
  image?: string
  eligiblePlayerCount: number
  currentLeagueKey: string | null
}

export interface PlayerWithImage {
  id: string
  externalId: string
  name: string
  searchNames: string[]
  image: string | null
  birthDate: string | null
  clubs: string[]
  clubNames: string[]
  leagues: string[]
  nation: string
  rarity: number
  positions: PositionCode[]
  currentClubs: Array<{
    id: string
    name: string
  }>
  currentClubAmbiguous: boolean
}

export const PLAYERS_DATABASE = playersJson as PlayerWithImage[]
export const GAME_CRITERIA = criteriaJson as GameCriterion[]

export const CRITERION_BY_KEY = new Map(
  GAME_CRITERIA.map(criterion => [criterion.key, criterion]),
)

export const PLAYER_BY_ID = new Map(
  PLAYERS_DATABASE.map(player => [player.id, player]),
)

export function getCriterion(key: string): GameCriterion | null {
  return CRITERION_BY_KEY.get(key) ?? null
}

export function getCriterionLabel(key: string): string {
  return getCriterion(key)?.label ?? key
}

export function getCriteriaByType(
  type: CriterionType,
  minEligiblePlayers = 0,
): GameCriterion[] {
  return GAME_CRITERIA.filter(
    criterion =>
      criterion.type === type &&
      criterion.eligiblePlayerCount >= minEligiblePlayers,
  )
}
