import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type Row = Record<string, unknown>
type CriterionType = "club" | "league" | "nation" | "position"

type ExternalRef = {
  provider: "api-football"
  externalId: string
}

type Criterion = {
  type: CriterionType
  key: string
  label: string
  support: number
}

type ParsedPlayer = {
  id: string
  displayName: string
  clubs: string[]
  leagues: string[]
  nations: string[]
  positions: string[]
}

const TARGET_LEAGUES: Record<string, string> = {
  "39": "Premier League",
  "78": "Bundesliga",
  "140": "La Liga",
  "135": "Serie A",
  "61": "Ligue 1",
}

const VALID_POSITIONS = new Set(["GK", "DEF", "MID", "ATT"])

const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null

function parseExternalRef(value: unknown, label: string): ExternalRef {
  const ref = object(value)

  if (
    ref?.provider !== "api-football" ||
    typeof ref.externalId !== "string" ||
    !/^[1-9]\d*$/.test(ref.externalId)
  ) {
    throw new Error(`Invalid ${label}`)
  }

  return {
    provider: "api-football",
    externalId: ref.externalId,
  }
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of value) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error(`${label} contains invalid value`)
    }

    const clean = raw.trim()

    if (seen.has(clean)) {
      throw new Error(`${label} contains duplicate ${clean}`)
    }

    seen.add(clean)
    result.push(clean)
  }

  return result
}

function integerArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${label} must be a non-empty array`)
  }

  const result: number[] = []
  const seen = new Set<number>()

  for (const raw of value) {
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 1900 ||
      raw > 2026
    ) {
      throw new Error(`${label} contains invalid season`)
    }

    if (seen.has(raw)) {
      throw new Error(`${label} contains duplicate season ${raw}`)
    }

    seen.add(raw)
    result.push(raw)
  }

  return result
}

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function parsePlayer(value: unknown): {
  parsed: ParsedPlayer
  integrityErrors: string[]
} {
  const row = object(value)

  if (!row) {
    throw new Error("Malformed final-player-game-data.json row")
  }

  const externalRef = parseExternalRef(
    row.playerExternalRef,
    "final player playerExternalRef",
  )

  const playerId = externalRef.externalId
  const criteria = object(row.criteria)
  const semantics = object(row.semantics)

  if (!criteria || !semantics) {
    throw new Error(`Player ${playerId} is missing criteria/semantics`)
  }

  const clubs = stringArray(
    criteria.clubExternalIds,
    `player ${playerId} clubs`,
  )

  const leagues = stringArray(
    criteria.leagueExternalIds,
    `player ${playerId} leagues`,
  )

  const nations = stringArray(
    criteria.nations,
    `player ${playerId} nations`,
  )

  const positions = stringArray(
    criteria.positions,
    `player ${playerId} positions`,
  )

  const integrityErrors: string[] = []

  for (const leagueId of leagues) {
    if (!(leagueId in TARGET_LEAGUES)) {
      integrityErrors.push(
        `player ${playerId}: unexpected league criterion ${leagueId}`,
      )
    }
  }

  for (const position of positions) {
    if (!VALID_POSITIONS.has(position)) {
      integrityErrors.push(
        `player ${playerId}: unexpected position ${position}`,
      )
    }
  }

  if (nations.length > 1) {
    integrityErrors.push(
      `player ${playerId}: V1 nationality has ${nations.length} values`,
    )
  }

  if (positions.length > 1) {
    integrityErrors.push(
      `player ${playerId}: V1 current position has ${positions.length} values`,
    )
  }

  if (semantics.leagueBasis !== "appearance-confirmed-target-league-statistics") {
    integrityErrors.push(
      `player ${playerId}: invalid league semantics`,
    )
  }

  if (!Array.isArray(row.eligibleClubs)) {
    integrityErrors.push(
      `player ${playerId}: eligibleClubs is missing`,
    )
  } else {
    const eligibleClubIds: string[] = []

    for (const rawClub of row.eligibleClubs) {
      const club = object(rawClub)

      if (!club) {
        integrityErrors.push(
          `player ${playerId}: malformed eligible club`,
        )
        continue
      }

      const clubRef = parseExternalRef(
        club.teamExternalRef,
        `player ${playerId} eligible club externalRef`,
      )

      eligibleClubIds.push(clubRef.externalId)

      if (club.evidenceStrength !== "season-backed-association") {
        integrityErrors.push(
          `player ${playerId}, club ${clubRef.externalId}: weak club evidence leaked into eligibility`,
        )
      }

      try {
        integerArray(
          club.seasons,
          `player ${playerId}, club ${clubRef.externalId} seasons`,
        )
      } catch (error) {
        integrityErrors.push(
          error instanceof Error
            ? error.message
            : `player ${playerId}: invalid club seasons`,
        )
      }
    }

    if (
      JSON.stringify([...eligibleClubIds].sort()) !==
      JSON.stringify([...clubs].sort())
    ) {
      integrityErrors.push(
        `player ${playerId}: club criteria do not mirror eligibleClubs`,
      )
    }
  }

  if (!Array.isArray(row.eligibleLeagues)) {
    integrityErrors.push(
      `player ${playerId}: eligibleLeagues is missing`,
    )
  } else {
    const eligibleLeagueIds: string[] = []

    for (const rawLeague of row.eligibleLeagues) {
      const league = object(rawLeague)

      if (!league) {
        integrityErrors.push(
          `player ${playerId}: malformed eligible league`,
        )
        continue
      }

      const leagueRef = parseExternalRef(
        league.leagueExternalRef,
        `player ${playerId} eligible league externalRef`,
      )

      eligibleLeagueIds.push(leagueRef.externalId)

      if (
        league.eligibilityEvidence !== "appearance-confirmed" ||
        league.evidenceType !== "provider-league-season-statistics"
      ) {
        integrityErrors.push(
          `player ${playerId}, league ${leagueRef.externalId}: invalid league evidence`,
        )
      }

      try {
        integerArray(
          league.seasons,
          `player ${playerId}, league ${leagueRef.externalId} seasons`,
        )
      } catch (error) {
        integrityErrors.push(
          error instanceof Error
            ? error.message
            : `player ${playerId}: invalid league seasons`,
        )
      }

      try {
        const teamIds = stringArray(
          league.teamExternalIds,
          `player ${playerId}, league ${leagueRef.externalId} team IDs`,
        )

        if (!teamIds.length) {
          integrityErrors.push(
            `player ${playerId}, league ${leagueRef.externalId}: no team IDs`,
          )
        }
      } catch (error) {
        integrityErrors.push(
          error instanceof Error
            ? error.message
            : `player ${playerId}: invalid league team IDs`,
        )
      }
    }

    if (
      JSON.stringify([...eligibleLeagueIds].sort()) !==
      JSON.stringify([...leagues].sort())
    ) {
      integrityErrors.push(
        `player ${playerId}: league criteria do not mirror eligibleLeagues`,
      )
    }
  }

  const displayName =
    typeof row.displayName === "string" && row.displayName.trim()
      ? row.displayName.trim()
      : `Player ${playerId}`

  return {
    parsed: {
      id: playerId,
      displayName,
      clubs,
      leagues,
      nations,
      positions,
    },
    integrityErrors,
  }
}

function criterionKey(type: CriterionType, value: string) {
  return `${type}:${value}`
}

function criterionValues(
  player: ParsedPlayer,
  type: CriterionType,
): string[] {
  switch (type) {
    case "club":
      return player.clubs
    case "league":
      return player.leagues
    case "nation":
      return player.nations
    case "position":
      return player.positions
  }
}

function criterionLabel(type: CriterionType, value: string) {
  if (type === "league") {
    return TARGET_LEAGUES[value] ?? value
  }

  return value
}

function pairFamily(
  a: CriterionType,
  b: CriterionType,
): string | null {
  if (a === b) {
    if (a === "club") return "club-club"
    if (a === "league") return "league-league"
    return null
  }

  const ordered = [a, b].sort() as CriterionType[]
  return `${ordered[0]}-${ordered[1]}`
}

function canonicalPairKey(
  aType: CriterionType,
  aValue: string,
  bType: CriterionType,
  bValue: string,
) {
  if (aType === bType) {
    const [left, right] = [aValue, bValue].sort()
    return `${aType}:${left}|${bType}:${right}`
  }

  const pairs = [
    [aType, aValue],
    [bType, bValue],
  ].sort((x, y) => x[0].localeCompare(y[0]))

  return `${pairs[0][0]}:${pairs[0][1]}|${pairs[1][0]}:${pairs[1][1]}`
}

function choose2(value: number) {
  return value < 2 ? 0 : (value * (value - 1)) / 2
}

function bucketCounts(values: number[]) {
  return {
    exactly1: values.filter(value => value === 1).length,
    exactly2: values.filter(value => value === 2).length,
    from3To4: values.filter(value => value >= 3 && value <= 4).length,
    from5To8: values.filter(value => value >= 5 && value <= 8).length,
    atLeast9: values.filter(value => value >= 9).length,
  }
}

function makeRng(seed: number) {
  let state = seed >>> 0 || 1

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

function pick<T>(values: readonly T[], random: () => number): T {
  if (!values.length) {
    throw new Error("Cannot pick from an empty array")
  }

  return values[Math.floor(random() * values.length)]
}

function shuffled<T>(
  values: readonly T[],
  random: () => number,
): T[] {
  const result = [...values]

  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }

  return result
}

function intersection(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): string[] {
  const [small, large] =
    a.size <= b.size ? [a, b] : [b, a]

  const result: string[] = []

  for (const value of small) {
    if (large.has(value)) result.push(value)
  }

  return result
}

function findDistinctAssignment(
  cellCandidates: string[][],
): string[] | null {
  const order = cellCandidates
    .map((candidates, index) => ({
      index,
      candidates,
    }))
    .sort(
      (a, b) =>
        a.candidates.length - b.candidates.length,
    )

  const used = new Set<string>()
  const assignment = Array<string>(cellCandidates.length)

  const visit = (depth: number): boolean => {
    if (depth === order.length) return true

    const cell = order[depth]

    for (const playerId of cell.candidates) {
      if (used.has(playerId)) continue

      used.add(playerId)
      assignment[cell.index] = playerId

      if (visit(depth + 1)) return true

      used.delete(playerId)
      assignment[cell.index] = ""
    }

    return false
  }

  return visit(0) ? assignment : null
}

function parseIntegerOption(
  prefix: string,
  fallback: number,
  min: number,
  max: number,
) {
  const option = process.argv.find(arg => arg.startsWith(prefix))
  if (!option) return fallback

  const value = Number(option.slice(prefix.length))

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${prefix}${value} must be an integer from ${min} to ${max}`,
    )
  }

  return value
}

