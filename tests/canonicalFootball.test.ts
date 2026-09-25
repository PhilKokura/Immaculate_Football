import assert from "node:assert/strict"
import { test } from "node:test"
import { players, teams, playerTeamHistory, legacyLinks, PLAYER_IDS, TEAM_IDS } from "../domain/football/example"
import type { Player, ExternalReference } from "../domain/football/types"

test("canonical assignments stay stable across order, display-name and provider changes", () => {
  assert.deepEqual(players.map(p => p.id), ["player:6e683a80-c5e1-4d55-a960-7d088de034a1", "player:02916b31-af24-4565-912e-d19bcf785431", "player:a39c4f08-9d75-491e-9c31-00a6d17e3278"])
  const changed = [...players].reverse().map(p => ({ ...p, displayName: "Corrected", externalRefs: [] }))
  assert.deepEqual(changed.map(p => p.id).sort(), players.map(p => p.id).sort())
})
test("display names are not unique identity keys", () => {
  const namesakes: Player[] = [{ ...players[0], displayName: "Same name" }, { ...players[1], displayName: "Same name" }]
  assert.equal(new Map(namesakes.map(p => [p.id, p])).size, 2)
})
test("external references are namespaced and independent of internal IDs", () => {
  const refs: ExternalReference[] = [{ provider: "api-football", externalId: "44" }, { provider: "another-provider", externalId: "44" }]
  assert.equal(new Set(refs.map(r => JSON.stringify([r.provider, r.externalId]))).size, 2)
  assert.deepEqual(players.map(p => p.externalRefs[0].externalId), ["44", "280", "257"])
  assert.ok(players.every(p => p.id !== `player:${p.externalRefs[0].externalId}` && p.gender === "male"))
})
test("clubs, reserves and national teams are distinct, all history references resolve", () => {
  const byId = new Map(teams.map(t => [t.id, t]))
  assert.equal(byId.size, teams.length)
  assert.equal(byId.get(TEAM_IDS.villarreal)?.teamType, "senior-club")
  assert.equal(byId.get(TEAM_IDS.villarrealII)?.teamType, "reserve-club")
  assert.equal(byId.get(TEAM_IDS.brazil)?.teamType, "national-team")
  assert.equal(byId.get(TEAM_IDS.brazilU17)?.teamType, "youth-national-team")
  assert.equal(playerTeamHistory.length, 19)
  assert.ok(playerTeamHistory.every(h => byId.has(h.teamId) && players.some(p => p.id === h.playerId)))
})
test("Corinthians empty seasons are preserved, distinct from unavailable season values", () => {
  const corinthians = playerTeamHistory.find(h => h.teamId === TEAM_IDS.corinthians)!
  assert.deepEqual(JSON.parse(JSON.stringify(corinthians)).seasons, [])
  assert.equal(corinthians.seasonAvailability, "observed-empty")
  assert.ok(playerTeamHistory.filter(h => h !== corinthians).every(h => h.seasonAvailability === "not-provided" && h.seasons.length === 0))
})
test("confirmed legacy links identify people without inheriting all source associations", () => {
  assert.equal(legacyLinks.length, 3)
  assert.ok(legacyLinks.every(l => l.status === "confirmed" && l.scope === "identity-only-no-association-inheritance"))
  assert.equal(legacyLinks.find(l => l.sourceRef === "source-record:00000034")?.canonicalPlayerId, PLAYER_IDS.marquinhos)
  const historyNames = (id: string) => playerTeamHistory.filter(h => h.playerId === id).map(h => teams.find(t => t.id === h.teamId)!.displayName)
  assert.ok(!historyNames(PLAYER_IDS.marquinhos).includes("Arsenal"))
  assert.ok(!historyNames(PLAYER_IDS.rodri).includes("Sevilla"))
  assert.equal(players.find(p => p.id === PLAYER_IDS.alisson)?.position, "GK")
  assert.ok(players.every(p => !("clubs" in p) && !("positions" in p)))
})
