import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const HUMAN_QID = "Q5"
const FOOTBALL_PLAYER_QID = "Q937857"

const USER_AGENT =
  "FootGrid/0.1 (https://github.com/PhilKokura/Immaculate_Football)"

const root = process.cwd()

const playersPath = path.join(
  root,
  "components",
  "data",
  "runtime_players.json",
)

const localDir = path.join(
  root,
  "scripts",
  "provider-evaluation",
  "wikidata",
  ".local",
)

const cacheDir = path.join(
  localDir,
  "cache",
)

const reportPath = path.join(
  localDir,
  "wikidata-position-report.json",
)

fs.mkdirSync(cacheDir, {
  recursive: true,
})

const players = JSON.parse(
  fs
    .readFileSync(playersPath, "utf8")
    .replace(/^\uFEFF/, ""),
)

const args = process.argv.slice(2)

function readNumberArg(name, fallback) {
  const prefix = `--${name}=`

  const arg = args.find(
    (value) => value.startsWith(prefix),
  )

  if (!arg) {
    return fallback
  }

  const value = Number(
    arg.slice(prefix.length),
  )

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new Error(
      `Invalid --${name} value`,
    )
  }

  return Math.floor(value)
}

const limit = Math.min(
  readNumberArg(
    "limit",
    players.length,
  ),
  players.length,
)

const delayMs = readNumberArg(
  "delay",
  150,
)

function sleep(ms) {
  return new Promise(
    (resolve) => setTimeout(resolve, ms),
  )
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
}

async function fetchJson(url) {
  const cacheFile = path.join(
    cacheDir,
    `${hash(url)}.json`,
  )

  if (fs.existsSync(cacheFile)) {
    return JSON.parse(
      fs.readFileSync(
        cacheFile,
        "utf8",
      ),
    )
  }

  for (
    let attempt = 0;
    attempt < 5;
    attempt++
  ) {
    const response = await fetch(
      url,
      {
        headers: {
          "User-Agent":
            USER_AGENT,
          Accept:
            "application/json",
        },
      },
    )

    if (response.ok) {
      const json =
        await response.json()

      fs.writeFileSync(
        cacheFile,
        JSON.stringify(json),
      )

      await sleep(delayMs)

      return json
    }

    if (
      response.status === 429 ||
      response.status >= 500
    ) {
      const wait = Math.max(
        delayMs,
        500 * 2 ** attempt,
      )

      console.warn(
        `HTTP ${response.status}; retrying in ${wait}ms`,
      )

      await sleep(wait)

      continue
    }

    throw new Error(
      `${response.status} ${response.statusText}: ${url}`,
    )
  }

  throw new Error(
    `Wikidata request failed after retries: ${url}`,
  )
}

async function searchEntities(term) {
  const url =
    "https://www.wikidata.org/w/api.php?" +
    new URLSearchParams({
      action:
        "wbsearchentities",
      search: term,
      language: "en",
      uselang: "en",
      type: "item",
      limit: "10",
      format: "json",
      origin: "*",
    })

  const json =
    await fetchJson(url)

  return json.search ?? []
}

async function getEntity(qid) {
  const url =
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`

  const json =
    await fetchJson(url)

  return (
    json.entities?.[qid] ??
    null
  )
}

function claimEntityIds(
  entity,
  property,
) {
  return (
    entity?.claims?.[property] ??
    []
  )
    .map(
      (claim) =>
        claim?.mainsnak
          ?.datavalue?.value?.id,
    )
    .filter(Boolean)
}

function getBirthDate(entity) {
  const claims =
    entity?.claims?.P569 ?? []

  for (const claim of claims) {
    const value =
      claim?.mainsnak
        ?.datavalue?.value

    if (
      value?.time &&
      typeof value.time ===
        "string"
    ) {
      const match =
        value.time.match(
          /^[+-](\d{4})-(\d{2})-(\d{2})T/,
        )

      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`
      }
    }
  }

  return null
}

