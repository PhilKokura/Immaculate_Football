import type { PositionCode } from "../components/data/gameData"

export interface CanonicalPlayerPositionRow {
  player_id: string
  position: string
  is_primary: boolean
}

export const POSITION_ORDER: readonly PositionCode[] = ["GK", "DEF", "MID", "ATT"]

export function buildPlayerPositionMap(
  rows: readonly CanonicalPlayerPositionRow[],
): Map<string, PositionCode[]> {
  const grouped = new Map<string, Map<PositionCode, boolean>>()

  for (const row of rows) {
    if (!row.player_id || !POSITION_ORDER.includes(row.position as PositionCode) ||
        typeof row.is_primary !== "boolean") {
      throw new Error(`Malformed player_positions row for player ${row.player_id || "<unknown>"}`)
    }
    const position = row.position as PositionCode
    let byPosition = grouped.get(row.player_id)
    if (!byPosition) {
      byPosition = new Map()
      grouped.set(row.player_id, byPosition)
    }
    byPosition.set(position, (byPosition.get(position) ?? false) || row.is_primary)
  }

  return new Map([...grouped].map(([playerId, byPosition]) => [
    playerId,
    [...byPosition.keys()].sort((a, b) =>
      Number(byPosition.get(b)) - Number(byPosition.get(a)) ||
      POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b),
    ),
  ]))
}

export function requirePlayerPositions(
  playerId: string,
  positionsByPlayer: ReadonlyMap<string, PositionCode[]>,
): PositionCode[] {
  const positions = positionsByPlayer.get(playerId)
  if (!positions?.length) {
    throw new Error(`Active player ${playerId} has no canonical player_positions rows`)
  }
  return positions
}

export function countPositionSupport(
  players: readonly { positions: readonly PositionCode[] }[],
): Map<PositionCode, number> {
  const counts = new Map<PositionCode, number>()
  for (const player of players) {
    for (const position of new Set(player.positions)) {
      counts.set(position, (counts.get(position) ?? 0) + 1)
    }
  }
  return counts
}

