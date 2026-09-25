export interface CachedCurrentTeam {
  externalRef: { provider: string; externalId: string }
  leagueId: number
  season: number
  teamType: string
}

export interface ExternalClubId {
  club_id: string
  provider: string
  external_id: string
}

export interface ExternalLeagueId {
  league_id: string
  provider: string
  external_id: string
}

export interface ClubLeagueMembership {
  club_id: string
  league_id: string
  season: number
  is_current: boolean
}

const topFiveLeagueIds = new Set([39, 61, 78, 135, 140])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Translate cached provider references at import time; DB rows contain FootGrid UUIDs only. */
export function mapCachedCurrentTeams(
  teams: readonly CachedCurrentTeam[],
  clubRefs: readonly ExternalClubId[],
  leagueRefs: readonly ExternalLeagueId[],
): ClubLeagueMembership[] {
  const clubIds = new Map(clubRefs
    .filter(ref => ref.provider === "api-football")
    .map(ref => [ref.external_id, ref.club_id]))
  const leagueIds = new Map(leagueRefs
    .filter(ref => ref.provider === "api-football")
    .map(ref => [ref.external_id, ref.league_id]))
  const byClub = new Map<string, ClubLeagueMembership>()

  for (const team of teams) {
    if (
      team.externalRef?.provider !== "api-football" ||
      team.teamType !== "senior-club" ||
      !topFiveLeagueIds.has(team.leagueId) ||
      !Number.isInteger(team.season)
    ) {
      throw new Error("Invalid cached current top-five team")
    }
    const clubId = clubIds.get(team.externalRef.externalId)
    const leagueId = leagueIds.get(String(team.leagueId))
    if (!clubId || !leagueId || !uuid.test(clubId) || !uuid.test(leagueId)) {
      throw new Error("Current team or league lacks a FootGrid UUID")
    }
    const row = { club_id: clubId, league_id: leagueId, season: team.season, is_current: true }
    const previous = byClub.get(clubId)
    if (previous && (previous.league_id !== leagueId || previous.season !== team.season)) {
      throw new Error("Conflicting current memberships for club")
    }
    byClub.set(clubId, row)
  }

  return [...byClub.values()].sort((a, b) => a.club_id.localeCompare(b.club_id))
}

/** Only current memberships in the runtime league catalog can forbid a club × league cell. */
export function currentLeagueKeys(
  memberships: readonly ClubLeagueMembership[],
  supportedLeagueIds: ReadonlySet<string>,
): Map<string, string> {
  const result = new Map<string, string>()
  for (const row of memberships) {
    if (!row.is_current || !supportedLeagueIds.has(row.league_id)) continue
    if (!uuid.test(row.club_id) || !uuid.test(row.league_id)) {
      throw new Error("Club league membership must use FootGrid UUIDs")
    }
    if (result.has(row.club_id)) {
      throw new Error("Club has multiple current supported leagues")
    }
    result.set(row.club_id, `league:${row.league_id}`)
  }
  return result
}