function isHuman(entity) {
  return claimEntityIds(
    entity,
    "P31",
  ).includes(HUMAN_QID)
}

function isFootballPlayer(
  entity,
) {
  return claimEntityIds(
    entity,
    "P106",
  ).includes(
    FOOTBALL_PLAYER_QID,
  )
}

function positionIds(entity) {
  return [
    ...new Set(
      claimEntityIds(
        entity,
        "P413",
      ),
    ),
  ]
}

function searchTermsForPlayer(
  player,
) {
  const terms = [
    player.name,
    ...(player.searchNames ?? []),
  ]
    .filter(
      (value) =>
        typeof value ===
          "string" &&
        value.trim().length >= 5,
    )
    .map(
      (value) => value.trim(),
    )

  return [
    ...new Set(terms),
  ]
}

async function findWikidataMatch(
  player,
) {
  if (!player.birthDate) {
    return {
      status:
        "missing-birth-date",
      candidates: [],
    }
  }

  const accepted =
    new Map()

  for (
    const term of
    searchTermsForPlayer(player)
  ) {
    const searchResults =
      await searchEntities(term)

    for (
      const result of
      searchResults
    ) {
      const qid =
        result.id

      if (
        accepted.has(qid)
      ) {
        continue
      }

      const entity =
        await getEntity(qid)

      if (!entity) {
        continue
      }

      /*
        Only real human football
        players are accepted.

        This filters out things like
        fictional video-game entities
        that happen to share a player's
        name and birth date.
      */
      if (
        !isHuman(entity) ||
        !isFootballPlayer(
          entity,
        )
      ) {
        continue
      }

      const birthDate =
        getBirthDate(entity)

      if (
        birthDate !==
        player.birthDate
      ) {
        continue
      }

      accepted.set(qid, {
        qid,

        matchedSearchTerm:
          term,

        label:
          entity.labels?.en
            ?.value ??
          result.label ??
          null,

        description:
          entity.descriptions
            ?.en?.value ??
          result.description ??
          null,

        birthDate,

        positionIds:
          positionIds(entity),
      })
    }

    /*
      Once one unique real human
      football player with the exact
      DOB has been found, we do not
      need to query every alias.
    */
    if (
      accepted.size === 1
    ) {
      break
    }
  }

  const candidates = [
    ...accepted.values(),
  ]

  if (
    candidates.length === 0
  ) {
    return {
      status: "unmatched",
      candidates,
    }
  }

  if (
    candidates.length > 1
  ) {
    return {
      status: "ambiguous",
      candidates,
    }
  }

  return {
    status: "matched",
    candidates,
  }
}

async function getLabels(
  qids,
) {
  const result =
    new Map()

  const ids = [
    ...new Set(qids),
  ]

  for (
    let i = 0;
    i < ids.length;
    i += 50
  ) {
    const batch =
      ids.slice(i, i + 50)

    const url =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action:
          "wbgetentities",
        ids:
          batch.join("|"),
        props: "labels",
        languages: "en",
        format: "json",
        origin: "*",
      })

    const json =
      await fetchJson(url)

    for (
      const qid of batch
    ) {
      const entity =
        json.entities?.[qid]

      result.set(
        qid,
        entity?.labels?.en
          ?.value ??
          null,
      )
    }
  }

  return result
}

