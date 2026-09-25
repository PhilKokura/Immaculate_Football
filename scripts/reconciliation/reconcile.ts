import { createHash } from "node:crypto"
import { sourceSchema, type Association, type Config, type Dictionary, type PositionCategory, type ReconciledRecord } from "./model"

export const PIPELINE_VERSION = 1
export const HIGH_CLUB_COUNT = 6
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const values = (associations: Association[]) => associations.map(({ value }) => value)
export const nameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const roles = new Set(["ATT", "MID", "DEF", "GK"])
const own = (map: Record<string, string>, key: string) => Object.hasOwn(map, key)

// Exact explicit lookups only: no fuzzy matching, case folding, or inferred entities.
export function normalizeValues(rawValues: string[], dictionaries: Dictionary[], unresolved: (raw: string) => string | undefined = () => undefined): Association[] {
  const result = new Map<string, Association>()
  for (const raw of rawValues) {
    const dictionary = dictionaries.find(d => own(d.mappings, raw))
    const value = dictionary ? dictionary.mappings[raw] : raw
    const note = dictionary ? undefined : unresolved(raw)
    const association = result.get(value) ?? { value, evidence: [] }
    association.evidence.push({ raw,
      mappingType: dictionary?.mappingType ?? (note ? "unresolved" : "unchanged"),
      category: dictionary ? "explicit-known-mapping" : note ? "unresolved" : "deterministic-normalization",
      ...(note ? { note } : {}),
    })
    result.set(value, association)
  }
  // Order is presentation only, never nationality or historical priority.
  return [...result.values()].sort((a, b) => compare(a.value, b.value))
}

export function classifyPositions(raw: string[], normalized: Association[]): PositionCategory {
  const positions = values(normalized)
  if (!positions.length || positions.some(p => !roles.has(p))) return "missing-or-unresolved-position"
  if (positions.length === 4) return "all-four-position-classes"
  if (positions.includes("GK") && positions.length > 1) return "goalkeeper-plus-outfield"
  if (positions.length === 3) return "three-outfield-positions"
  if (positions.length === 2) return "two-outfield-positions"
  return new Set(raw).size > 1 ? "synonym-duplication-only" : "single-position"
}

export function validateConfig(config: Config) {
  const dictionaries = [config.clubs, config.fm, config.positions, config.nations]
  const expectedTypes = ["club-alias", "fm-license-replacement", "position-synonym", "nation-code-equivalence"]
  dictionaries.forEach((dictionary, index) => {
    if (dictionary.mappingType !== expectedTypes[index]) throw new Error(`Unexpected mapping type: ${dictionary.mappingType}`)
    for (const [raw, target] of Object.entries(dictionary.mappings)) {
      if (raw === target || own(dictionary.mappings, target)) throw new Error(`Identity or chained mapping: ${raw}`)
      if (index === 2 && !roles.has(target)) throw new Error(`Unsupported position target: ${target}`)
    }
  })
  for (const [raw, target] of Object.entries({ ...config.clubs.mappings, ...config.fm.mappings })) {
    if (own(config.clubs.mappings, raw) && own(config.fm.mappings, raw)) throw new Error(`Conflicting club mappings: ${raw}`)
    if (own(config.clubs.mappings, target) || own(config.fm.mappings, target)) throw new Error(`Chained club mapping: ${raw}`)
    if (own(config.vocabulary.unresolved, raw) || own(config.vocabulary.unresolved, target)) throw new Error(`Unresolved mapped club: ${raw}`)
    if (!config.vocabulary.recognized.includes(target)) throw new Error(`Unrecognized club target: ${target}`)
  }
  if (config.vocabulary.recognized.some(raw => own(config.vocabulary.unresolved, raw))) throw new Error("Club vocabulary has conflicting classifications")
  if (new Set(config.decisions.map(d => d.decisionId)).size !== config.decisions.length) throw new Error("Duplicate manual decision IDs")
}

