import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  currentLeagueKeys,
  mapCachedCurrentTeams,
  type ClubLeagueMembership,
} from "../scripts/club-league-memberships"

const clubId = "11111111-1111-4111-8111-111111111111"
const otherClubId = "22222222-2222-4222-8222-222222222222"
const leagueId = "33333333-3333-4333-8333-333333333333"
const unsupportedLeagueId = "44444444-4444-4444-8444-444444444444"

const cachedTeam = {
  externalRef: { provider: "api-football", externalId: "33" },
  leagueId: 39,
  season: 2026,
  teamType: "senior-club",
}
const clubRefs = [{ club_id: clubId, provider: "api-football", external_id: "33" }]
const leagueRefs = [{ league_id: leagueId, provider: "api-football", external_id: "39" }]

test("cached provider references import only FootGrid UUID memberships and retain season", () => {
  const rows = mapCachedCurrentTeams([cachedTeam, cachedTeam], clubRefs, leagueRefs)
  assert.deepEqual(rows, [{ club_id: clubId, league_id: leagueId, season: 2026, is_current: true }])
  assert.equal(JSON.stringify(rows).includes('"33"'), false)
  assert.equal(JSON.stringify(rows).includes('"39"'), false)
  assert.throws(() => mapCachedCurrentTeams([cachedTeam], [], leagueRefs), /FootGrid UUID/)
  assert.throws(() => mapCachedCurrentTeams([cachedTeam], clubRefs, [
    { league_id: "39", provider: "api-football", external_id: "39" },
  ]), /FootGrid UUID/)
})

test("currentLeagueKey uses current supported memberships and leaves unsupported clubs null", () => {
  const rows: ClubLeagueMembership[] = [
    { club_id: clubId, league_id: leagueId, season: 2026, is_current: true },
    { club_id: otherClubId, league_id: unsupportedLeagueId, season: 2026, is_current: true },
    { club_id: otherClubId, league_id: leagueId, season: 2025, is_current: false },
  ]
  const keys = currentLeagueKeys(rows, new Set([leagueId]))
  assert.equal(keys.get(clubId), `league:${leagueId}`)
  assert.equal(keys.get(otherClubId) ?? null, null)
  assert.throws(() => currentLeagueKeys([
    rows[0], { ...rows[0], season: 2025 },
  ], new Set([leagueId])), /multiple current supported leagues/)
})

test("runtime builder no longer reads the cached current-team list or provider club IDs", () => {
  const source = readFileSync("scripts/build-runtime-from-supabase.ts", "utf8")
  assert.doesNotMatch(source, /teams\.json|club_external_ids|league_external_ids/)
  assert.match(source, /club_league_memberships/)
  assert.match(source, /currentLeagueKeys/)
})
