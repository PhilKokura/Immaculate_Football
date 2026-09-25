import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { importTop5, type Requester } from "../scripts/provider-evaluation/api-football/active-top5"

const ok = (response: unknown[]) => ({ httpStatus: 200, body: { errors: [], response } })
test("deduplicates players while keeping separate memberships and resumes from raw caches", async () => {
  const dir = mkdtempSync(join(tmpdir(), "top5-test-"))
  const calls: string[] = []
  const request: Requester = async path => {
    calls.push(path)
    if (path.startsWith("teams?league=39")) return ok([{ team: { id: 10, name: "Alpha", country: "England" } }, { team: { id: 11, name: "Beta", country: "England" } }])
    if (path.startsWith("teams?")) return ok([])
    if (path.endsWith("team=10")) return ok([{ team: { id: 10 }, players: [{ id: 100, name: "Shared", age: 25 }] }])
    return ok([{ team: { id: 11 }, players: [{ id: 100, name: "Shared", age: 25 }] }])
  }
  try {
    const first = await importTop5(dir, request, 5)
    assert.equal(first.liveRequests, 5)
    assert.equal(first.remainingSquads, 2)
    assert.equal(first.partial, true)
    const second = await importTop5(dir, request, 2)
    assert.equal(second.liveRequests, 2)
    assert.equal(second.cacheHits, 5)
    assert.equal(second.remainingSquads, 0)
    assert.equal(second.uniquePlayers, 1)
    assert.equal(second.memberships, 2)
    assert.equal(JSON.parse(readFileSync(join(dir, "players.json"), "utf8")).length, 1)
    assert.equal(JSON.parse(readFileSync(join(dir, "player-team-memberships.json"), "utf8")).length, 2)
    const third = await importTop5(dir, request, 0)
    assert.equal(third.liveRequests, 0)
    assert.equal(calls.length, 7)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