export function reconcile(sourceBytes: Uint8Array, config: Config) {
  validateConfig(config)
  const sourceHash = sha256(sourceBytes)
  const source = sourceSchema.parse(JSON.parse(Buffer.from(sourceBytes).toString("utf8")))
  const collisions = new Map<string, number>()
  for (const player of source) collisions.set(nameKey(player.name), (collisions.get(nameKey(player.name)) ?? 0) + 1)
  const attachedDecisions = new Map<number, Config["decisions"]>()
  const staleDecisionIds: string[] = []
  for (const decision of config.decisions) {
    if (decision.sourceHash !== sourceHash) {
      staleDecisionIds.push(decision.decisionId)
      continue // Never attach a historical decision to a new row by name/index alone.
    }
    for (const ref of decision.sourceRefs) {
      if (source[ref.index]?.name !== ref.name) throw new Error(`Manual decision source mismatch: ${decision.decisionId}`)
      attachedDecisions.set(ref.index, [...(attachedDecisions.get(ref.index) ?? []), decision])
    }
  }
  const recognized = new Set(config.vocabulary.recognized)
  const records: ReconciledRecord[] = source.map((raw, sourceIndex) => {
    const clubs = normalizeValues(raw.clubs, [config.clubs, config.fm], value =>
      own(config.vocabulary.unresolved, value) ? config.vocabulary.unresolved[value] : (recognized.has(value) ? undefined : "New club label requires explicit review."))
    const positions = normalizeValues(raw.positions, [config.positions], value => roles.has(value) ? undefined : "Unknown position class.")
    const nationValues = normalizeValues(raw.nations, [config.nations], value => /^[A-Z]{3}$/.test(value) ? "Code equivalence not established in the audit; preserved unchanged." : undefined)
    const leagues = normalizeValues(raw.leagues, [])
    const positionCategory = classifyPositions(raw.positions, positions)
    const normalizedPositions = values(positions)
    const flags: string[] = []
    if (collisions.get(nameKey(raw.name))! > 1) flags.push("accent-normalized-name-collision")
    if (raw.name.trim().split(/\s+/).length === 1) flags.push("single-token-name")
    if (normalizedPositions.includes("GK") && normalizedPositions.some(p => ["ATT", "MID", "DEF"].includes(p))) flags.push("goalkeeper-outfield-position")
    if (["ATT", "MID", "DEF"].every(p => normalizedPositions.includes(p))) flags.push("all-outfield-positions")
    if (nationValues.length > 1) flags.push("ambiguous-nationality")
    if (!nationValues.length) flags.push("missing-nation")
    if (!leagues.length) flags.push("missing-league")
    if (clubs.some(c => c.evidence.some(e => e.category === "unresolved"))) flags.push("unresolved-club-name")
    if (clubs.length >= HIGH_CLUB_COUNT) flags.push("high-club-count-after-normalization")
    if (positionCategory === "missing-or-unresolved-position") flags.push("missing-or-unresolved-position")
    if (nationValues.some(n => n.evidence.some(e => e.category === "unresolved"))) flags.push("unresolved-nation-code")
    const reviewDecisions = structuredClone(attachedDecisions.get(sourceIndex) ?? [])
    flags.push(...reviewDecisions.flatMap(d => d.flags))
    if (reviewDecisions.length) flags.push("manual-review-decision")
    const hasUnresolved = [clubs, positions, nationValues].some(list => list.some(a => a.evidence.some(e => e.category === "unresolved")))
    return {
      sourceRef: `source-record:${String(sourceIndex).padStart(8, "0")}`, sourceIndex, sourceHash,
      originalName: raw.name, raw: structuredClone(raw), normalized: { clubs, positions, nationValues, leagues },
      positionCategory, flags: [...new Set(flags)].sort(compare),
      status: hasUnresolved ? "unresolved" : flags.length ? "review-required" : "no-review-flags", reviewDecisions,
    }
  })
  return { sourceHash, records, staleDecisionIds: staleDecisionIds.sort(compare) }
}

function tally(keys: string[]) {
  return Object.fromEntries([...new Set(keys)].sort(compare).map(key => [key, keys.filter(k => k === key).length]))
}

export function buildReports(result: ReturnType<typeof reconcile>, config: Config) {
  const { records } = result
  const allEvidence = (record: ReconciledRecord) => Object.values(record.normalized).flatMap(list => list.flatMap(a => a.evidence))
  const hasType = (record: ReconciledRecord, type: string) => allEvidence(record).some(e => e.mappingType === type)
  const clubMappings = [config.clubs, config.fm].flatMap(d => Object.entries(d.mappings).map(([raw, normalized]) => ({
    raw, normalized, mappingType: d.mappingType,
    occurrences: records.reduce((sum, r) => sum + r.raw.clubs.filter(c => c === raw).length, 0),
    records: records.filter(r => r.raw.clubs.includes(raw)).length,
  }))).sort((a, b) => compare(a.mappingType, b.mappingType) || compare(a.raw, b.raw))
  const priority = (r: ReconciledRecord) => r.flags.includes("suspected-identity-collision") ? 1
    : r.positionCategory === "all-four-position-classes" || r.flags.includes("goalkeeper-outfield-position") || r.flags.includes("high-club-count-after-normalization") ? 2
    : r.flags.includes("accent-normalized-name-collision") || r.flags.includes("all-outfield-positions") ? 3 : 4
  const reviewQueue = records.filter(r => r.flags.length).sort((a, b) => priority(a) - priority(b) || a.sourceIndex - b.sourceIndex).map(r => ({
    priority: priority(r), sourceRef: r.sourceRef, sourceHash: r.sourceHash, name: r.originalName,
    clubs: values(r.normalized.clubs), nations: values(r.normalized.nationValues), positions: values(r.normalized.positions),
    flags: r.flags, status: r.status, decisionIds: r.reviewDecisions.map(d => d.decisionId),
  }))
  return {
    summary: {
      pipelineVersion: PIPELINE_VERSION, sourceHash: result.sourceHash, totalRecords: records.length,
      noReviewFlags: records.filter(r => !r.flags.length).length,
      // A subset of noReviewFlags: only known ordinary mappings; FM counted separately.
      aliasesOnly: records.filter(r => !r.flags.length && !hasType(r, "fm-license-replacement") && allEvidence(r).some(e => e.category === "explicit-known-mapping")).length,
      recordsRequiringReview: reviewQueue.length,
      recordsWithFmReplacements: records.filter(r => hasType(r, "fm-license-replacement")).length,
      fmReplacementOccurrences: clubMappings.filter(m => m.mappingType === "fm-license-replacement").reduce((sum, m) => sum + m.occurrences, 0),
      recordsWithDeduplicatedClubs: records.filter(r => r.raw.clubs.length > r.normalized.clubs.length).length,
      nationValues: { single: records.filter(r => r.normalized.nationValues.length === 1).length, ambiguous: records.filter(r => r.normalized.nationValues.length > 1).length, missing: records.filter(r => !r.normalized.nationValues.length).length },
      positionCategories: tally(records.map(r => r.positionCategory)), flagCounts: tally(records.flatMap(r => r.flags)),
      thresholds: { highClubCount: HIGH_CLUB_COUNT }, staleDecisionIds: result.staleDecisionIds,
    },
    clubMappings, reviewQueue,
  }
}