const directory = join(
  dirname(fileURLToPath(import.meta.url)),
  ".local",
  "active-top5",
)

const finalPath = join(
  directory,
  "final-player-game-data.json",
)

if (!existsSync(finalPath)) {
  console.error(
    "final-player-game-data.json is missing. Run build-final-game-data.ts first.",
  )
  process.exitCode = 1
} else {
  try {
    const raw = JSON.parse(
      readFileSync(finalPath, "utf8"),
    ) as unknown

    if (!Array.isArray(raw) || !raw.length) {
      throw new Error(
        "final-player-game-data.json must be a non-empty array",
      )
    }

    const players: ParsedPlayer[] = []
    const integrityErrors: string[] = []
    const seenIds = new Set<string>()

    for (const row of raw) {
      const parsed = parsePlayer(row)
      const playerId = parsed.parsed.id

      if (seenIds.has(playerId)) {
        integrityErrors.push(
          `duplicate final player ID ${playerId}`,
        )
      }

      seenIds.add(playerId)
      players.push(parsed.parsed)
      integrityErrors.push(...parsed.integrityErrors)
    }

    const normalizedDisplayNames =
      new Map<string, Array<{ id: string; displayName: string }>>()

    for (const player of players) {
      const key = normalizedName(player.displayName)
      const current = normalizedDisplayNames.get(key) ?? []
      current.push({
        id: player.id,
        displayName: player.displayName,
      })
      normalizedDisplayNames.set(key, current)
    }

    const duplicateDisplayNameGroups =
      [...normalizedDisplayNames.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([normalized, group]) => ({
          normalized,
          players: group,
        }))

    const supportByCriterion = new Map<string, Set<string>>()
    const criterionMeta = new Map<string, {
      type: CriterionType
      value: string
    }>()

    const criterionTypes: CriterionType[] = [
      "club",
      "league",
      "nation",
      "position",
    ]

    for (const player of players) {
      for (const type of criterionTypes) {
        for (const value of criterionValues(player, type)) {
          const key = criterionKey(type, value)
          const support = supportByCriterion.get(key) ?? new Set<string>()
          support.add(player.id)
          supportByCriterion.set(key, support)
          criterionMeta.set(key, { type, value })
        }
      }
    }

    const criteria: Criterion[] =
      [...supportByCriterion.entries()]
        .map(([key, support]) => {
          const meta = criterionMeta.get(key)!
          return {
            type: meta.type,
            key,
            label: criterionLabel(meta.type, meta.value),
            support: support.size,
          }
        })
        .sort(
          (a, b) =>
            a.type.localeCompare(b.type) ||
            b.support - a.support ||
            a.label.localeCompare(b.label),
        )

    const criterionCountByType = Object.fromEntries(
      criterionTypes.map(type => [
        type,
        criteria.filter(criterion => criterion.type === type).length,
      ]),
    ) as Record<CriterionType, number>

    const pairCountsByFamily = new Map<string, Map<string, number>>()

    const addPair = (
      family: string,
      key: string,
      playerId: string,
      playerSeenPairs: Set<string>,
    ) => {
      const uniquePlayerPairKey = `${family}::${key}`

      if (playerSeenPairs.has(uniquePlayerPairKey)) return
      playerSeenPairs.add(uniquePlayerPairKey)

      const familyMap =
        pairCountsByFamily.get(family) ?? new Map<string, number>()

      familyMap.set(key, (familyMap.get(key) ?? 0) + 1)
      pairCountsByFamily.set(family, familyMap)
    }

    for (const player of players) {
      const playerSeenPairs = new Set<string>()

      for (let leftIndex = 0; leftIndex < criterionTypes.length; leftIndex++) {
        const leftType = criterionTypes[leftIndex]
        const leftValues = criterionValues(player, leftType)

        for (
          let rightIndex = leftIndex;
          rightIndex < criterionTypes.length;
          rightIndex++
        ) {
          const rightType = criterionTypes[rightIndex]
          const family = pairFamily(leftType, rightType)

          if (!family) continue

          const rightValues = criterionValues(player, rightType)

          for (let leftValueIndex = 0; leftValueIndex < leftValues.length; leftValueIndex++) {
            const rightStart =
              leftType === rightType
                ? leftValueIndex + 1
                : 0

            for (
              let rightValueIndex = rightStart;
              rightValueIndex < rightValues.length;
              rightValueIndex++
            ) {
              const leftValue = leftValues[leftValueIndex]
              const rightValue = rightValues[rightValueIndex]

              if (
                leftType === rightType &&
                leftValue === rightValue
              ) {
                continue
              }

              addPair(
                family,
                canonicalPairKey(
                  leftType,
                  leftValue,
                  rightType,
                  rightValue,
                ),
                player.id,
                playerSeenPairs,
              )
            }
          }
        }
      }
    }

    const count = (type: CriterionType) =>
      criterionCountByType[type]

    const totalPossibleByFamily: Record<string, number> = {
      "club-club": choose2(count("club")),
      "club-league": count("club") * count("league"),
      "club-nation": count("club") * count("nation"),
      "club-position": count("club") * count("position"),
      "league-league": choose2(count("league")),
      "league-nation": count("league") * count("nation"),
      "league-position": count("league") * count("position"),
      "nation-position": count("nation") * count("position"),
    }

    const pairCoverage = Object.fromEntries(
      Object.entries(totalPossibleByFamily).map(
        ([family, totalPossible]) => {
          const values = [
            ...(pairCountsByFamily.get(family)?.values() ?? []),
          ]

          return [
            family,
            {
              totalPossible,
              withAtLeastOneCandidate: values.length,
              withoutCandidate: totalPossible - values.length,
              coveragePercent:
                totalPossible > 0
                  ? Number(
                      ((values.length / totalPossible) * 100).toFixed(2),
                    )
                  : 0,
              candidateCountBuckets: bucketCounts(values),
              maxCandidates: values.length
                ? Math.max(...values)
                : 0,
            },
          ]
        },
      ),
    )

    const minSupport = parseIntegerOption(
      "--min-support=",
      9,
      1,
      players.length,
    )

    const samples = parseIntegerOption(
      "--samples=",
      1000,
      1,
      100000,
    )

    const seed = parseIntegerOption(
      "--seed=",
      1337,
      1,
      2147483647,
    )

    const samplePoolByType = Object.fromEntries(
      criterionTypes.map(type => [
        type,
        criteria.filter(
          criterion =>
            criterion.type === type &&
            criterion.support >= minSupport,
        ),
      ]),
    ) as Record<CriterionType, Criterion[]>

    const typeSequences: CriterionType[][] = []
    for (const a of criterionTypes) {
      for (const b of criterionTypes) {
        for (const c of criterionTypes) {
          typeSequences.push([a, b, c])
        }
      }
    }

    const validLayouts: Array<{
      rowTypes: CriterionType[]
      colTypes: CriterionType[]
    }> = []

    for (const rowTypes of typeSequences) {
      for (const colTypes of typeSequences) {
        const globallyPossible = rowTypes.every(
          rowType =>
            colTypes.every(
              colType =>
                pairFamily(rowType, colType) !== null,
            ),
        )

        if (!globallyPossible) continue

        const countsNeeded = new Map<CriterionType, number>()

        for (const type of [...rowTypes, ...colTypes]) {
          countsNeeded.set(type, (countsNeeded.get(type) ?? 0) + 1)
        }

        const enoughCriteria = [...countsNeeded.entries()].every(
          ([type, needed]) =>
            samplePoolByType[type].length >= needed,
        )

        if (!enoughCriteria) continue

        validLayouts.push({
          rowTypes,
          colTypes,
        })
      }
    }

    if (!validLayouts.length) {
      throw new Error(
        `No valid sample layouts at min support ${minSupport}`,
      )
    }

    const random = makeRng(seed)
    const solvableExamples: unknown[] = []
    const distinctFailureExamples: unknown[] = []

    let allCellsNonempty = 0
    let distinctSolvable = 0
    let zeroCell = 0
    let distinctFailure = 0

    const pickDistinctForTypes = (
      types: CriterionType[],
      usedKeys: Set<string>,
    ): Criterion[] => {
      const selected: Criterion[] = []

      for (const type of types) {
        const available = shuffled(
          samplePoolByType[type],
          random,
        ).filter(criterion => !usedKeys.has(criterion.key))

        if (!available.length) {
          throw new Error(
            `Could not choose distinct ${type} criterion`,
          )
        }

        const criterion = available[0]
        selected.push(criterion)
        usedKeys.add(criterion.key)
      }

      return selected
    }

    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
      const layout = pick(validLayouts, random)
      const usedKeys = new Set<string>()

      const rows = pickDistinctForTypes(
        layout.rowTypes,
        usedKeys,
      )

      const cols = pickDistinctForTypes(
        layout.colTypes,
        usedKeys,
      )

      const cellCandidates: string[][] = []
      const cellCounts: number[][] = []

      for (const rowCriterion of rows) {
        const countRow: number[] = []

        for (const colCriterion of cols) {
          const candidates = intersection(
            supportByCriterion.get(rowCriterion.key)!,
            supportByCriterion.get(colCriterion.key)!,
          )

          cellCandidates.push(candidates)
          countRow.push(candidates.length)
        }

        cellCounts.push(countRow)
      }

      const hasZeroCell = cellCandidates.some(
        candidates => candidates.length === 0,
      )

      if (hasZeroCell) {
        zeroCell++
        continue
      }

      allCellsNonempty++

      const assignment = findDistinctAssignment(cellCandidates)

      if (assignment) {
        distinctSolvable++

        if (solvableExamples.length < 50) {
          solvableExamples.push({
            rows: rows.map(criterion => ({
              type: criterion.type,
              key: criterion.key,
              label: criterion.label,
            })),
            columns: cols.map(criterion => ({
              type: criterion.type,
              key: criterion.key,
              label: criterion.label,
            })),
            cellCandidateCounts: cellCounts,
            distinctPlayerAssignment: assignment,
          })
        }
      } else {
        distinctFailure++

        if (distinctFailureExamples.length < 25) {
          distinctFailureExamples.push({
            rows: rows.map(criterion => ({
              type: criterion.type,
              key: criterion.key,
              label: criterion.label,
            })),
            columns: cols.map(criterion => ({
              type: criterion.type,
              key: criterion.key,
              label: criterion.label,
            })),
            cellCandidateCounts: cellCounts,
          })
        }
      }
    }

    const criterionStats = criteria.map(criterion => ({
      type: criterion.type,
      key: criterion.key,
      label: criterion.label,
      eligiblePlayerCount: criterion.support,
      includedInSamplePool:
        criterion.support >= minSupport,
    }))

    const integrity = {
      players: players.length,
      uniquePlayerIds: seenIds.size,
      integrityErrorCount: integrityErrors.length,
      integrityErrors: integrityErrors.slice(0, 500),
      integrityErrorsTruncated:
        integrityErrors.length > 500,
      duplicateNormalizedDisplayNameGroups:
        duplicateDisplayNameGroups.length,
      duplicateDisplayNames: duplicateDisplayNameGroups,
      criterionCountByType,
      playersByCriterionAvailability: {
        club: players.filter(player => player.clubs.length > 0).length,
        league: players.filter(player => player.leagues.length > 0).length,
        nation: players.filter(player => player.nations.length > 0).length,
        position: players.filter(player => player.positions.length > 0).length,
        allFour: players.filter(
          player =>
            player.clubs.length > 0 &&
            player.leagues.length > 0 &&
            player.nations.length > 0 &&
            player.positions.length > 0,
        ).length,
      },
      pass:
        integrityErrors.length === 0 &&
        seenIds.size === players.length,
    }

    const solvability = {
      scope: {
        playerCount: players.length,
        minCriterionSupportForSampling: minSupport,
        sampleCount: samples,
        deterministicSeed: seed,
        validAxisTypeLayouts: validLayouts.length,
        samplePoolCriterionCountByType:
          Object.fromEntries(
            criterionTypes.map(type => [
              type,
              samplePoolByType[type].length,
            ]),
          ),
      },
      exhaustiveCellPairCoverage: pairCoverage,
      sampledGrids: {
        attempted: samples,
        allNineCellsHaveCandidates: allCellsNonempty,
        atLeastOneZeroCandidateCell: zeroCell,
        distinctPlayerSolvable: distinctSolvable,
        allCellsNonemptyButNoDistinctAssignment:
          distinctFailure,
        distinctSolvablePercent:
          Number(((distinctSolvable / samples) * 100).toFixed(2)),
        note: [
          "This is a deterministic data-level sample, not a proof that every arbitrary 3x3 criterion combination is solvable.",
          "A grid counts as solvable only when all nine cells can be filled by nine distinct players.",
          "Nation×Nation and Position×Position intersections are excluded because V1 stores one nationality and one current position per player.",
          "Club×Club and League×League intersections are supported.",
          "The production puzzle generator should still call the authoritative distinct-player solver before publishing a puzzle.",
        ],
      },
      solvableExamples,
      distinctFailureExamples,
    }

    writeFileSync(
      join(directory, "final-game-data-integrity.json"),
      JSON.stringify(integrity, null, 2) + "\n",
    )

    writeFileSync(
      join(directory, "final-game-data-solvability.json"),
      JSON.stringify(solvability, null, 2) + "\n",
    )

    writeFileSync(
      join(directory, "final-game-data-criterion-stats.json"),
      JSON.stringify(criterionStats, null, 2) + "\n",
    )

    console.log(`Players audited: ${integrity.players}`)
    console.log(`Integrity errors: ${integrity.integrityErrorCount}`)
    console.log(`Integrity: ${integrity.pass ? "PASS" : "FAIL"}`)
    console.log(
      `Criteria: clubs=${criterionCountByType.club}, leagues=${criterionCountByType.league}, nations=${criterionCountByType.nation}, positions=${criterionCountByType.position}`,
    )
    console.log(
      `Sampling pool (support >= ${minSupport}): clubs=${samplePoolByType.club.length}, leagues=${samplePoolByType.league.length}, nations=${samplePoolByType.nation.length}, positions=${samplePoolByType.position.length}`,
    )
    console.log(`Valid axis type layouts: ${validLayouts.length}`)
    console.log(`Sampled grids: ${samples}`)
    console.log(`All 9 cells non-empty: ${allCellsNonempty}`)
    console.log(`Distinct-player solvable: ${distinctSolvable}`)
    console.log(
      `Non-empty cells but no 9-player assignment: ${distinctFailure}`,
    )
    console.log(
      `Distinct solvable rate: ${solvability.sampledGrids.distinctSolvablePercent}%`,
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown final game-data audit error"

    console.error(`Final game-data audit failed: ${message}`)
    process.exitCode = 1
  }
}
