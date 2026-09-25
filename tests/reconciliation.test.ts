import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { loadConfig } from "../scripts/reconciliation/config"
import { decisionsSchema, type RawPlayer } from "../scripts/reconciliation/model"
import { buildReports, reconcile, sha256, values } from "../scripts/reconciliation/reconcile"

const config = loadConfig(fileURLToPath(new URL("../data/reconciliation", import.meta.url)))
const fixtureConfig = { ...config, decisions: [] }
const player = (fields: Partial<RawPlayer> = {}): RawPlayer => ({ name: "Example Player", clubs: ["Bayern Munich"], positions: ["ATT"], nations: ["Germany"], leagues: ["Bundesliga"], rarity: 0.5, ...fields })
const bytes = (rows: RawPlayer[]) => Buffer.from(JSON.stringify(rows))
const run = (...rows: RawPlayer[]) => reconcile(bytes(rows), fixtureConfig)

test("ordinary club aliases collapse while retaining both evidence values", () => {
  const r = run(player({ clubs: ["Bayern Munich", "FC Bayern Munich"] })).records[0]
  assert.deepEqual(values(r.normalized.clubs), ["Bayern Munich"])
  assert.deepEqual(r.normalized.clubs[0].evidence.map(e => [e.raw, e.mappingType]), [["Bayern Munich", "unchanged"], ["FC Bayern Munich", "club-alias"]])
})

test("all eight FM replacements have licensing provenance, never generic alias or error", () => {
  assert.equal(Object.keys(config.fm.mappings).length, 8)
  for (const [raw, target] of Object.entries(config.fm.mappings)) {
    const r = run(player({ clubs: [raw, target] })).records[0]
    assert.deepEqual(values(r.normalized.clubs), [target])
    assert.equal(r.normalized.clubs[0].evidence[0].mappingType, "fm-license-replacement")
    assert.equal(r.normalized.clubs[0].evidence[0].category, "explicit-known-mapping")
    assert.ok(!r.flags.includes("unresolved-club-name"))
  }
  assert.equal(config.fm.mappings.Parthenope, "Napoli")
})

test("position synonyms deduplicate and review categories remain distinct", () => {
  const cases = [
    [["ATT"], "single-position"], [["ATT", "Attacker"], "synonym-duplication-only"],
    [["ATT", "MID"], "two-outfield-positions"], [["ATT", "MID", "DEF"], "three-outfield-positions"],
    [["GK", "Midfielder"], "goalkeeper-plus-outfield"], [["GK", "MID", "DEF", "ATT"], "all-four-position-classes"],
  ] as const
  for (const [positions, category] of cases) assert.equal(run(player({ positions: [...positions] })).records[0].positionCategory, category)
  const r = run(player({ positions: ["ATT", "Attacker"] })).records[0]
  assert.deepEqual(values(r.normalized.positions), ["ATT"])
  assert.equal(r.normalized.positions[0].evidence.length, 2)
})

test("safe nation equivalences collapse, genuine ambiguity remains with no priority", () => {
  assert.equal(Object.keys(config.nations.mappings).length, 26)
  const polish = run(player({ nations: ["Poland", "POL"] })).records[0]
  assert.deepEqual(values(polish.normalized.nationValues), ["Poland"])
  assert.ok(!polish.flags.includes("ambiguous-nationality"))
  const ambiguous = run(player({ nations: ["TUR", "Turkey", "Germany"] })).records[0]
  assert.deepEqual(values(ambiguous.normalized.nationValues), ["Germany", "Turkey"])
  assert.ok(ambiguous.flags.includes("ambiguous-nationality"))
  assert.deepEqual(values(run(player({ nations: ["Germany", "Turkey", "TUR"] })).records[0].normalized.nationValues), values(ambiguous.normalized.nationValues))
  assert.equal(run(player({ nations: ["United Kingdom", "England", "Yugoslavia"] })).records[0].normalized.nationValues.length, 3)
})

test("raw provenance is complete and detached from caller input", () => {
  const raw = player({ clubs: ["Parthenope", "Napoli", "Napoli"], nations: ["POL", "Poland"], extraSourceField: { untouched: true } })
  const input = bytes([raw]); const before = Buffer.from(input)
  const r = reconcile(input, fixtureConfig).records[0]
  assert.deepEqual(r.raw, raw)
  assert.equal(r.originalName, raw.name)
  assert.equal(r.sourceIndex, 0)
  assert.equal(r.sourceRef, "source-record:00000000")
  assert.equal(r.sourceHash, sha256(input))
  assert.equal(r.normalized.clubs[0].evidence.length, 3)
  r.raw.clubs.push("Modified output")
  assert.deepEqual(input, before)
  assert.deepEqual(raw.clubs, ["Parthenope", "Napoli", "Napoli"])
})

