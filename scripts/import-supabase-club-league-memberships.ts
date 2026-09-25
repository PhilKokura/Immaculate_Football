import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import {
  mapCachedCurrentTeams,
  type CachedCurrentTeam,
  type ClubLeagueMembership,
  type ExternalClubId,
  type ExternalLeagueId,
} from "./club-league-memberships"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error("Missing Supabase server environment variables")
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function fetchAll<T>(table: string, columns: string, currentOnly = false): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const externalRefs = table === "club_external_ids" || table === "league_external_ids"
    let query = supabase.from(table).select(columns)
      .order(externalRefs ? "external_id" : "id").range(from, from + 999)
    if (externalRefs) query = query.eq("provider", "api-football")
    if (currentOnly) query = query.eq("is_current", true)
    const { data, error } = await query
    if (error) throw new Error(`Could not read ${table}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

async function main(): Promise<void> {
  const sourcePath = join(
    process.cwd(), "scripts", "provider-evaluation", "api-football",
    ".local", "active-top5", "teams.json",
  )
  const teams = JSON.parse(readFileSync(sourcePath, "utf8")) as CachedCurrentTeam[]
  if (!Array.isArray(teams)) throw new Error("Cached current team list is malformed")

  const [clubRefs, leagueRefs] = await Promise.all([
    fetchAll<ExternalClubId>("club_external_ids", "club_id,provider,external_id"),
    fetchAll<ExternalLeagueId>("league_external_ids", "league_id,provider,external_id"),
  ])
  const target = mapCachedCurrentTeams(teams, clubRefs, leagueRefs)
  if (target.length !== teams.length) throw new Error("Cached teams do not map one-to-one to clubs")

  const supportedLeagueIds = new Set(target.map(row => row.league_id))
  const targetByClub = new Map(target.map(row => [row.club_id, row]))
  const current = await fetchAll<ClubLeagueMembership & { id: number }>(
    "club_league_memberships", "id,club_id,league_id,season,is_current", true,
  )
  // Clear memberships displaced by this complete top-five snapshot before upsert.
  // Other leagues outside the supported catalog remain untouched.
  const staleIds = current.filter(row => {
    if (!supportedLeagueIds.has(row.league_id) && !targetByClub.has(row.club_id)) return false
    const wanted = targetByClub.get(row.club_id)
    return !wanted || wanted.league_id !== row.league_id || wanted.season !== row.season
  }).map(row => row.id)

  for (let i = 0; i < staleIds.length; i += 500) {
    const { error } = await supabase.from("club_league_memberships")
      .update({ is_current: false }).in("id", staleIds.slice(i, i + 500))
    if (error) throw new Error(`Could not clear stale memberships: ${error.message}`)
  }

  for (let i = 0; i < target.length; i += 500) {
    const { error } = await supabase.from("club_league_memberships")
      .upsert(target.slice(i, i + 500), { onConflict: "club_id,league_id,season" })
    if (error) throw new Error(`Could not import current memberships: ${error.message}`)
  }

  const saved = await fetchAll<ClubLeagueMembership>(
    "club_league_memberships", "club_id,league_id,season,is_current", true,
  )
  const savedByClub = new Map(saved.map(row => [row.club_id, row]))
  if (target.some(row => {
    const actual = savedByClub.get(row.club_id)
    return !actual || actual.league_id !== row.league_id || actual.season !== row.season
  })) {
    throw new Error("Current membership read-back does not match the source snapshot")
  }
  console.log(`Current top-five club memberships: ${target.length}`)
  console.log(`Stale memberships cleared: ${staleIds.length}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Import failed")
  process.exitCode = 1
})
