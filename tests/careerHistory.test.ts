import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { importCareerHistory, parseHistoryReply } from "../scripts/provider-evaluation/api-football/career-history"
import type { Requester } from "../scripts/provider-evaluation/api-football/active-top5"

const association = (id: number, name: string, seasons: unknown[], logo: string | null = null) => ({ team: { id, name, logo }, seasons })
const reply = (id: number, response: unknown[]) => ({ httpStatus: 200, body: { get: "players/teams", parameters: { player: String(id) }, errors: [], response } })

test("imports only whitelist IDs, resumes from individual caches, and preserves provider associations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "career-history-"))
  writeFileSync(join(directory, "players.json"), JSON.stringify([1, 2, 3].map(id => ({ externalRef: { provider: "api-football", externalId: String(id) } }))))
  const cacheDir = join(directory, "raw", "player-team-history")
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(join(cacheDir, "999.json"), JSON.stringify(reply(999, [association(999, "Off whitelist", [2020])]).body))
  const calls: string[] = []
  const requester: Requester = async path => {
    calls.push(path)
    const id = Number(path.split("=")[1])
    if (id === 1) return reply(1, [association(10, "Club", [2022, 2021], "logo"), association(20, "Reserve", ["2019-2020"]), association(30, "National", [])])
    if (id === 2) return reply(2, [association(10, "Club", [2026]), association(40, "Youth national", [])])
    return reply(3, [])
  }
  try {
    const first = await importCareerHistory(directory, requester, 2, 250)
    assert.equal(first.liveRequests, 2)
    assert.equal(first.playersStillMissingHistory, 1)
    assert.equal(first.stopReason, "budget")
    const second = await importCareerHistory(directory, requester, 1, 250)
    assert.equal(second.liveRequests, 1)
    assert.equal(second.cacheHits, 2)
    assert.equal(second.playersWithCachedHistory, 3)
    assert.equal(second.playersStillMissingHistory, 0)
    assert.equal(second.complete, true)
    assert.equal(second.totalTeamAssociations, 5)
    assert.equal(second.uniqueTeams, 4)
    assert.equal(second.associationsWithEmptySeasonArrays, 2)
    const histories = JSON.parse(readFileSync(join(directory, "player-team-history.json"), "utf8"))
    assert.deepEqual(histories.map((item: { playerExternalRef: { externalId: string } }) => item.playerExternalRef.externalId), ["1", "1", "1", "2", "2"])
    assert.deepEqual(histories[0].seasons, [2022, 2021])
    assert.deepEqual(histories[1].seasons, ["2019-2020"])
    assert.deepEqual(histories[2].seasons, [])
    assert.equal(histories[0].evidenceType, "api-football-player-teams")
    assert.equal(histories[0].providerTeamLogo, "logo")
    assert.equal("appearances" in histories[0], false)
    assert.equal("teamType" in histories[0], false)
    const teams = JSON.parse(readFileSync(join(directory, "career-teams.json"), "utf8"))
    assert.deepEqual(teams.map((team: { externalRef: { externalId: string } }) => team.externalRef.externalId), ["10", "20", "30", "40"])
    assert.equal("teamType" in teams[0], false)
    assert.deepEqual(JSON.parse(readFileSync(join(cacheDir, "1.json"), "utf8")).response[0].seasons, [2022, 2021])
    const third = await importCareerHistory(directory, requester, 0, 250)
    assert.equal(third.liveRequests, 0)
    assert.equal(third.cacheHits, 3)
    assert.deepEqual(calls, ["players/teams?player=1", "players/teams?player=2", "players/teams?player=3"])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("rejects mismatched provider player parameter and distinguishes quota failures", () => {
  assert.equal(parseHistoryReply(reply(8, []), "7").failure, "malformed")
  assert.equal(parseHistoryReply({ httpStatus: 429, body: { errors: { requests: "rate limit" } } }, "7").failure, "quota")
})