test("unknown and uncertain values are preserved and flagged, never guessed", () => {
  const r = run(player({ clubs: ["Vigo", "1. FFC Frankfurt", "New Club", "FC Valencia"], positions: ["Sweeper"], nations: ["XYZ"] })).records[0]
  assert.deepEqual(values(r.normalized.clubs), ["1. FFC Frankfurt", "FC Valencia", "New Club", "Vigo"])
  assert.ok(r.flags.includes("unresolved-club-name"))
  assert.ok(r.flags.includes("unresolved-nation-code"))
  assert.ok(r.flags.includes("missing-or-unresolved-position"))
  assert.equal(r.status, "unresolved")
})

test("identity flags and normalized club threshold do not diagnose or split players", () => {
  const rows = [player({ name: "José", positions: ["GK", "ATT", "MID", "DEF"], nations: [], leagues: [], clubs: ["Bayern Munich", "FC Bayern Munich", "Napoli", "Lecce", "Real Madrid", "Arsenal", "Chelsea"] }), player({ name: "Jose" })]
  const result = run(...rows)
  for (const flag of ["accent-normalized-name-collision", "single-token-name", "goalkeeper-outfield-position", "all-outfield-positions", "missing-nation", "missing-league", "high-club-count-after-normalization"]) assert.ok(result.records[0].flags.includes(flag), flag)
  assert.equal(result.records.length, 2)
  assert.ok(!result.records[0].flags.includes("suspected-identity-collision"))
  assert.ok(!run(player({ clubs: ["Bayern Munich", "FC Bayern Munich", "Napoli", "Lecce", "Real Madrid", "Arsenal"] })).records[0].flags.includes("high-club-count-after-normalization"))
})

test("manual decisions are evidence only, pinned to source hash and row", () => {
  const input = bytes([player()])
  const decision = { ...config.decisions[0], sourceHash: sha256(input), sourceRefs: [{ index: 0, name: "Example Player" }], status: "split-required" as const }
  const result = reconcile(input, { ...fixtureConfig, decisions: [decision] })
  assert.equal(result.records.length, 1)
  assert.deepEqual(result.records[0].raw, player())
  assert.ok(result.records[0].flags.includes("suspected-identity-collision"))
  assert.deepEqual(reconcile(input, config).staleDecisionIds, config.decisions.map(d => d.decisionId).sort())
  assert.ok(!reconcile(input, config).records[0].flags.includes("suspected-identity-collision"))
  assert.throws(() => reconcile(input, { ...fixtureConfig, decisions: [{ ...decision, sourceRefs: [{ index: 0, name: "Wrong" }] }] }), /source mismatch/)
  for (const status of ["confirmed-same-entity", "confirmed-different-entities", "split-required", "mapping-confirmed", "mapping-rejected", "unresolved"]) {
    assert.ok(decisionsSchema.safeParse({ schemaVersion: 1, decisions: [{ ...decision, status }] }).success)
  }
})

test("conflicting or chained mappings fail explicitly", () => {
  assert.throws(() => runWithClubMap({ "FC Bayern Munich": "Bayern Munich", "Bayern Munich": "Napoli" }), /chained mapping/)
  function runWithClubMap(mappings: Record<string, string>) { return reconcile(bytes([player()]), { ...fixtureConfig, clubs: { ...config.clubs, mappings } }) }
  assert.throws(() => reconcile(bytes([player()]), { ...fixtureConfig, fm: { ...config.fm, mappings: { "FC Bayern Munich": "Napoli" } } }), /Conflicting club mappings/)
})

test("real dataset reconciliation and report statistics are deterministic", () => {
  const input = readFileSync(fileURLToPath(new URL("../components/data/clean_players.json", import.meta.url)))
  const first = reconcile(input, config); const second = reconcile(input, config)
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  const reports = buildReports(first, config)
  assert.deepEqual(reports, buildReports(second, config))
  assert.equal(first.records.length, 8198)
  assert.equal(reports.summary.recordsWithFmReplacements, 399)
  assert.deepEqual(reports.summary.nationValues, { single: 7536, ambiguous: 597, missing: 65 })
  assert.deepEqual(first.staleDecisionIds, [])
  assert.deepEqual(reports.reviewQueue.slice(0, 3).map(r => r.name), ["Rodri", "Alisson", "Marquinhos"])
  assert.equal(reports.summary.noReviewFlags + reports.summary.recordsRequiringReview, first.records.length)
})
