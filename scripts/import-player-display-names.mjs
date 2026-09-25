import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase server credentials",
  )
}

const planPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
  "player-display-name-final-plan.json",
)

const plan = JSON.parse(
  fs.readFileSync(
    planPath,
    "utf8",
  ),
)

const changes =
  plan.players.filter(
    player => player.changed,
  )

if (
  plan.summary.totalPlayers !== 2990 ||
  changes.length !== 675
) {
  throw new Error(
    `Unexpected plan: total=${plan.summary.totalPlayers}, changed=${changes.length}`,
  )
}

async function patchPlayer(
  player,
) {
  const url =
    `${SUPABASE_URL}/rest/v1/players?id=eq.${player.playerId}`

  const response =
    await fetch(
      url,
      {
        method: "PATCH",

        headers: {
          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation",
        },

        body: JSON.stringify({
          display_name:
            player.displayName,
        }),
      },
    )

  if (!response.ok) {
    throw new Error(
      `${player.playerId}: ${response.status} ${await response.text()}`,
    )
  }

  const rows =
    await response.json()

  if (rows.length !== 1) {
    throw new Error(
      `${player.playerId}: expected 1 updated row, got ${rows.length}`,
    )
  }
}

async function runPool(
  items,
  concurrency = 10,
) {
  let next = 0
  let completed = 0

  async function worker() {
    while (true) {
      const index = next++

      if (index >= items.length) {
        return
      }

      await patchPlayer(
        items[index],
      )

      completed++

      if (
        completed % 50 === 0 ||
        completed === items.length
      ) {
        console.log(
          `Updated ${completed}/${items.length}`,
        )
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: concurrency },
      () => worker(),
    ),
  )
}

async function verify() {
  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/players?select=id&display_name=not.is.null`,
      {
        headers: {
          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          Prefer:
            "count=exact",

          Range:
            "0-0",
        },
      },
    )

  if (!response.ok) {
    throw new Error(
      `Verification failed: ${response.status} ${await response.text()}`,
    )
  }

  const contentRange =
    response.headers.get(
      "content-range",
    )

  const count =
    Number(
      contentRange
        ?.split("/")
        .at(-1),
    )

  console.log("")
  console.log(
    "----- DISPLAY NAME IMPORT -----",
  )

  console.table({
    plannedChanges:
      changes.length,

    playersWithDisplayName:
      count,
  })

  if (count !== changes.length) {
    console.warn(
      `Expected ${changes.length} non-null display names, found ${count}.`,
    )
  }
}

async function main() {
  console.log("")
  console.log(
    `Importing ${changes.length} display names...`,
  )

  await runPool(
    changes,
    10,
  )

  await verify()
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})