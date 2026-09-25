import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error("Missing Supabase server environment variables")
}

const supabase = createClient(url, key)

const file = path.join(
  process.cwd(),
  "scripts",
  "provider-evaluation",
  "api-football",
  ".local",
  "active-top5",
  "final-player-game-data.json",
)

const players = JSON.parse(fs.readFileSync(file, "utf8"))

const uniqueClubs = new Set<string>()
let clubSeasonRows = 0
let leagueSeasonRows = 0

for (const player of players) {
  for (const club of player.eligibleClubs ?? []) {
    uniqueClubs.add(club.teamExternalRef.externalId)
    clubSeasonRows += (club.seasons ?? []).length
  }

  for (const league of player.eligibleLeagues ?? []) {
    leagueSeasonRows += (league.seasons ?? []).length
  }
}

async function dbCount(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })

  if (error) throw error
  return count ?? 0
}

async function main() {
  const expected = {
    players: players.length,
    clubs: uniqueClubs.size,
    leagues: 5,
    playerClubHistory: clubSeasonRows,
    playerLeagueHistory: leagueSeasonRows,
  }

  const actual = {
    players: await dbCount("players"),
    clubs: await dbCount("clubs"),
    leagues: await dbCount("leagues"),
    playerClubHistory: await dbCount("player_club_history"),
    playerLeagueHistory: await dbCount("player_league_history"),
  }

  console.log("----- SOURCE VS DATABASE -----")

  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    const ok = expected[key] === actual[key]

    console.log(
      `${key}: source=${expected[key]} db=${actual[key]} ${ok ? "OK" : "MISMATCH"}`,
    )
  }

  const allOk = Object.keys(expected).every(
    (key) =>
      expected[key as keyof typeof expected] ===
      actual[key as keyof typeof actual],
  )

  console.log("")
  console.log(allOk ? "ALL COUNTS MATCH" : "COUNT MISMATCH FOUND")

  if (!allOk) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
