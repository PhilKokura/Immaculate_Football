import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const dir = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
)

const auto = JSON.parse(
  fs.readFileSync(
    path.join(
      dir,
      "player-display-name-auto.json",
    ),
    "utf8",
  ),
)

const classified = JSON.parse(
  fs.readFileSync(
    path.join(
      dir,
      "player-display-name-review-classified.json",
    ),
    "utf8",
  ),
)

const runtime = JSON.parse(
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

/*
  Explicit final decisions for the cases that were
  not covered by SAFE_SHORTER or SAFE_NICKNAME.

  null = keep current canonical/runtime name.
*/
const manual = new Map([
  ["fe1ea054-ecc0-48ac-bff2-30152ed2385f", "Abdel Abqar"],
  ["648bd082-82ed-4969-9680-7f8bfd49cea9", "Abde Ezzalzouli"],
  ["e7b5bd51-2284-4e1a-8dab-b8833f557658", "Tosin Adarabioyo"],
  ["0a6ab303-66e5-47b1-b49d-519aff983c0f", "Aji Alese"],

  ["2466f111-8493-4e46-96f9-5d439948b932", "Alexsandro"],
  ["92650ee6-abd5-4157-851a-188f62285a21", "Alfon"],
  ["97e569ff-4058-4908-bf69-aa5c7bf1811d", "Alysson"],
  ["76b73d95-e792-4058-85b2-03cb50d29c93", "Andy Robertson"],

  ["7f0096ec-45fc-4cc3-8557-5a258ae082b1", null],
  ["a4911b35-c0c8-4f37-9a86-d69119db9c0f", "Carlos Alcaraz"],
  ["c48e53e9-d730-4795-86c2-a0abddeba968", null],
  ["97234d8c-16ed-4c6a-858b-3cce1d5731aa", "Noni Madueke"],
  ["147b08d5-1356-4d80-95d5-7562021fcbb8", "Chuki"],

  ["2bee1cb8-4da5-47cb-9332-88000cd4e303", "Darío Osorio"],
  ["68f1fbe8-47da-4ce8-9e56-b76ec8322c13", "Dayot Upamecano"],
  ["29c2c9cd-5663-466a-8d04-b32b7f92c1fc", "Djené"],
  ["dea6e363-f038-43d8-a6bd-6f183a72879a", "Eddie Nketiah"],
  ["3c6f91f4-f77a-40ce-93a5-80f5b5231ec2", "Emil Audero"],
  ["e6c2260e-f521-46ce-ae8c-7300ae5f08a7", "Enrico Delprato"],
  ["064b0751-fb32-45f2-b021-2af1fe1851be", "Everton"],
  ["dad4e567-d76d-49ac-b4d6-bdb2ab5eef35", "Freddie Woodman"],

  ["a05eff8e-dd88-4ef7-9f4b-aeff0d063370", "Gaga Slonina"],
  ["8c3949bd-8763-42e1-bccd-66f4e6722b21", "Abdul Fatawu"],
  ["97be12f5-0f2e-4354-9e86-37d6323f4117", "Johnny Cardoso"],
  ["e2d0d59c-c58c-457a-acea-71ffa6a0ede3", null],

  ["d665e11f-b7f5-4781-8291-ef6a8d8951c0", "Jobe Bellingham"],
  ["61c4c9e2-f326-42cb-981b-dd14d5f4a5c8", "JJ Gabriel"],
  ["d9ef75ba-88a6-45a2-8b19-f7c0ecdfdb66", "Josh Maja"],
  ["8cedf1d3-7ae7-4623-9fd1-5bb16ad75c73", "Jeff Chabot"],
  ["2625df29-c3fe-40fd-b5fe-8afa021047ab", null],

  ["ff04319b-8806-4f95-b042-32ff5bd28ff9", "Kostas Tsimikas"],
  ["96e85e0b-bee5-4bfd-9d9f-b57bf0e1f028", "Manu Koné"],
  ["ffeceaff-0419-49f3-9ad3-9e5db5806ec9", "M'Bala Nzola"],
  ["4574f581-8f02-49cd-a2e8-a6997ea15d9b", "Matty Cash"],
  ["68341269-f2ed-4320-9a31-3fcd6300ba45", "Bachir Belloumi"],
  ["2b4522b4-c520-4ca5-9830-39317d5dcaee", "Ilaix Moriba"],
  ["6e6f6fd1-d165-4f8a-897b-d6b3d0913260", "Nico Paz"],

  ["8a9d0513-0fe9-4a15-9709-eb16d08bb870", null],
  ["eba864a9-304f-411c-b188-2ce3f74d6668", "Fikayo Tomori"],
  ["105a692f-7988-4608-bc2b-f81a420a9f51", "Semi Ajayi"],
  ["97e5d618-e43f-455f-93b3-71d363a35b3f", "Promise David"],
  ["a00c33da-e2eb-43e9-825e-e881f2be4029", null],

  ["bd9b7906-3f6b-487e-a298-940eccab7ab0", "Salvi Esquivel"],
  ["f8befd68-6742-42ad-9d11-f21f2c8bb0a4", "Sam Amo-Ameyaw"],
  ["0cd8cb33-632e-471c-b7e3-c5f3dbf6ddb0", "Sven Botman"],
  ["44bf9b9f-5527-430d-b7ad-f1f94f2a6f18", "Tani Oluwaseyi"],
  ["c25755e6-6fdd-4a48-95af-83ce625628b0", "Ola Aina"],

  ["1749e130-bbb6-4c4c-a6ad-8cb040dcfa36", "Thomas Kristensen"],
  ["ad2030d8-f3b9-4ace-aa11-eb77e91cffd5", "Trey Nyoni"],
  ["28b43a34-dee1-4523-b4aa-68ff4730d538", "Willi Orbán"],
  ["a8b2dbd9-05b8-497b-af2d-7f64a6d73015", "Vitor Reis"],
])

function currentName(player) {
  return (
    player.displayName ??
    player.name ??
    player.fullName ??
    ""
  ).trim()
}

const proposed = new Map()

/*
  Tier 1: conservative Wikidata shortening.
*/
for (const player of auto) {
  proposed.set(
    player.playerId,
    {
      displayName:
        player.proposedDisplayName,

      source:
        "wikidata-safe-shorter",
    },
  )
}

/*
  Tier 2: obvious/common nickname forms.
*/
for (const player of classified) {
  if (
    player.classification ===
    "SAFE_NICKNAME"
  ) {
    proposed.set(
      player.playerId,
      {
        displayName:
          player.wikidataLabel,

        source:
          "wikidata-safe-nickname",
      },
    )
  }
}

/*
  Tier 3: explicit manual review decisions.
*/
for (const [playerId, name] of manual) {
  if (name === null) {
    proposed.delete(playerId)
    continue
  }

  proposed.set(
    playerId,
    {
      displayName:
        name,

      source:
        "manual-review",
    },
  )
}

const finalRows =
  runtime.map(player => {
    const canonical =
      currentName(player)

    const change =
      proposed.get(player.id)

    const displayName =
      change?.displayName ??
      canonical

    const aliases =
      [...new Set(
        [
          canonical,
          displayName,
        ].filter(Boolean),
      )]

    return {
      playerId:
        player.id,

      canonicalName:
        canonical,

      displayName,

      changed:
        displayName !== canonical,

      source:
        change?.source ??
        "canonical",

      aliases,
    }
  })

const changed =
  finalRows.filter(
    player =>
      player.changed,
  )

const unchanged =
  finalRows.filter(
    player =>
      !player.changed,
  )

const duplicateDisplayNames =
  Object.entries(
    Object.groupBy(
      finalRows,
      player =>
        player.displayName
          .normalize("NFKD")
          .toLowerCase()
          .trim(),
    ),
  )
    .filter(
      ([, players]) =>
        players.length > 1,
    )
    .map(
      ([name, players]) => ({
        normalizedName:
          name,

        players:
          players.map(
            player => ({
              playerId:
                player.playerId,

              canonicalName:
                player.canonicalName,

              displayName:
                player.displayName,
            }),
          ),
      }),
    )

const output = {
  generatedAt:
    new Date()
      .toISOString(),

  summary: {
    totalPlayers:
      finalRows.length,

    changed:
      changed.length,

    unchanged:
      unchanged.length,

    safeShorter:
      changed.filter(
        x =>
          x.source ===
          "wikidata-safe-shorter",
      ).length,

    safeNickname:
      changed.filter(
        x =>
          x.source ===
          "wikidata-safe-nickname",
      ).length,

    manualReview:
      changed.filter(
        x =>
          x.source ===
          "manual-review",
      ).length,

    duplicateDisplayNameGroups:
      duplicateDisplayNames.length,
  },

  players:
    finalRows,

  duplicateDisplayNames,
}

const outputPath =
  path.join(
    dir,
    "player-display-name-final-plan.json",
  )

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    output,
    null,
    2,
  ) + "\n",
  "utf8",
)

console.log("")
console.log(
  "----- FINAL DISPLAY NAME PLAN -----",
)

console.table(
  output.summary,
)

console.log("")
console.log(
  "----- MANUAL FINAL NAMES -----",
)

console.table(
  changed
    .filter(
      x =>
        x.source ===
        "manual-review",
    )
    .map(
      x => ({
        Current:
          x.canonicalName,

        Display:
          x.displayName,
      }),
    ),
)

console.log("")
console.log(
  "----- DUPLICATE DISPLAY NAME GROUPS -----",
)

console.log(
  duplicateDisplayNames.length,
)

console.log("")
console.log(
  `Saved: ${outputPath}`,
)