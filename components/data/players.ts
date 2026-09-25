import { checkCriteria } from "@/lib/gameLogic"
import {
  PLAYERS_DATABASE,
  type PlayerWithImage,
} from "./gameData"

export { PLAYERS_DATABASE }

export function searchPlayers(
  query: string,
  usedPlayers: Set<string>,
  limit = 8,
  rowCriteria?: string,
  colCriteria?: string,
): PlayerWithImage[] {
  const normalizedQuery = normalizeText(query)

  return PLAYERS_DATABASE
    .filter(player => {
      const nameMatches =
        normalizedQuery.length === 0 ||
        player.searchNames.some(name =>
          normalizeText(name).includes(normalizedQuery),
        )

      if (!nameMatches) return false
      if (usedPlayers.has(player.id)) return false

      if (rowCriteria && colCriteria) {
        return (
          checkCriteria(player, rowCriteria) &&
          checkCriteria(player, colCriteria)
        )
      }

      return true
    })
    .sort((a, b) => searchRank(a, normalizedQuery) - searchRank(b, normalizedQuery))
    .slice(0, limit)
}

function searchRank(player: PlayerWithImage, normalizedQuery: string): number {
  const normalizedDisplayName = normalizeText(player.name)
  if (normalizedDisplayName === normalizedQuery) return 0
  if (normalizedDisplayName.startsWith(normalizedQuery)) return 1
  if (normalizedDisplayName.includes(normalizedQuery)) return 2

  if (
    player.searchNames.some(name =>
      normalizeText(name).startsWith(normalizedQuery),
    )
  ) {
    return 3
  }

  return 4
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function getPlayersByCriteria(criteria: string): PlayerWithImage[] {
  return PLAYERS_DATABASE.filter(player => checkCriteria(player, criteria))
}

export function getRandomPlayers(count = 5): PlayerWithImage[] {
  const shuffled = [...PLAYERS_DATABASE].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}
