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

const reviewPath = path.join(
  dir,
  "player-display-name-review.json",
)

const review = JSON.parse(
  fs.readFileSync(reviewPath, "utf8"),
)

const nicknamePairs = new Set([
  "alexander|alex",
  "benjamin|ben",
  "christopher|chris",
  "daniel|dan",
  "daniel|danny",
  "joseph|joe",
  "joshua|josh",
  "maximillian|max",
  "matthew|matt",
  "nicholas|nick",
  "oliver|oli",
  "patrick|paddy",
  "pelenda|josh",
  "philip|phil",
  "teremas|terem",
  "thomas|tom",
  "valentino|tino",
  "william|will",
  "xavier|xavi",
])

function norm(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .trim()
}

function tokens(value) {
  return norm(value)
    .split(/\s+/)
    .filter(Boolean)
}

function sameSurname(current, proposed) {
  const currentTokens = tokens(current)
  const proposedTokens = tokens(proposed)

  if (
    currentTokens.length === 0 ||
    proposedTokens.length === 0
  ) {
    return false
  }

  const proposedLast =
    proposedTokens.at(-1)

  return currentTokens.includes(
    proposedLast,
  )
}

function obviousNickname(current, proposed) {
  const currentTokens =
    tokens(current)

  const proposedTokens =
    tokens(proposed)

  if (
    currentTokens.length < 2 ||
    proposedTokens.length < 2
  ) {
    return false
  }

  if (!sameSurname(current, proposed)) {
    return false
  }

  const currentFirst =
    currentTokens[0]

  const proposedFirst =
    proposedTokens[0]

  return nicknamePairs.has(
    `${currentFirst}|${proposedFirst}`,
  )
}

const classified =
  review.map(player => {
    let classification =
      "MANUAL_REVIEW"

    if (
      player.status === "REVIEW_SHORTER" &&
      obviousNickname(
        player.currentName,
        player.wikidataLabel,
      )
    ) {
      classification =
        "SAFE_NICKNAME"
    }

    if (
      player.status === "REVIEW_SINGLE_NAME"
    ) {
      classification =
        "MANUAL_SINGLE_NAME"
    }

    return {
      ...player,
      classification,
    }
  })

const safeNickname =
  classified.filter(
    x =>
      x.classification ===
      "SAFE_NICKNAME",
  )

const manual =
  classified.filter(
    x =>
      x.classification !==
      "SAFE_NICKNAME",
  )

console.log("")
console.log("----- REVIEW CLASSIFICATION -----")

console.table({
  totalReview:
    classified.length,

  safeNickname:
    safeNickname.length,

  remainingManual:
    manual.length,

  singleNameManual:
    manual.filter(
      x =>
        x.classification ===
        "MANUAL_SINGLE_NAME",
    ).length,
})

console.log("")
console.log("----- SAFE NICKNAME -----")

console.table(
  safeNickname.map(
    x => ({
      Current:
        x.currentName,

      Proposed:
        x.wikidataLabel,
    }),
  ),
)

console.log("")
console.log("----- REMAINING MANUAL -----")

console.table(
  manual.map(
    x => ({
      Current:
        x.currentName,

      Proposed:
        x.wikidataLabel,

      Type:
        x.classification,
    }),
  ),
)

fs.writeFileSync(
  path.join(
    dir,
    "player-display-name-review-classified.json",
  ),
  JSON.stringify(
    classified,
    null,
    2,
  ) + "\n",
)

console.log("")
console.log(
  "Saved classified review file.",
)