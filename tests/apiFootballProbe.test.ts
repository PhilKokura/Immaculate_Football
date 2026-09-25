import assert from "node:assert/strict"
import { test } from "node:test"
import { envelope, profiles, assess } from "../scripts/provider-evaluation/api-football/probe"
test("profile parser preserves biography and excludes female candidates", () => {
  const players = profiles([{ player: { id: 1, name: "Player", firstname: "First", birth: { date: "1990-01-01" }, position: "Midfielder" } }, { player: { id: 2, gender: "female" } }])
  assert.equal(players.length, 1); assert.equal(players[0].dob, "1990-01-01"); assert.equal(players[0].position, "Midfielder")
})
test("HTTP 200 empty results are nonfatal", () => {
  const result = envelope({ errors: [], response: [] })
  assert.equal(result.status, "empty-result")
  assert.equal(assess("Ronaldinho", [], result.status, false, new Map()), "not-found")
})
test("multiple candidates are retained and ambiguous", () => {
  const players = profiles([{ player: { id: 1, name: "Alisson" } }, { player: { id: 2, name: "Alisson" } }])
  assert.equal(players.length, 2); assert.equal(assess("Alisson", players, "ok", false, new Map()), "ambiguous")
})
test("auth, quota, coverage and malformed responses are distinguished", () => {
  assert.equal(envelope({}, 401).status, "authentication-failure")
  assert.equal(envelope({ errors: { requests: "limit reached" }, response: [] }).status, "quota-rate-limit")
  assert.equal(envelope({ errors: { plan: "Free plan lacks access" }, response: [] }).status, "subscription-coverage")
  assert.equal(envelope({ response: null }).status, "malformed-response")
  assert.equal(assess("Zinedine Zidane", [], "subscription-coverage", false, new Map()), "insufficient-data")
})
