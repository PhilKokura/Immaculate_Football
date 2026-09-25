import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CONFIG_FILES, loadConfig } from "./reconciliation/config"
import { buildReports, reconcile, sha256, PIPELINE_VERSION } from "./reconciliation/reconcile"

// Paths resolve against the repository, never the caller's working directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = "components/data/clean_players.json"
const input = readFileSync(join(root, sourcePath))
const configDirectory = join(root, "data/reconciliation")
const config = loadConfig(configDirectory)
const result = reconcile(input, config)
const reports = buildReports(result, config)
const versionedFiles = [...CONFIG_FILES.map(name => `data/reconciliation/${name}`), "scripts/data-audit.ts", "scripts/reconciliation/config.ts", "scripts/reconciliation/model.ts", "scripts/reconciliation/reconcile.ts"]
const fileHashes = Object.fromEntries(versionedFiles.map(name => [name, sha256(readFileSync(join(root, name)))]))
const provenance = { pipelineVersion: PIPELINE_VERSION, sourcePath, sourceHash: result.sourceHash, configurationAndCodeHash: sha256(JSON.stringify(fileHashes)), fileHashes }

const snapshotPath = `data/source/${result.sourceHash}.json`
mkdirSync(join(root, "data/source"), { recursive: true })
mkdirSync(join(root, "data/reports"), { recursive: true })
if (existsSync(join(root, snapshotPath))) {
  if (!readFileSync(join(root, snapshotPath)).equals(input)) throw new Error("Source snapshot hash/content mismatch; refusing overwrite")
} else {
  writeFileSync(join(root, snapshotPath), input, { flag: "wx" })
}
const writeJson = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n")
writeJson("data/source/manifest.json", { ...provenance, snapshotPath, totalRecords: result.records.length })
writeFileSync(join(configDirectory, "reconciled-records.jsonl"), result.records.map(record => JSON.stringify(record)).join("\n") + "\n")
writeJson("data/reports/summary.json", { ...reports.summary, provenance })
writeJson("data/reports/club-mappings.json", reports.clubMappings)
writeJson("data/reports/review-queue.json", reports.reviewQueue)
if (!readFileSync(join(root, sourcePath)).equals(input)) throw new Error("Production input changed during reconciliation; rerun with a stable source")
console.log(JSON.stringify(reports.summary, null, 2))
if (result.staleDecisionIds.length) console.warn("Review required: historical manual decisions were not applied to this source hash.")
