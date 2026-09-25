import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY")
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

async function count(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })

  if (error) {
    throw new Error(`${table}: ${error.message}`)
  }

  return count ?? 0
}

async function main() {
  const tables = [
    "players",
    "player_external_ids",
    "clubs",
    "club_external_ids",
    "leagues",
    "league_external_ids",
    "player_club_history",
    "player_league_history",
  ]

  console.log("----- DATABASE COUNTS -----")

  for (const table of tables) {
    console.log(`${table}: ${await count(table)}`)
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select(`
      id,
      runtime_key,
      name,
      player_external_ids (
        provider,
        external_id
      )
    `)
    .limit(1)
    .single()

  if (playerError) {
    throw playerError
  }

  console.log("")
  console.log("----- SAMPLE PLAYER -----")
  console.log(JSON.stringify(player, null, 2))

  const { data: history, error: historyError } = await supabase
    .from("player_club_history")
    .select(`
      season,
      players (
        id,
        name
      ),
      clubs (
        id,
        name
      )
    `)
    .limit(1)
    .single()

  if (historyError) {
    throw historyError
  }

  console.log("")
  console.log("----- SAMPLE CLUB HISTORY -----")
  console.log(JSON.stringify(history, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
