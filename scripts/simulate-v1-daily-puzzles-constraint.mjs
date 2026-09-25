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

  const arg = args.find(
    (value) =>
      value.startsWith(prefix),
  )

  if (!arg) return fallback

  const value = Number(
    arg.slice(prefix.length),
  )

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new Error(
      `Invalid --${name}`,
    )
  }

  return Math.floor(value)
}

const target =
  numberArg("target", 100)

const maxRowAttempts =
  numberArg(
    "maxRowAttempts",
    10000,
  )

function criterionType(
  criterion,
) {
  return (
    criterion.type ??
    criterion.kind ??
    criterion.key
      ?.split(":")[0]
  )
}

function criterionValue(
  criterion,
) {
  return criterion.key
    ?.split(":")
    .slice(1)
    .join(":")
}

function criterionLabel(
  criterion,
) {
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
    criterionType(
      criterion,
    )

  const value =
    criterionValue(
      criterion,
    )

  if (type === "club") {
    return (
      player.clubs?.includes(
        value,
      ) ?? false
    )
  }

  if (type === "league") {
    return (
      player.leagues?.includes(
        value,
      ) ?? false
    )
  }

  if (type === "nation") {
    return (
      player.nation ===
      value
    )
  }

  if (
    type === "position"
  ) {
    return (
      player.positions?.includes(
        value,
      ) ?? false
    )
  }

  throw new Error(
    `Unknown criterion type: ${type}`,
  )
}

function allowedPair(
  left,
  right,
) {
  const leftType =
    criterionType(left)

  const rightType =
    criterionType(right)

  if (
    leftType === "nation" &&
    rightType === "nation"
  ) {
    return false
  }

  if (
    leftType === "position" &&
    rightType === "position"
  ) {
    return false
  }

  return true
}

