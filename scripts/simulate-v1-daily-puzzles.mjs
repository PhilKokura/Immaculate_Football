import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const players = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "components",
      "data",
      "runtime_players.json",
    ),
    "utf8",
  ),
)

const allCriteria = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "components",
      "data",
      "runtime_criteria.json",
    ),
    "utf8",
  ),
)

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase environment variables",
  )
}

const args = process.argv.slice(2)

function numberArg(name, fallback) {
  const prefix = `--${name}=`

  const value = args.find((arg) =>
    arg.startsWith(prefix),
  )

  if (!value) return fallback

  const parsed = Number(
    value.slice(prefix.length),
  )

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `Invalid --${name}`,
    )
  }

  return Math.floor(parsed)
}

const target =
  numberArg("target", 100)

const maxAttempts =
  numberArg("maxAttempts", 100000)

function criterionType(criterion) {
  return (
    criterion.type ??
    criterion.kind ??
    criterion.key?.split(":")[0]
  )
}

function criterionValue(criterion) {
  return criterion.key
    ?.split(":")
    .slice(1)
    .join(":")
}

function criterionLabel(criterion) {
  return (
    criterion.label ??
    criterion.name ??
    criterion.key
  )
}

function playerMatches(
  player,
  criterion,
) {
  const type =
    criterionType(criterion)

  const value =
    criterionValue(criterion)

  if (type === "club") {
    return (
      player.clubs?.includes(value) ??
      false
    )
  }

  if (type === "league") {
    return (
      player.leagues?.includes(value) ??
      false
    )
  }

  if (type === "nation") {
    return player.nation === value
  }

  if (type === "position") {
    return (
      player.positions?.includes(value) ??
      false
    )
  }

  throw new Error(
    `Unknown criterion type: ${type}`,
  )
}

function allowedPair(a, b) {
  const aType =
    criterionType(a)

  const bType =
    criterionType(b)

  if (
    aType === "nation" &&
    bType === "nation"
  ) {
    return false
  }

  if (
    aType === "position" &&
    bType === "position"
  ) {
    return false
  }

  return true
}

function shuffled(values) {
  const result = [...values]

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() * (i + 1),
      )

    ;[
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ]
  }

  return result
}

