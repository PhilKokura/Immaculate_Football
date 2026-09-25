import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const players = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_players.json"),
    "utf8",
  ),
)

const allCriteria = JSON.parse(
  fs.readFileSync(
    path.join(root, "components", "data", "runtime_criteria.json"),
    "utf8",
  ),
)

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase environment variables")
}

async function supabase(pathname) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${pathname}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${await response.text()}`,
    )
  }

  return response.json()
}

function criterionType(criterion) {
  return criterion.type ??
    criterion.kind ??
    criterion.key?.split(":")[0]
}

function criterionId(criterion) {
  return criterion.key?.split(":").slice(1).join(":")
}

function criterionLabel(criterion) {
  return criterion.label ??
    criterion.name ??
    criterion.key
}

function playerMatches(player, criterion) {
  const type = criterionType(criterion)
  const value = criterionId(criterion)

  if (type === "club") {
    return player.clubs?.includes(value) ?? false
  }

  if (type === "league") {
    return player.leagues?.includes(value) ?? false
  }

  if (type === "nation") {
    return player.nation === value
  }

  if (type === "position") {
    return player.positions?.includes(value) ?? false
  }

  throw new Error(`Unknown criterion type: ${type}`)
}

function percentile(sorted, p) {
  if (!sorted.length) return null

  const index = Math.floor((sorted.length - 1) * p)
  return sorted[index]
}

function stats(values) {
  if (!values.length) return null

  const sorted = [...values].sort((a, b) => a - b)

  return {
    min: sorted[0],
    p10: percentile(sorted, 0.10),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.50),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.90),
    max: sorted.at(-1),
  }
}

function intersectionCount(a, b) {
  let count = 0

  for (const player of players) {
    if (
      playerMatches(player, a) &&
      playerMatches(player, b)
    ) {
      count++
    }
  }

  return count
}

function analyzePairing(name, left, right, sameGroup = false) {
  const counts = []

  if (sameGroup) {
    for (let i = 0; i < left.length; i++) {
      for (let j = i + 1; j < left.length; j++) {
        counts.push(
          intersectionCount(left[i], left[j]),
        )
      }
    }
  } else {
    for (const a of left) {
      for (const b of right) {
        counts.push(
          intersectionCount(a, b),
        )
      }
    }
  }

  const positive = counts.filter((count) => count > 0)

  console.log("")
  console.log(name)

  console.log({
    positivePairs: positive.length,
    zero: counts.filter((n) => n === 0).length,
    one: counts.filter((n) => n === 1).length,
    two: counts.filter((n) => n === 2).length,
    threeToFive: counts.filter((n) => n >= 3 && n <= 5).length,
    sixToTen: counts.filter((n) => n >= 6 && n <= 10).length,
    elevenPlus: counts.filter((n) => n >= 11).length,
    positiveStats: stats(positive),
  })
}

async function main() {
  const memberships = await supabase(
    "club_league_memberships" +
    "?select=club_id,league_id" +
    "&is_current=eq.true"
  )

  const currentTop5ClubIds = new Set(
    memberships.map((row) => row.club_id),
  )

  const criteria = allCriteria.filter((criterion) => {
    if (criterionType(criterion) !== "club") {
      return true
    }

    return currentTop5ClubIds.has(
      criterionId(criterion),
    )
  })

  const clubs = criteria.filter(
    (c) => criterionType(c) === "club",
  )

  const leagues = criteria.filter(
    (c) => criterionType(c) === "league",
  )

  const nations = criteria.filter(
    (c) => criterionType(c) === "nation",
  )

  const positions = criteria.filter(
    (c) => criterionType(c) === "position",
  )

  console.log("----- DATASET -----")
  console.log(`Players: ${players.length}`)
  console.log(`Current Top-5 clubs: ${clubs.length}`)
  console.log(`Leagues: ${leagues.length}`)
  console.log(`Nations: ${nations.length}`)
  console.log(`Positions: ${positions.length}`)
  console.log(`Generator criteria: ${criteria.length}`)

  console.log("")
  console.log("----- CRITERION SUPPORT -----")

  for (
    const [label, group] of [
      ["CLUB", clubs],
      ["LEAGUE", leagues],
      ["NATION", nations],
      ["POSITION", positions],
    ]
  ) {
    const support = group.map((criterion) =>
      players.filter((player) =>
        playerMatches(player, criterion)
      ).length
    )

    console.log("")
    console.log(`${label} (${group.length})`)
    console.log(stats(support))
  }

  console.log("")
  console.log("----- CELL INTERSECTIONS -----")

  analyzePairing(
    "club × club",
    clubs,
    clubs,
    true,
  )

  analyzePairing(
    "club × league",
    clubs,
    leagues,
  )

  analyzePairing(
    "club × nation",
    clubs,
    nations,
  )

  analyzePairing(
    "club × position",
    clubs,
    positions,
  )

  analyzePairing(
    "league × league",
    leagues,
    leagues,
    true,
  )

  analyzePairing(
    "league × nation",
    leagues,
    nations,
  )

  analyzePairing(
    "league × position",
    leagues,
    positions,
  )

  analyzePairing(
    "nation × position",
    nations,
    positions,
  )

  const mali = nations.find(
    (criterion) =>
      criterionLabel(criterion) === "Mali" ||
      criterion.key === "nation:Mali",
  )

  if (mali) {
    const others = criteria.filter(
      (criterion) =>
        criterion.key !== mali.key &&
        criterionType(criterion) !== "nation",
    )

    const intersections = others
      .map((criterion) => ({
        type: criterionType(criterion),
        label: criterionLabel(criterion),
        count: intersectionCount(
          mali,
          criterion,
        ),
      }))
      .filter((entry) => entry.count > 0)

    console.log("")
    console.log("----- MALI -----")

    console.log(
      `Support: ${
        players.filter((player) =>
          playerMatches(player, mali)
        ).length
      }`,
    )

    console.log(`Key: ${mali.key}`)
    console.log(
      `Positive intersections: ${intersections.length}`,
    )

    console.log("")
    console.log("Hardest Mali intersections:")

    console.table(
      [...intersections]
        .sort(
          (a, b) =>
            a.count - b.count ||
            a.label.localeCompare(b.label),
        )
        .slice(0, 20),
    )

    console.log("")
    console.log("Easiest Mali intersections:")

    console.table(
      [...intersections]
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.label.localeCompare(b.label),
        )
        .slice(0, 20),
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})