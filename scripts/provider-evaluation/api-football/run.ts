import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { ReconciledRecord } from "../../reconciliation/model"
import { SAMPLE, QUERIES, envelope, profiles, teams, assess, type Status } from "./probe"

async function main() {
  const key = process.env.API_FOOTBALL_KEY?.trim()
  if (!key) { console.log("API_FOOTBALL_KEY unavailable; no requests made."); process.exitCode = 1; return }
  const directory = dirname(fileURLToPath(import.meta.url))
  const root = resolve(directory, "../../..")
  const hash = (s: string) => createHash("sha256").update(s).digest("hex")
  const cache = join(directory, ".local", hash(key))
  mkdirSync(cache, { recursive: true })
  const ledgerPath = join(cache, "requests.json")
  const ledger: string[] = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : []
  let liveRequests = 0, cacheHits = 0
  let blocked: Status | null = null
  async function request(path: string): Promise<ReturnType<typeof envelope>> {
    const file = join(cache, hash(path) + ".json")
    if (existsSync(file)) {
      cacheHits++
      const saved = JSON.parse(readFileSync(file, "utf8"))
      const result = envelope(saved.body, saved.http)
      if (["authentication-failure", "quota-rate-limit"].includes(result.status)) blocked = result.status
      return result
    }
    if (blocked) return { status: blocked, rows: [], truncated: false }
    if (ledger.length >= 15) return { status: "budget-exhausted", rows: [], truncated: false }
    // Keep below the free-plan per-minute rate; no automatic retries.
    if (liveRequests) await new Promise(r => setTimeout(r, 6500))
    liveRequests++; ledger.push(path); writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))
    try {
      const response = await fetch(`https://v3.football.api-sports.io/${path}`, { headers: { "x-apisports-key": key! }, signal: AbortSignal.timeout(20000), redirect: "error" })
      const text = await response.text()
      let body: unknown
      try { body = JSON.parse(text) } catch { return { status: response.status === 401 ? "authentication-failure" : response.status === 429 ? "quota-rate-limit" : "malformed-response", rows: [], truncated: false } }
      // Raw JSON body retained locally, with defensive credential redaction.
      writeFileSync(file, JSON.stringify({ http: response.status, body }).split(key!).join("[REDACTED]"))
      const result = envelope(body, response.status)
      if (["authentication-failure", "quota-rate-limit"].includes(result.status)) blocked = result.status
      return result
    } catch { return { status: "network-error", rows: [], truncated: false } }
  }
  const input = readFileSync(join(root, "data/reconciliation/reconciled-records.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s) as ReconciledRecord)
  const sources = SAMPLE.map(name => {
    const matches = input.filter(r => r.originalName === name)
    if (matches.length !== 1) throw new Error("Source sample mismatch")
    const r = matches[0]
    return { sourceRef: r.sourceRef, sourceHash: r.sourceHash, name, clubs: r.normalized.clubs.map(v => v.value), nations: r.normalized.nationValues.map(v => v.value), positions: r.normalized.positions.map(v => v.value) }
  })
  const searches: ReturnType<typeof envelope>[] = []
  for (const query of QUERIES) searches.push(await request(`players/profiles?search=${encodeURIComponent(query)}`))
  const candidates = searches.map(s => profiles(s.rows))
  // History IDs are explicitly selected after inspecting profiles, never first-result acceptance.
  const selected = (process.argv.find(a => a.startsWith("--history="))?.split("=")[1] ?? "").split(",").filter(Boolean).map(Number)
  const allowed = new Set(candidates.flat().map(c => c.id))
  if (selected.some(id => !allowed.has(id))) throw new Error("History ID was not returned in the six-player searches")
  const histories = new Map<number, { status: Status; teams: ReturnType<typeof teams> }>()
  for (const id of new Set(selected)) {
    const result = await request(`players/teams?player=${id}`)
    histories.set(id, { status: result.status, teams: teams(result.rows) })
  }
  const results = sources.map((source, i) => ({ ...source, searchStatus: searches[i].status, truncated: searches[i].truncated,
    candidates: candidates[i].map(c => ({ ...c, history: histories.get(c.id) ?? { status: "not-requested", teams: [] } })),
    limitations: ["Search is capped at one provider page; no automatic identity assignments.", "Gender may be absent: manually verify men's eligibility before accepting a candidate.", "Team/season associations are not proof of individual match appearances; missing history does not prove a source club is wrong."],
    assessment: assess(source.name, candidates[i], searches[i].status, searches[i].truncated, histories),
  }))
  writeFileSync(join(directory, ".local/report.json"), JSON.stringify({ liveRequests, totalRequests: ledger.length, cacheHits, results }, null, 2))
  console.log(JSON.stringify({ liveRequests, totalRequests: ledger.length, cacheHits, results }, null, 2))
}
main().catch(() => { console.error("Probe could not complete: check local source/cache and selected history IDs. Details suppressed to protect credentials."); process.exitCode = 1 })
