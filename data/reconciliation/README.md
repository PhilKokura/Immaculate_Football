# Offline football-data reconciliation

Run `pnpm data:audit` (equivalent: `node --import tsx scripts/data-audit.ts`).
Run `pnpm test` for reconciliation and gameplay regression tests.
The CLI resolves paths relative to the repository, so its input is independent of
the working directory. No runtime module imports this directory or these scripts.

## Inputs and provenance

The production input remains `components/data/clean_players.json`. The pipeline
reads its bytes without changing it and preserves an exact content-addressed copy
in `data/source/<sha256>.json`. Existing snapshots are checked, never overwritten.
`data/source/manifest.json` identifies the current input, snapshot, code hashes,
configuration hashes, and combined configuration/code hash. No timestamps enter
generated files. Identical source bytes, configuration, and code produce identical
outputs. Changing whitespace in the source changes its hash deliberately.

`reconciled-records.jsonl` contains one source row per line, in input order. Each
record includes the zero-based source index, `source-record:00000000` reference,
source hash, original name, complete raw object (including extra fields), normalized
associations, position category, flags, status, and attached manual evidence.
**Only `(sourceHash, sourceRef)` identifies a row. It is not a player identity.**
Associations have a display `value` and evidence entries for every raw occurrence,
including duplicates. Association ordering is lexical presentation order, never a
primary nation or a chronology. Raw arrays retain their original order.

## Dictionaries and uncertainty

- `club-aliases.json`: 50 exact alias strings in 45 high-confidence audit groups.
  The group target is a display label, not a canonical entity ID.
- `fm-club-replacements.json`: the eight audit replacements, separately marked
  `fm-license-replacement`; these are known licensing substitutions, not errors.
- `position-synonyms.json`: the four textual roles mapped to ATT/MID/DEF/GK.
- `nation-code-aliases.json`: only the 26 audit-established code/name equivalences.
- `club-vocabulary.json`: frozen source-label vocabulary plus unresolved labels and
  reasons. Recognized means retain the label, not externally verified identity.
  The uncertain variants from the audit, Vigo and the historical 1. FFC Frankfurt
  organization are not mapped. A new label is unresolved until explicitly reviewed.

There is no fuzzy matching, automatic alias discovery, or mapping-chain execution.
Conflicting, chained, self-referential, and unresolved club mappings fail validation.
Unmapped uppercase three-letter nation codes remain unchanged and receive
`unresolved-nation-code`. They are not assumed to be resolved countries. Historical
states and UK/home-nation distinctions remain separate. Unknown positions receive
`missing-or-unresolved-position`; no position is silently discarded.

Evidence distinguishes deterministic preservation/deduplication, explicit known
mappings, and unresolved values. Record flags/status mark review requirements.
`no-review-flags` means no current heuristic fired, **not verified correctness**.
No transfer dates, seasons, participation status, nationality priority, player
splits, or canonical IDs are inferred.

## Review rules and decisions

Flags include accent-stripped lowercase name collisions (NFD, U+0300–U+036F),
single-token names, GK plus outfield, all three outfield classes, ambiguous nation
values, missing nation/league, unresolved clubs/codes/positions, and at least six
normalized club labels. The all-outfield flag also includes the all-four cases.
Unusual positions or club counts alone never imply an identity collision.

`manual-decisions.json` seeds Rodri, Alisson, and Marquinhos as unresolved suspected
identity collisions, with notes and evidence links. Every decision has a stable
decision ID, exact source hash, one or more `{index, name}` row references, status,
explicit manual flags, notes, and evidence. Optional `mapping` describes a proposed
dictionary/raw/value change. The TypeScript/Zod schema supports:

- `confirmed-same-entity`, `confirmed-different-entities`, `split-required`
- `mapping-confirmed`, `mapping-rejected`, `unresolved`

Decisions are annotations only, including confirmed/rejected statuses. They never
execute merges, splits, or dictionary changes. Add an explicit reviewed dictionary
edit separately if appropriate. Evidence links are human-review references, not
automated proof. A matching hash with an incorrect index/name fails the run. A
different hash leaves the historical decision untouched and unattached, reports
its ID as stale, and emits a warning. Revisit these decisions after source updates;
never reattach them by name alone.

## Reports

- `data/reports/summary.json`: counts, thresholds, stale decisions and provenance.
- `data/reports/club-mappings.json`: every configured alias/FM mapping, including
  zero-use entries, with raw occurrence counts and distinct source-row counts.
- `data/reports/review-queue.json`: flagged rows with references, display fields,
  flags, decision IDs and priorities. Evidence/raw fields are in the JSONL records.

Priority 1 is manual suspected identity collisions; priority 2 is GK/outfield,
all-four positions or high normalized club count; priority 3 is accent collisions
or all-outfield positions; priority 4 is other flags. Ties use source index.
This is a triage order, not a confidence score.

`noReviewFlags` and `recordsRequiringReview` partition all rows. `aliasesOnly` is
a subset of noReviewFlags with at least one ordinary club/position/nation mapping
and no FM mapping. FM counts overlap the review categories. Nation `single` counts
single remaining values, including unresolved codes, not confirmed nationalities.
Position categories are exclusive: 36 GK-plus-outfield plus five all-four cases
produce the total 41 GK/outfield flags. Counts of different flags overlap.

Generated current outputs are replaced on each run; source snapshots and the
hand-maintained dictionaries/decisions are retained. Commit reviewed changes and
regenerated reports together. Malformed input/configuration fails instead of
silently dropping rows. This pipeline validates structure and evidence handling,
not the factual truth of the source.
