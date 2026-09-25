import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error("Missing Supabase server environment variables")
}

const supabase = createClient(url, key)

const sourcePath = path.join(
  process.cwd(),
  "scripts",
  "provider-evaluation",
  "api-football",
  ".local",
  "active-top5",
  "final-player-game-data.json",
)

const players = JSON.parse(
  fs.readFileSync(sourcePath, "utf8"),
)

async function fetchAll(table: string, columns: string) {
  const result: any[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)

    if (error) throw error

    result.push(...(data ?? []))

    if ((data ?? []).length < pageSize) {
      break
    }
  }

  return result
}

async function main() {
  const dbPlayers = await fetchAll(
    "players",
    "id,runtime_key",
  )

  const clubExternalIds = await fetchAll(
    "club_external_ids",
    "club_id,provider,external_id",
  )

  const playerIds = new Map(
    dbPlayers.map((player) => [
      player.runtime_key,
      player.id,
    ]),
  )

  const clubIds = new Map(
    clubExternalIds
      .filter((row) => row.provider === "api-football")
      .map((row) => [
        row.external_id,
        row.club_id,
      ]),
  )

  const rows = new Map<string, any>()

  for (const player of players) {
    const playerId = playerIds.get(player.runtimeKey)

    if (!playerId) {
      throw new Error(
        `Missing player UUID for ${player.runtimeKey}`,
      )
    }

    for (const currentClub of player.currentClubs ?? []) {
      const externalId =
        currentClub.teamExternalRef.externalId

      const clubId = clubIds.get(externalId)

      if (!clubId) {
        throw new Error(
          `Current club ${externalId} is missing from Supabase clubs`,
        )
      }

      const row = {
        player_id: playerId,
        club_id: clubId,
        season: currentClub.season ?? null,
        evidence_type:
          currentClub.membershipEvidenceType ?? null,
      }

      rows.set(`${playerId}:${clubId}`, row)
    }
  }

  const values = [...rows.values()]

  for (let i = 0; i < values.length; i += 500) {
    const batch = values.slice(i, i + 500)

    const { error } = await supabase
      .from("player_current_clubs")
      .upsert(batch, {
        onConflict: "player_id,club_id",
      })

    if (error) throw error
  }

  console.log(
    `Current club relationships imported: ${values.length}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
