import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const inputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "api-football-trophies",
  "sample-report.json",
)

const outputPath = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "api-football-trophies",
  "relevant-title-winners.json",
)

const report = JSON.parse(
  fs.readFileSync(inputPath, "utf8"),
)

const relevantTitles = [
  {
    key: "world-cup-winner",
    league: "FIFA World Cup",
    country: "World",
  },
  {
    key: "euro-winner",
    league: "UEFA European Championship",
    country: "Europe",
  },
  {
    key: "copa-america-winner",
    league: "CONMEBOL Copa America",
    country: "South America",
  },
  {
    key: "champions-league-winner",
    league: "UEFA Champions League",
    country: "Europe",
  },
  {
    key: "europa-league-winner",
    league: "UEFA Europa League",
    country: "Europe",
  },
  {
    key: "premier-league-champion",
    league: "Premier League",
    country: "England",
  },
  {
    key: "bundesliga-champion",
    league: "Bundesliga",
    country: "Germany",
  },
  {
    key: "la-liga-champion",
    league: "La Liga",
    country: "Spain",
  },
  {
    key: "serie-a-champion",
    league: "Serie A",
    country: "Italy",
  },
  {
    key: "ligue-1-champion",
    league: "Ligue 1",
    country: "France",
  },
]

function titleFor(trophy) {
  if (trophy.place !== "Winner") {
    return null
  }

  return relevantTitles.find(
    (title) =>
      trophy.league === title.league &&
      trophy.country === title.country,
  ) ?? null
}

const filteredPlayers = []

for (const player of report.players ?? []) {
  const achievements = new Map()

  for (const trophy of player.trophies ?? []) {
    const title = titleFor(trophy)

    if (!title) {
      continue
    }

    if (!achievements.has(title.key)) {
      achievements.set(
        title.key,
        {
          key: title.key,
          league: title.league,
          country: title.country,
          seasons: new Set(),
        },
      )
    }

    if (trophy.season) {
      achievements
        .get(title.key)
        .seasons
        .add(trophy.season)
    }
  }

  if (achievements.size === 0) {
    continue
  }

  filteredPlayers.push({
    playerId: player.playerId,
    externalId: player.externalId,
    name: player.name,

    achievements: [
      ...achievements.values(),
    ].map((achievement) => ({
      key: achievement.key,
      league: achievement.league,
      country: achievement.country,
      seasons: [
        ...achievement.seasons,
      ].sort(),
    })),
  })
}

const counts = {}

for (const title of relevantTitles) {
  counts[title.key] =
    filteredPlayers.filter(
      (player) =>
        player.achievements.some(
          (achievement) =>
            achievement.key === title.key,
        ),
    ).length
}

console.log("")
console.log("----- FILTER RESULT -----")

console.table({
  totalActivePlayers:
    report.players?.length ?? 0,

  playersWithAnyTrophyRows:
    report.players?.filter(
      (player) =>
        (player.trophies?.length ?? 0) > 0,
    ).length ?? 0,

  playersWithRelevantMajorTitle:
    filteredPlayers.length,

  removed:
    (report.players?.length ?? 0) -
    filteredPlayers.length,
})

console.log("")
console.log(
  "----- UNIQUE PLAYERS PER RELEVANT TITLE -----",
)

console.table(
  relevantTitles.map(
    (title) => ({
      title: title.key,
      players: counts[title.key],
    }),
  ),
)

console.log("")
console.log(
  "----- PLAYERS WITH MOST DIFFERENT RELEVANT TITLES -----",
)

console.table(
  [...filteredPlayers]
    .sort(
      (a, b) =>
        b.achievements.length -
        a.achievements.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 50)
    .map((player) => ({
      player: player.name,
      relevantTitles:
        player.achievements.length,
      titles:
        player.achievements
          .map((a) => a.key)
          .join(", "),
    })),
)

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt:
        new Date().toISOString(),

      relevantTitles,

      counts,

      players:
        filteredPlayers,
    },
    null,
    2,
  ) + "\n",
)

console.log("")
console.log(`Saved: ${outputPath}`)