function shuffle(values) {
  const result =
    [...values]

  for (
    let i =
      result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1),
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

async function supabase(
  pathname,
) {
  const response =
    await fetch(
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

function buildSupportMap(
  criteria,
) {
  const map =
    new Map()

  for (
    const criterion of
    criteria
  ) {
    const ids = []

    for (
      const player of
      players
    ) {
      if (
        playerMatches(
          player,
          criterion,
        )
      ) {
        ids.push(
          player.id,
        )
      }
    }

    map.set(
      criterion.key,
      new Set(ids),
    )
  }

  return map
}

function pairKey(
  leftKey,
  rightKey,
) {
  return leftKey <
    rightKey
    ? `${leftKey}|||${rightKey}`
    : `${rightKey}|||${leftKey}`
}

function intersection(
  left,
  right,
) {
  const smaller =
    left.size <=
    right.size
      ? left
      : right

  const larger =
    smaller === left
      ? right
      : left

  const result = []

  for (
    const id of smaller
  ) {
    if (
      larger.has(id)
    ) {
      result.push(id)
    }
  }

  return result
}

function buildPairMap(
  criteria,
  supportMap,
) {
  const map =
    new Map()

  for (
    let i = 0;
    i < criteria.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < criteria.length;
      j++
    ) {
      const left =
        criteria[i]

      const right =
        criteria[j]

      if (
        !allowedPair(
          left,
          right,
        )
      ) {
        continue
      }

      const candidates =
        intersection(
          supportMap.get(
            left.key,
          ),
          supportMap.get(
            right.key,
          ),
        )

      map.set(
        pairKey(
          left.key,
          right.key,
        ),
        {
          count:
            candidates.length,

          candidates,
        },
      )
    }
  }

  return map
}

function getPair(
  pairMap,
  left,
  right,
) {
  return (
    pairMap.get(
      pairKey(
        left.key,
        right.key,
      ),
    ) ?? {
      count: 0,
      candidates: [],
    }
  )
}

function hardCount(
  counts,
) {
  return counts.filter(
    (count) =>
      count >= 3 &&
      count <= 5,
  ).length
}

function easyCount(
  counts,
) {
  return counts.filter(
    (count) =>
      count >= 11,
  ).length
}

function hasAxisDiversity(
  criteria,
) {
  return (
    new Set(
      criteria.map(
        (criterion) =>
          criterionType(
            criterion,
          ),
      ),
    ).size >= 2
  )
}

function findColumnOptions(
  rows,
  criteria,
  pairMap,
) {
  const rowKeys =
    new Set(
      rows.map(
        (row) => row.key,
      ),
    )

  const options = []

  for (
    const column of
    criteria
  ) {
    if (
      rowKeys.has(
        column.key,
      )
    ) {
      continue
    }

    const cells =
      rows.map(
        (row) =>
          getPair(
            pairMap,
            row,
            column,
          ),
      )

    /*
      Hard requirement:
      every resulting cell
      must have >= 3 solutions.
    */
    if (
      cells.some(
        (cell) =>
          cell.count < 3,
      )
    ) {
      continue
    }

    const counts =
      cells.map(
        (cell) =>
          cell.count,
      )

    options.push({
      criterion:
        column,

      cells,

      counts,

      hard:
        hardCount(
          counts,
        ),

      easy:
        easyCount(
          counts,
        ),
    })
  }

  /*
    Shuffle so we don't keep
    generating the exact same
    columns.
  */
  return shuffle(options)
}

function chooseColumns(
  options,
) {
  const selected = []

  function search(
    startIndex,
    totalHard,
    totalEasy,
  ) {
    if (
      selected.length === 3
    ) {
      const selectedCriteria =
        selected.map(
          (option) =>
            option.criterion,
        )

      if (
        totalHard <= 1 &&
        totalEasy >= 2 &&
        hasAxisDiversity(
          selectedCriteria,
        )
      ) {
        return [
          ...selected,
        ]
      }

      return null
    }

    const remainingNeeded =
      3 -
      selected.length

    if (
      options.length -
        startIndex <
      remainingNeeded
    ) {
      return null
    }

    for (
      let i = startIndex;
      i < options.length;
      i++
    ) {
      const option =
        options[i]

      const nextHard =
        totalHard +
        option.hard

      if (
        nextHard > 1
      ) {
        continue
      }

      selected.push(
        option,
      )

      const result =
        search(
          i + 1,
          nextHard,
          totalEasy +
            option.easy,
        )

      if (result) {
        return result
      }

      selected.pop()
    }

    return null
  }

  return search(
    0,
    0,
    0,
  )
}

function buildCells(
  rows,
  columnOptions,
) {
  const cells = []

  for (
    let columnIndex = 0;
    columnIndex <
      columnOptions.length;
    columnIndex++
  ) {
    const column =
      columnOptions[
        columnIndex
      ]

    for (
      let rowIndex = 0;
      rowIndex <
        rows.length;
      rowIndex++
    ) {
      const pair =
        column.cells[
          rowIndex
        ]

      cells.push({
        rowIndex,
        columnIndex,

        row:
          rows[rowIndex],

        column:
          column.criterion,

        count:
          pair.count,

        candidates:
          pair.candidates,
      })
    }
  }

  /*
    Normalize to ordinary
    row-major 3x3 order.
  */
  return cells.sort(
    (a, b) =>
      a.rowIndex -
        b.rowIndex ||
      a.columnIndex -
        b.columnIndex,
  )
}

function findDistinctAssignment(
  cells,
) {
  const ordered =
    [...cells].sort(
      (a, b) =>
        a.candidates.length -
        b.candidates.length,
    )

  const used =
    new Set()

  const assignment =
    new Map()

  function search(index) {
    if (
      index ===
      ordered.length
    ) {
      return true
    }

    const cell =
      ordered[index]

    for (
      const playerId of
      cell.candidates
    ) {
      if (
        used.has(
          playerId,
        )
      ) {
        continue
      }

      used.add(
        playerId,
      )

      assignment.set(
        `${cell.rowIndex}:${cell.columnIndex}`,
        playerId,
      )

      if (
        search(
          index + 1,
        )
      ) {
        return true
      }

      assignment.delete(
        `${cell.rowIndex}:${cell.columnIndex}`,
      )

      used.delete(
        playerId,
      )
    }

    return false
  }

  if (
    !search(0)
  ) {
    return null
  }

  return assignment
}

function puzzleOutput(
  rows,
  columns,
  cells,
) {
  return {
    rows:
      rows.map(
        (criterion) => ({
          key:
            criterion.key,

          label:
            criterionLabel(
              criterion,
            ),

          type:
            criterionType(
              criterion,
            ),
        }),
      ),

    columns:
      columns.map(
        (option) => ({
          key:
            option.criterion.key,

          label:
            criterionLabel(
              option.criterion,
            ),

          type:
            criterionType(
              option.criterion,
            ),
        }),
      ),

    matrix: [
      cells
        .slice(0, 3)
        .map(
          (cell) =>
            cell.count,
        ),

      cells
        .slice(3, 6)
        .map(
          (cell) =>
            cell.count,
        ),

      cells
        .slice(6, 9)
        .map(
          (cell) =>
            cell.count,
        ),
    ],

    counts:
      cells.map(
        (cell) =>
          cell.count,
      ),
  }
}

async function main() {
  console.log(
    "Loading Top-5 club memberships...",
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

  /*
    V1 curated club criterion pool.

    Club career eligibility remains untouched.
    This ONLY controls which clubs may appear
    as puzzle headers.
  */
  const curatedClubNames = new Set([
    "arsenal",
    "chelsea",
    "liverpool",
    "manchester city",
    "manchester united",
    "tottenham hotspur",
    "tottenham",

    "bayern munich",
    "bayern munchen",
    "fc bayern munich",
    "borussia dortmund",
    "bayer leverkusen",
    "bayer 04 leverkusen",
    "rb leipzig",
    "eintracht frankfurt",
    "schalke 04",
    "fc schalke 04",

    "real madrid",
    "barcelona",
    "fc barcelona",
    "atletico madrid",
    "atlÃƒÂ©tico madrid",
    "sevilla",
    "sevilla fc",
    "valencia",
    "valencia cf",
    "athletic club",
    "athletic bilbao",

    "inter",
    "internazionale",
    "inter milan",
    "ac milan",
    "milan",
    "juventus",
    "roma",
    "as roma",
    "napoli",
    "ssc napoli",
    "lazio",
    "ss lazio",

    "paris saint-germain",
    "paris saint germain",
    "psg",
    "marseille",
    "olympique marseille",
    "olympique de marseille",
    "lyon",
    "olympique lyonnais",
    "monaco",
    "as monaco",
    "lille",
    "losc lille",
    "rennes",
    "stade rennais",
  ])

  function normalizeClubName(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

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

        if (
          !top5ClubIds.has(
            criterionValue(
              criterion,
            ),
          )
        ) {
          return false
        }

        return curatedClubNames.has(
          normalizeClubName(
            criterionLabel(
              criterion,
            ),
          ),
        )
      },
    )

  const selectedClubCriteria =
    criteria.filter(
      (criterion) =>
        criterionType(
          criterion,
        ) === "club",
    )

  console.log(
    `Curated clubs matched: ${selectedClubCriteria.length}`,
  )

  console.log(
    selectedClubCriteria
      .map(
        (criterion) =>
          criterionLabel(
            criterion,
          ),
      )
      .sort()
      .join("\n"),
  )

  if (
    selectedClubCriteria.length !== 30
  ) {
    throw new Error(
      `Expected 30 curated clubs, matched ${selectedClubCriteria.length}. Check runtime club labels above.`,
    )
  }

  console.log(
    `Generator criteria: ${criteria.length}`,
  )

  console.log(
    "Building criterion support...",
  )

  const supportMap =
    buildSupportMap(
      criteria,
    )

  console.log(
    "Precomputing pair intersections...",
  )

  const pairMap =
    buildPairMap(
      criteria,
      supportMap,
    )

  console.log(
    `Precomputed pairs: ${pairMap.size}`,
  )

  console.log("")
  console.log(
    `Generating ${target} V1 puzzles...`,
  )

  const accepted = []

  const fingerprints =
    new Set()

  let rowAttempts = 0

  let rejectedAxisRows = 0
  let rejectedNoColumns = 0
  let rejectedDifficulty = 0
  let rejectedDistinct = 0
  let rejectedDuplicate = 0

  while (
    accepted.length <
      target &&
    rowAttempts <
      maxRowAttempts
  ) {
    rowAttempts++

    /*
      Rows themselves do not
      intersect each other, so
      any three distinct criteria
      are initially possible.
    */
    const rows =
      shuffle(
        criteria,
      ).slice(0, 3)

    const rowKeys =
      new Set(
        rows.map(
          (row) =>
            row.key,
        ),
      )

    if (
      rowKeys.size !== 3
    ) {
      continue
    }

    /*
      Interestingness:
      an axis may not consist
      entirely of the same
      criterion type.
    */
    if (
      !hasAxisDiversity(
        rows,
      )
    ) {
      rejectedAxisRows++
      continue
    }

    const columnOptions =
      findColumnOptions(
        rows,
        criteria,
        pairMap,
      )

    if (
      columnOptions.length <
      3
    ) {
      rejectedNoColumns++
      continue
    }

    const selectedColumns =
      chooseColumns(
        columnOptions,
      )

    if (
      !selectedColumns
    ) {
      rejectedDifficulty++
      continue
    }

    const cells =
      buildCells(
        rows,
        selectedColumns,
      )

    const counts =
      cells.map(
        (cell) =>
          cell.count,
      )

    /*
      Final defensive check.
    */
    if (
      counts.some(
        (count) =>
          count < 3,
      ) ||
      hardCount(
        counts,
      ) > 1 ||
      counts.filter(
        (count) =>
          count >= 3 &&
          count <= 10,
      ).length < 1 ||
      easyCount(
        counts,
      ) < 2
    ) {
      rejectedDifficulty++
      continue
    }

    const assignment =
      findDistinctAssignment(
        cells,
      )

    if (!assignment) {
      rejectedDistinct++
      continue
    }

    /*
      Treat row/column order as
      part of presentation, but
      prevent identical criterion
      sets from being accepted
      repeatedly.
    */
    const fingerprint =
      [
        ...rows
          .map(
            (row) =>
              row.key,
          )
          .sort(),

        "::",

        ...selectedColumns
          .map(
            (column) =>
              column
                .criterion
                .key,
          )
          .sort(),
      ].join("|")

    if (
      fingerprints.has(
        fingerprint,
      )
    ) {
      rejectedDuplicate++
      continue
    }

    fingerprints.add(
      fingerprint,
    )

    accepted.push(
      puzzleOutput(
        rows,
        selectedColumns,
        cells,
      ),
    )
  }

  const allCounts =
    accepted.flatMap(
      (puzzle) =>
        puzzle.counts,
    )

  const summary = {
    rowAttempts,

    accepted:
      accepted.length,

    successRate:
      rowAttempts
        ? `${(
            accepted.length /
            rowAttempts *
            100
          ).toFixed(2)}%`
        : "0.00%",

    rejectedAxisRows,

    rejectedNoColumns,

    rejectedDifficulty,

    rejectedDistinct,

    rejectedDuplicate,
  }

  console.log("")
  console.log(
    "----- SIMULATION SUMMARY -----",
  )

  console.table(
    summary,
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
    let index = 0;
    index <
      Math.min(
        accepted.length,
        10,
      );
    index++
  ) {
    const puzzle =
      accepted[index]

    console.log("")
    console.log(
      `Puzzle ${index + 1}`,
    )

    console.log(
      "Rows:",
      puzzle.rows
        .map(
          (criterion) =>
            `${criterion.label} (${criterion.type})`,
        )
        .join(" | "),
    )

    console.log(
      "Columns:",
      puzzle.columns
        .map(
          (criterion) =>
            `${criterion.label} (${criterion.type})`,
        )
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
      "difficulty-v1-constraint-simulation.json",
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

          minimumCriterionTypesPerAxis:
            2,

          clubCriteria:
            "current Top-5 league clubs only",
        },

        summary,

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