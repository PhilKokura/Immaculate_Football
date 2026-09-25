import { V1_ACHIEVEMENT_KEYS } from "../lib/achievementCriteria"

export interface AchievementRow {
  key: string
  label: string
}
export interface PlayerAchievementRow {
  player_id: string
  achievement_key: string
}

/** Fail before writing runtime JSON if Supabase links or the ten-key catalog drift. */
export function buildRuntimeAchievements(
  catalog: readonly AchievementRow[],
  links: readonly PlayerAchievementRow[],
  playerIds: ReadonlySet<string>,
): Map<string, string[]> {
  const expected = new Set<string>(V1_ACHIEVEMENT_KEYS)
  const byKey = new Map<string, AchievementRow>()
  for (const achievement of catalog) {
    if (!expected.has(achievement.key) || !achievement.label?.trim() || byKey.has(achievement.key)) {
      throw new Error(`Invalid achievements catalog key or label: ${achievement.key}`)
    }
    byKey.set(achievement.key, achievement)
  }
  for (const key of expected) {
    if (!byKey.has(key)) throw new Error(`Missing achievement catalog key: ${key}`)
  }

  const sets = new Map<string, Set<string>>()
  for (const link of links) {
    if (!playerIds.has(link.player_id)) {
      throw new Error(`player_achievements references unknown player ${link.player_id}`)
    }
    if (!byKey.has(link.achievement_key)) {
      throw new Error(`player_achievements references missing achievement ${link.achievement_key}`)
    }
    let keys = sets.get(link.player_id)
    if (!keys) {
      keys = new Set()
      sets.set(link.player_id, keys)
    }
    keys.add(link.achievement_key)
  }

  const order = new Map<string, number>(V1_ACHIEVEMENT_KEYS.map((key, index) => [key, index]))
  return new Map([...sets].map(([playerId, keys]) => [
    playerId,
    [...keys].sort((a, b) => order.get(a)! - order.get(b)!),
  ]))
}

