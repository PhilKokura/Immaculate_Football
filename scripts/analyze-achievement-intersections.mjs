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

const criteria = JSON.parse(
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

const achievementData = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "scripts",
      "provider-evaluation",
      "api-football-trophies",
      "relevant-title-winners.json",
    ),
    "utf8",
  ),
)

const policySource = fs.readFileSync(
  path.join(
    root,
    "lib",
    "dailyPuzzleV1Policy.ts",
  ),
  "utf8",
)

/*
  The production V1 policy currently contains
  exactly the 30 curated club UUIDs.
*/
const uuidRegex =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

const curatedClubIds = new Set(
  [...policySource.matchAll(uuidRegex)]
    .map(
      (match) =>
        match[0].toLowerCase(),
    ),
)

if (
  curatedClubIds.size !== 30
) {
  throw new Error(
    `Expected 30 curated club UUIDs, found ${curatedClubIds.size}`,
  )
}

function criterionType(
  criterion,
) {
  return (
    criterion.type ??
    criterion.kind ??
    criterion.key?.split(":")[0]
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

function playerMatchesCriterion(
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
      player.nation === value
    )
  }

  if (type === "position") {
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

/*
  Build production base pool:
  30 clubs + 5 leagues + 4 positions.
*/
const clubs = criteria.filter(
  (criterion) =>
    criterionType(
      criterion,
    ) === "club" &&
    curatedClubIds.has(
      String(
        criterionValue(
          criterion,
        ),
      ).toLowerCase(),
    ),
)

const leagues = criteria.filter(
  (criterion) =>
    criterionType(
      criterion,
    ) === "league",
)

const positions = criteria.filter(
  (criterion) =>
    criterionType(
      criterion,
    ) === "position",
)

if (clubs.length !== 30) {
  throw new Error(
    `Expected 30 clubs, found ${clubs.length}`,
  )
}

if (leagues.length !== 5) {
  throw new Error(
    `Expected 5 leagues, found ${leagues.length}`,
  )
}

if (positions.length !== 4) {
  throw new Error(
    `Expected 4 positions, found ${positions.length}`,
  )
}

/*
  Recompute the current production nation pool.

  Nation rule:
  - >=15 active players
  - >=5 allowed countercriteria
    with >=5 eligible players

  Countercriteria:
  30 clubs + 5 leagues + 4 positions.
*/
const nationCounterCriteria = [
  ...clubs,
  ...leagues,
  ...positions,
]

const nationGroups =
  new Map()

for (const player of players) {
  if (!player.nation) {
    continue
  }

  if (
    !nationGroups.has(
      player.nation,
    )
  ) {
    nationGroups.set(
      player.nation,
      [],
    )
  }

  nationGroups
    .get(player.nation)
    .push(player)
}

const eligibleNationNames =
  new Set()

for (
  const [
    nation,
    nationPlayers,
  ] of nationGroups
) {
  if (
    nationPlayers.length < 15
  ) {
    continue
  }

  let qualifying =
    0

  for (
    const criterion of
    nationCounterCriteria
  ) {
    const count =
      nationPlayers.filter(
        (player) =>
          playerMatchesCriterion(
            player,
            criterion,
          ),
      ).length

    if (count >= 5) {
      qualifying++
    }
  }

  if (qualifying >= 5) {
    eligibleNationNames.add(
      nation,
    )
  }
}

const nations =
  criteria.filter(
    (criterion) =>
      criterionType(
        criterion,
      ) === "nation" &&
      eligibleNationNames.has(
        criterionValue(
          criterion,
        ),
      ),
  )

if (nations.length !== 26) {
  throw new Error(
    `Expected 26 production nations, found ${nations.length}`,
  )
}

console.log("")
console.log(
  "----- PRODUCTION V1 BASE POOL -----",
)

console.table({
  clubs:
    clubs.length,
  nations:
    nations.length,
  leagues:
    leagues.length,
  positions:
    positions.length,
  baseCriteria:
    clubs.length +
    nations.length +
    leagues.length +
    positions.length,
})

const playerById =
  new Map(
    players.map(
      (player) => [
        player.id,
        player,
      ],
    ),
  )

/*
  Create one Set<playerId> per achievement.
*/
const achievementSets =
  new Map()

for (
  const definition of
  achievementData.relevantTitles
) {
  achievementSets.set(
    definition.key,
    new Set(),
  )
}

for (
  const player of
  achievementData.players
) {
  if (
    !playerById.has(
      player.playerId,
    )
  ) {
    continue
  }

  for (
    const achievement of
    player.achievements
  ) {
    achievementSets
      .get(
        achievement.key,
      )
      ?.add(
        player.playerId,
      )
  }
}

const achievementLabels =
  new Map([
    [
      "world-cup-winner",
      "FIFA World Cup Winner",
    ],
    [
      "euro-winner",
      "UEFA European Championship Winner",
    ],
    [
      "copa-america-winner",
      "CONMEBOL Copa America Winner",
    ],
    [
      "champions-league-winner",
      "UEFA Champions League Winner",
    ],
    [
      "europa-league-winner",
      "UEFA Europa League Winner",
    ],
    [
      "premier-league-champion",
      "Premier League Champion",
    ],
    [
      "bundesliga-champion",
      "Bundesliga Champion",
    ],
    [
      "la-liga-champion",
      "La Liga Champion",
    ],
    [
      "serie-a-champion",
      "Serie A Champion",
    ],
    [
      "ligue-1-champion",
      "Ligue 1 Champion",
    ],
  ])

const baseCriteria = [
  ...clubs,
  ...nations,
  ...leagues,
  ...positions,
]

function intersectionCount(
  left,
  right,
) {
  const smaller =
    left.size <= right.size
      ? left
      : right

  const larger =
    smaller === left
      ? right
      : left

  let count = 0

  for (const id of smaller) {
    if (larger.has(id)) {
      count++
    }
  }

  return count
}

function criterionPlayerSet(
  criterion,
) {
  const result =
    new Set()

  for (const player of players) {
    if (
      playerMatchesCriterion(
        player,
        criterion,
      )
    ) {
      result.add(
        player.id,
      )
    }
  }

  return result
}

const baseSupport =
  new Map()

for (
  const criterion of
  baseCriteria
) {
  baseSupport.set(
    criterion.key,
    criterionPlayerSet(
      criterion,
    ),
  )
}

function bucketStats(
  rows,
) {
  return {
    positive:
      rows.filter(
        (row) =>
          row.count > 0,
      ).length,

    zero:
      rows.filter(
        (row) =>
          row.count === 0,
      ).length,

    oneTwo:
      rows.filter(
        (row) =>
          row.count >= 1 &&
          row.count <= 2,
      ).length,

    threeToFive:
      rows.filter(
        (row) =>
          row.count >= 3 &&
          row.count <= 5,
      ).length,

    sixToTen:
      rows.filter(
        (row) =>
          row.count >= 6 &&
          row.count <= 10,
      ).length,

    elevenPlus:
      rows.filter(
        (row) =>
          row.count >= 11,
      ).length,

    atLeast3:
      rows.filter(
        (row) =>
          row.count >= 3,
      ).length,

    atLeast5:
      rows.filter(
        (row) =>
          row.count >= 5,
      ).length,
  }
}

const reports = []

for (
  const [
    achievementKey,
    achievementSet,
  ] of achievementSets
) {
  const intersections =
    baseCriteria.map(
      (criterion) => ({
        type:
          criterionType(
            criterion,
          ),

        key:
          criterion.key,

        label:
          criterionLabel(
            criterion,
          ),

        count:
          intersectionCount(
            achievementSet,
            baseSupport.get(
              criterion.key,
            ),
          ),
      }),
    )

  const byType = {}

  for (
    const type of [
      "club",
      "nation",
      "league",
      "position",
    ]
  ) {
    byType[type] =
      bucketStats(
        intersections.filter(
          (row) =>
            row.type === type,
        ),
      )
  }

  const sortedPositive =
    intersections
      .filter(
        (row) =>
          row.count > 0,
      )
      .sort(
        (a, b) =>
          a.count -
            b.count ||
          a.label.localeCompare(
            b.label,
          ),
      )

  reports.push({
    key:
      achievementKey,

    label:
      achievementLabels.get(
        achievementKey,
      ) ??
      achievementKey,

    support:
      achievementSet.size,

    allBaseStats:
      bucketStats(
        intersections,
      ),

    byType,

    hardest:
      sortedPositive
        .slice(0, 15),

    easiest:
      [...sortedPositive]
        .reverse()
        .slice(0, 15),

    intersections,
  })
}

console.log("")
console.log(
  "----- ACHIEVEMENT SUPPORT + COVERAGE -----",
)

console.table(
  reports.map(
    (report) => ({
      Achievement:
        report.label,

      Players:
        report.support,

      "Base >=3":
        report.allBaseStats
          .atLeast3,

      "Base >=5":
        report.allBaseStats
          .atLeast5,

      "Base 3-5":
        report.allBaseStats
          .threeToFive,

      "Base 6-10":
        report.allBaseStats
          .sixToTen,

      "Base 11+":
        report.allBaseStats
          .elevenPlus,

      Zero:
        report.allBaseStats
          .zero,
    }),
  ),
)

console.log("")
console.log(
  "----- COVERAGE BY CRITERION TYPE -----",
)

for (
  const report of reports
) {
  console.log("")
  console.log(
    report.label,
  )

  console.table(
    Object.entries(
      report.byType,
    ).map(
      ([type, stats]) => ({
        Type:
          type,

        ">=3":
          stats.atLeast3,

        ">=5":
          stats.atLeast5,

        "6-10":
          stats.sixToTen,

        "11+":
          stats.elevenPlus,

        Zero:
          stats.zero,
      }),
    ),
  )
}

console.log("")
console.log(
  "----- ACHIEVEMENT × ACHIEVEMENT -----",
)

const achievementPairs = []

const achievementEntries =
  [...achievementSets.entries()]

for (
  let i = 0;
  i <
    achievementEntries.length;
  i++
) {
  for (
    let j = i + 1;
    j <
      achievementEntries.length;
    j++
  ) {
    const [
      leftKey,
      leftSet,
    ] =
      achievementEntries[i]

    const [
      rightKey,
      rightSet,
    ] =
      achievementEntries[j]

    achievementPairs.push({
      left:
        achievementLabels.get(
          leftKey,
        ) ?? leftKey,

      right:
        achievementLabels.get(
          rightKey,
        ) ?? rightKey,

      count:
        intersectionCount(
          leftSet,
          rightSet,
        ),
    })
  }
}

achievementPairs.sort(
  (a, b) =>
    b.count -
      a.count ||
    a.left.localeCompare(
      b.left,
    ),
)

console.table(
  achievementPairs,
)

console.log("")
console.log(
  "----- HARDEST POSITIVE BASE INTERSECTIONS -----",
)

for (
  const report of reports
) {
  console.log("")
  console.log(
    `${report.label} (${report.support} players)`,
  )

  console.table(
    report.hardest.map(
      (row) => ({
        Type:
          row.type,

        Criterion:
          row.label,

        Players:
          row.count,
      }),
    ),
  )
}

console.log("")
console.log(
  "----- EASIEST BASE INTERSECTIONS -----",
)

for (
  const report of reports
) {
  console.log("")
  console.log(
    `${report.label} (${report.support} players)`,
  )

  console.table(
    report.easiest
      .slice(0, 10)
      .map(
        (row) => ({
          Type:
            row.type,

          Criterion:
            row.label,

          Players:
            row.count,
        }),
      ),
  )
}

const outputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "api-football-trophies",
  "achievement-intersections.json",
)

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt:
        new Date()
          .toISOString(),

      productionPool: {
        clubs:
          clubs.length,

        nations:
          nations.length,

        leagues:
          leagues.length,

        positions:
          positions.length,
      },

      achievements:
        reports,

      achievementPairs,
    },
    null,
    2,
  ) + "\n",
)

console.log("")
console.log(
  `Saved: ${outputPath}`,
)