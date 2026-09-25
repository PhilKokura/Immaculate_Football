import { checkCriteria } from "@/lib/gameLogic"
import {
  PLAYERS_DATABASE,
  type PlayerWithImage,
} from "./gameData"

export { PLAYERS_DATABASE }

export function normalizePlayerSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function searchRank(player: PlayerWithImage, query: string): number {
  const names = [player.name, ...player.searchNames]
  let bestRank = Number.POSITIVE_INFINITY

  for (const name of names) {
    const normalizedName = normalizePlayerSearchText(name)
    if (normalizedName === query) return 0
    if (normalizedName.startsWith(query)) bestRank = Math.min(bestRank, 1)
    else if (normalizedName.split(" ").some(token => token.startsWith(query))) {
      bestRank = Math.min(bestRank, 2)
    } else if (normalizedName.includes(query)) bestRank = Math.min(bestRank, 3)
  }

  return bestRank
}

/** Search the full active runtime catalog. Cell eligibility is checked only on submission. */
export function searchPlayers(
  query: string,
  limit = 20,
  players: readonly PlayerWithImage[] = PLAYERS_DATABASE,
): PlayerWithImage[] {
  const normalizedQuery = normalizePlayerSearchText(query)
  if (normalizedQuery.length < 2) return []

  return players
    .map(player => ({ player, rank: searchRank(player, normalizedQuery) }))
    .filter(result => Number.isFinite(result.rank))
    .sort((a, b) =>
      a.rank - b.rank ||
      (normalizePlayerSearchText(a.player.name) < normalizePlayerSearchText(b.player.name) ? -1 :
        normalizePlayerSearchText(a.player.name) > normalizePlayerSearchText(b.player.name) ? 1 : 0) ||
      (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0),
    )
    .slice(0, limit)
    .map(result => result.player)
}

export function getPlayersByCriteria(criteria: string): PlayerWithImage[] {
  return PLAYERS_DATABASE.filter(player => checkCriteria(player, criteria))
}

export function getRandomPlayers(count = 5): PlayerWithImage[] {
  const shuffled = [...PLAYERS_DATABASE].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}
