import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

type PositionCode = "GK" | "DEF" | "MID" | "ATT"

type Override = {
  provider: string
  externalId: string
  positions: Array<{
    position: PositionCode
    isPrimary: boolean
  }>
  source: string
  note?: string
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY",
  )
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const file = path.join(
  process.cwd(),
  "data",
  "player-position-overrides.json",
)

const overrides = JSON.parse(
  fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
) as Override[]

function validateOverride(override: Override) {
  if (
    !override.provider ||
    !override.externalId ||
    !override.source
  ) {
    throw new Error(
      `Invalid override: missing provider/externalId/source`,
    )
  }

  if (!override.positions.length) {
    throw new Error(
      `Player ${override.provider}:${override.externalId} has no positions`,
    )
  }

  const valid = new Set([
    "GK",
    "DEF",
    "MID",
    "ATT",
  ])

  const seen = new Set<string>()

  for (const row of override.positions) {
    if (!valid.has(row.position)) {
      throw new Error(
        `Invalid position ${row.position} for ${override.provider}:${override.externalId}`,
      )
    }

    if (seen.has(row.position)) {
      throw new Error(
        `Duplicate position ${row.position} for ${override.provider}:${override.externalId}`,
      )
    }

    seen.add(row.position)
  }

  const primaryCount =
    override.positions.filter(
      (row) => row.isPrimary,
    ).length

  if (primaryCount !== 1) {
    throw new Error(
      `${override.provider}:${override.externalId} must have exactly one primary position`,
    )
  }
}

async function main() {
  console.log(
    `Position overrides: ${overrides.length}`,
  )

  if (!overrides.length) {
    console.log("Nothing to import.")
    return
  }

  for (const override of overrides) {
    validateOverride(override)

    const { data: mapping, error: mappingError } =
      await supabase
        .from("player_external_ids")
        .select("player_id")
        .eq("provider", override.provider)
        .eq("external_id", override.externalId)
        .maybeSingle()

    if (mappingError) {
      throw mappingError
    }

    if (!mapping) {
      throw new Error(
        `Player mapping not found: ${override.provider}:${override.externalId}`,
      )
    }

    const playerId = mapping.player_id

    /*
      Replace canonical positions completely.

      player_position_evidence rows attached to deleted
      canonical positions are removed automatically by
      the existing ON DELETE CASCADE relationship.
    */
    const { error: deleteError } =
      await supabase
        .from("player_positions")
        .delete()
        .eq("player_id", playerId)

    if (deleteError) {
      throw deleteError
    }

    const positionRows =
      override.positions.map((row) => ({
        player_id: playerId,
        position: row.position,
        is_primary: row.isPrimary,
      }))

    const { error: positionError } =
      await supabase
        .from("player_positions")
        .insert(positionRows)

    if (positionError) {
      throw positionError
    }

    const evidenceRows =
      override.positions.map((row) => ({
        player_id: playerId,
        position: row.position,
        source: override.source,
        source_position: override.note ?? null,
      }))

    const { error: evidenceError } =
      await supabase
        .from("player_position_evidence")
        .insert(evidenceRows)

    if (evidenceError) {
      throw evidenceError
    }

    console.log(
      `Updated ${override.provider}:${override.externalId} -> ${override.positions
        .map(
          (row) =>
            `${row.position}${row.isPrimary ? "*" : ""}`,
        )
        .join(", ")}`,
    )
  }

  console.log("")
  console.log(
    "Player position overrides imported successfully.",
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