async function supabase(pathname) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${pathname}`,
    {
      headers: {
        apikey:
          SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,
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

function buildCandidateMap(criteria) {
  const map = new Map()

  for (const criterion of criteria) {
    const ids = []

    for (const player of players) {
      if (
        playerMatches(
          player,
          criterion,
        )
      ) {
        ids.push(player.id)
      }
    }

    map.set(
      criterion.key,
      new Set(ids),
    )
  }

  return map
}

function intersection(
  leftSet,
  rightSet,
) {
  const smaller =
    leftSet.size <= rightSet.size
      ? leftSet
      : rightSet

  const larger =
    smaller === leftSet
      ? rightSet
      : leftSet

  const result = []

  for (const id of smaller) {
    if (larger.has(id)) {
      result.push(id)
    }
  }

  return result
}

function buildCells(
  rows,
  columns,
  supportMap,
) {
  const cells = []

  for (
    let rowIndex = 0;
    rowIndex < 3;
    rowIndex++
  ) {
    for (
      let columnIndex = 0;
      columnIndex < 3;
      columnIndex++
    ) {
      const row =
        rows[rowIndex]

      const column =
        columns[columnIndex]

      const candidates =
        intersection(
          supportMap.get(row.key),
          supportMap.get(column.key),
        )

      cells.push({
        index:
          rowIndex * 3 +
          columnIndex,

        row,
        column,
        candidates,
        count:
          candidates.length,
      })
    }
  }

  return cells
}

function hasDistinctAssignment(
  cells,
) {
  /*
    Solve hardest cells first.
    This is only a feasibility check:
    can all 9 cells use distinct players?
  */
  const ordered = [...cells]
    .sort(
      (a, b) =>
        a.candidates.length -
        b.candidates.length,
    )

  const used =
    new Set()

  function search(index) {
    if (
      index === ordered.length
    ) {
      return true
    }

    for (
      const playerId of
      ordered[index].candidates
    ) {
      if (
        used.has(playerId)
      ) {
        continue
      }

      used.add(playerId)

      if (
        search(index + 1)
      ) {
        return true
      }

      used.delete(playerId)
    }

    return false
  }

  return search(0)
}

function passesV1Difficulty(
  cells,
) {
  /*
    V1 Daily rules:

    - no cell below 3 solutions
    - at most one cell with 3-5
    - at least two cells with 11+
  */

  if (
    cells.some(
      (cell) =>
        cell.count < 3,
    )
  ) {
    return false
  }

  const hard =
    cells.filter(
      (cell) =>
        cell.count >= 3 &&
        cell.count <= 5,
    ).length

  if (hard > 1) {
    return false
  }

  const easy =
    cells.filter(
      (cell) =>
        cell.count >= 11,
    ).length

  if (easy < 2) {
    return false
  }

  return true
}

function randomPuzzle(criteria) {
  /*
    Pick six distinct criteria.
    Retry until every row x column
    combination obeys forbidden-pair
    rules.
  */

  for (
    let attempt = 0;
    attempt < 100;
    attempt++
  ) {
    const selected =
      shuffled(criteria)
        .slice(0, 6)

    const rows =
      selected.slice(0, 3)

    const columns =
      selected.slice(3, 6)

    let valid = true

    for (const row of rows) {
      for (
        const column of columns
      ) {
        if (
          !allowedPair(
            row,
            column,
          )
        ) {
          valid = false
          break
        }
      }

      if (!valid) break
    }

    if (valid) {
      return {
        rows,
        columns,
      }
    }
  }

  return null
}

function puzzleForOutput(
  puzzle,
  cells,
) {
  return {
    rows:
      puzzle.rows.map(
        (criterion) => ({
          key:
            criterion.key,
          label:
            criterionLabel(
              criterion,
            ),
        }),
      ),

    columns:
      puzzle.columns.map(
        (criterion) => ({
          key:
            criterion.key,
          label:
            criterionLabel(
              criterion,
            ),
        }),
      ),

    counts:
      cells.map(
        (cell) =>
          cell.count,
      ),

    matrix: [
      cells
        .slice(0, 3)
        .map((c) => c.count),

      cells
        .slice(3, 6)
        .map((c) => c.count),

      cells
        .slice(6, 9)
        .map((c) => c.count),
    ],
  }
}

async function main() {
  console.log(
    "Loading current Top-5 club memberships...",
  )

  const memberships =
    await supabase(
      "club_league_memberships" +
      "?select=club_id" +
      "&is_current=eq.true",
    )

  const top5ClubIds =
    new Set(
      memberships.map(
        (row) =>
          row.club_id,
      ),
    )

  const criteria =
    allCriteria.filter(
      (criterion) => {
        if (
          criterionType(
            criterion,
          ) !== "club"
        ) {
          return true
        }

        return top5ClubIds.has(
          criterionValue(
            criterion,
          ),
        )
      },
    )

  console.log(
    `Generator criteria: ${criteria.length}`,
  )

  console.log(
    "Precomputing criterion support...",
  )

  const supportMap =
    buildCandidateMap(
      criteria,
    )

  console.log(
    `Simulating until ${target} V1 puzzles are accepted...`,
  )

  const accepted = []

  let attempts = 0
  let rejectedForbidden = 0
  let rejectedDifficulty = 0
  let rejectedDistinct = 0

  while (
    accepted.length < target &&
    attempts < maxAttempts
  ) {
    attempts++

    const puzzle =
      randomPuzzle(criteria)

    if (!puzzle) {
      rejectedForbidden++
      continue
    }

    const cells =
      buildCells(
        puzzle.rows,
        puzzle.columns,
        supportMap,
      )

    if (
      !passesV1Difficulty(
        cells,
      )
    ) {
      rejectedDifficulty++
      continue
    }

    if (
      !hasDistinctAssignment(
        cells,
      )
    ) {
      rejectedDistinct++
      continue
    }

    accepted.push(
      puzzleForOutput(
        puzzle,
        cells,
      ),
    )
  }

  const acceptanceRate =
    attempts
      ? (
          accepted.length /
          attempts *
          100
        ).toFixed(2)
      : "0.00"

  console.log("")
  console.log(
    "----- SIMULATION SUMMARY -----",
  )

  console.table({
    attempts,
    accepted:
      accepted.length,

    acceptanceRate:
      `${acceptanceRate}%`,

    rejectedDifficulty,

    rejectedDistinct,

    rejectedForbidden,
  })

  const allCounts =
    accepted.flatMap(
      (puzzle) =>
        puzzle.counts,
    )

  console.log("")
  console.log(
    "----- ACCEPTED CELL DISTRIBUTION -----",
  )

  console.table({
    totalCells:
      allCounts.length,

    threeToFive:
      allCounts.filter(
        (n) =>
          n >= 3 &&
          n <= 5,
      ).length,

    sixToTen:
      allCounts.filter(
        (n) =>
          n >= 6 &&
          n <= 10,
      ).length,

    elevenPlus:
      allCounts.filter(
        (n) =>
          n >= 11,
      ).length,
  })

  console.log("")
  console.log(
    "----- FIRST 10 ACCEPTED PUZZLES -----",
  )

  for (
    let i = 0;
    i <
      Math.min(
        accepted.length,
        10,
      );
    i++
  ) {
    const puzzle =
      accepted[i]

    console.log("")
    console.log(
      `Puzzle ${i + 1}`,
    )

    console.log(
      "Rows:",
      puzzle.rows
        .map((c) => c.label)
        .join(" | "),
    )

    console.log(
      "Columns:",
      puzzle.columns
        .map((c) => c.label)
        .join(" | "),
    )

    console.table(
      puzzle.matrix,
    )
  }

  const outputPath =
    path.join(
      root,
      "scripts",
      "provider-evaluation",
      "difficulty-v1-simulation.json",
    )

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        rules: {
          minimumSolutionsPerCell:
            3,

          maximumCellsWith3To5:
            1,

          minimumCellsWith11Plus:
            2,

          distinctPlayersRequired:
            9,
        },

        summary: {
          attempts,
          accepted:
            accepted.length,
          acceptanceRate:
            Number(
              acceptanceRate,
            ),
          rejectedDifficulty,
          rejectedDistinct,
          rejectedForbidden,
        },

        puzzles:
          accepted,
      },
      null,
      2,
    ) + "\n",
  )

  console.log("")
  console.log(
    `Saved: ${outputPath}`,
  )
}

main().catch(
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)