async function main() {
  console.log(
    `Runtime players: ${players.length}`,
  )

  console.log(
    `Analyzing: ${limit}`,
  )

  console.log("")

  const selected =
    players.slice(0, limit)

  const reportPlayers = []

  for (
    let index = 0;
    index < selected.length;
    index++
  ) {
    const player =
      selected[index]

    process.stdout.write(
      `[${index + 1}/${selected.length}] ${player.name} ... `,
    )

    try {
      const result =
        await findWikidataMatch(
          player,
        )

      const candidate =
        result.status ===
        "matched"
          ? result.candidates[0]
          : null

      reportPlayers.push({
        playerId:
          player.id,

        name:
          player.name,

        birthDate:
          player.birthDate ??
          null,

        currentPositions:
          player.positions ??
          [],

        status:
          result.status,

        wikidataQid:
          candidate?.qid ??
          null,

        wikidataLabel:
          candidate?.label ??
          null,

        matchedSearchTerm:
          candidate
            ?.matchedSearchTerm ??
          null,

        rawPositionIds:
          candidate
            ?.positionIds ??
          [],

        candidates:
          result.status ===
          "ambiguous"
            ? result.candidates
            : undefined,
      })

      console.log(
        result.status,
      )
    } catch (error) {
      reportPlayers.push({
        playerId:
          player.id,

        name:
          player.name,

        birthDate:
          player.birthDate ??
          null,

        currentPositions:
          player.positions ??
          [],

        status:
          "error",

        error:
          error instanceof Error
            ? error.message
            : String(error),
      })

      console.log(
        "ERROR",
      )
    }
  }

  const allPositionIds =
    reportPlayers.flatMap(
      (player) =>
        player.rawPositionIds ??
        [],
    )

  console.log("")
  console.log(
    "Resolving position labels...",
  )

  const labels =
    await getLabels(
      allPositionIds,
    )

  for (
    const player of
    reportPlayers
  ) {
    player.wikidataPositions =
      (
        player.rawPositionIds ??
        []
      ).map(
        (qid) => ({
          qid,
          label:
            labels.get(qid) ??
            null,
        }),
      )

    delete player.rawPositionIds
  }

  const positionFrequency =
    new Map()

  for (
    const player of
    reportPlayers
  ) {
    if (
      player.status !==
      "matched"
    ) {
      continue
    }

    for (
      const position of
      player.wikidataPositions ??
      []
    ) {
      const key =
        `${position.qid}|${position.label ?? ""}`

      positionFrequency.set(
        key,
        (
          positionFrequency.get(
            key,
          ) ?? 0
        ) + 1,
      )
    }
  }

  const summary = {
    analyzed:
      reportPlayers.length,

    matched:
      reportPlayers.filter(
        (p) =>
          p.status ===
          "matched",
      ).length,

    unmatched:
      reportPlayers.filter(
        (p) =>
          p.status ===
          "unmatched",
      ).length,

    ambiguous:
      reportPlayers.filter(
        (p) =>
          p.status ===
          "ambiguous",
      ).length,

    missingBirthDate:
      reportPlayers.filter(
        (p) =>
          p.status ===
          "missing-birth-date",
      ).length,

    errors:
      reportPlayers.filter(
        (p) =>
          p.status ===
          "error",
      ).length,

    matchedWithPosition:
      reportPlayers.filter(
        (p) =>
          p.status ===
            "matched" &&
          (
            p.wikidataPositions
              ?.length ?? 0
          ) > 0,
      ).length,

    matchedWithMultiplePositions:
      reportPlayers.filter(
        (p) =>
          p.status ===
            "matched" &&
          (
            p.wikidataPositions
              ?.length ?? 0
          ) > 1,
      ).length,
  }

  const positions = [
    ...positionFrequency.entries(),
  ]
    .map(
      ([key, count]) => {
        const [
          qid,
          label,
        ] =
          key.split("|")

        return {
          qid,
          label:
            label || null,
          count,
        }
      },
    )
    .sort(
      (a, b) =>
        b.count -
          a.count ||
        String(
          a.label,
        ).localeCompare(
          String(
            b.label,
          ),
        ),
    )

  const report = {
    generatedAt:
      new Date().toISOString(),

    summary,

    positions,

    players:
      reportPlayers,
  }

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      report,
      null,
      2,
    ) + "\n",
  )

  console.log("")
  console.log(
    "----- SUMMARY -----",
  )

  console.table(
    summary,
  )

  console.log("")
  console.log(
    "----- WIKIDATA POSITION VALUES -----",
  )

  console.table(
    positions,
  )

  console.log("")
  console.log(
    `Report: ${reportPath}`,
  )
}

main().catch(
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)