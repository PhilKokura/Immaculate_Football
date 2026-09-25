import { GAME_CRITERIA, type CriterionType, type GameCriterion } from "../components/data/gameData"

export function runtimeCriterion(type: CriterionType, label: string): GameCriterion {
  const criterion = GAME_CRITERIA.find(item => item.type === type && item.label === label)
  if (!criterion) throw new Error(`Missing runtime criterion: ${type} ${label}`)
  return criterion
}
