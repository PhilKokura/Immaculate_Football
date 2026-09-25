import assert from "node:assert/strict"
import { runtimeCriterion } from "./runtimeCriterion"
import { test } from "node:test"
import { searchPlayers } from "../components/data/players"
import { checkCriteria, validatePlayerSelection, type PlayerWithImage } from "../lib/gameLogic"
import { createGameProgress, submitPlayerSelection } from "../lib/gameSubmission"

const serieA = runtimeCriterion("league", "Serie A")
const premierLeague = runtimeCriterion("league", "Premier League")

function makePlayer(id: string, name: string, searchNames: string[] = [name]): PlayerWithImage {
  return {
    id,
    externalId: id,
    name,
    searchNames,
    image: null,
    birthDate: null,
    clubs: [],
    clubNames: [],
    leagues: [serieA.value, premierLeague.value],
    nation: "Brazil",
    rarity: 0,
    positions: ["ATT"],
    achievements: [],
    currentClubs: [],
    currentClubAmbiguous: false,
  }
}

test("search includes a player who does not satisfy the selected cell", () => {
  const results = searchPlayers("haaland")
  const haaland = results.find(player => player.name.includes("Haaland"))
  assert.ok(haaland)
  assert.equal(checkCriteria(haaland, "nation:Japan") && checkCriteria(haaland, "position:DEF"), false)

  const submission = submitPlayerSelection(
    createGameProgress(),
    { rows: ["nation:Japan"], cols: ["position:DEF"] },
    haaland,
    "0-0",
  )
  assert.equal(submission.guesses, 1)
  assert.equal(submission.correctAnswers, 0)
  assert.equal(submission.remainingAttempts, 8)
  assert.equal(submission.gridState["0-0"], undefined)
  assert.ok(submission.lastError)
})

test("search is case-insensitive and ignores diacritics", () => {
  assert.deepEqual(
    searchPlayers("AKANJI").map(player => player.id),
    searchPlayers("akanji").map(player => player.id),
  )

  const araujo = makePlayer("test:araujo", "Ronald Araújo")
  assert.deepEqual(searchPlayers("araujo", 20, [araujo]).map(player => player.id), [araujo.id])
})

test("searchNames, punctuation, and hyphens are normalized", () => {
  const player = makePlayer("test:alias", "Manuel Obafemi Akanji", ["M. Akanji", "Akanji"])
  assert.deepEqual(searchPlayers("m akanji", 20, [player]).map(result => result.id), [player.id])
  const hyphenated = makePlayer("test:hyphen", "Jean-Pierre")
  assert.deepEqual(searchPlayers("jean pierre", 20, [hyphenated]).map(result => result.id), [hyphenated.id])
})

test("ranking is exact, prefix, token-prefix, then contains with stable ID ties", () => {
  const players = [
    makePlayer("5", "Alan Searchman"),
    makePlayer("4", "Searchman Alan"),
    makePlayer("3", "Researchman"),
    makePlayer("2", "Search"),
    makePlayer("1", "Search"),
  ]
  assert.deepEqual(searchPlayers("search", 20, players).map(player => player.id), ["1", "2", "4", "5", "3"])
  assert.deepEqual(searchPlayers("s", 20, players), [])
  assert.deepEqual(searchPlayers("", 20, players), [])
})

test("selection validity is decided by submission, and duplicate prevention uses player IDs", () => {
  const first = makePlayer("test:first", "Same Name")
  const second = makePlayer("test:second", "Same Name")
  const seed = { rows: ["nation:Brazil"], cols: [serieA.key, premierLeague.key] }

  assert.deepEqual(searchPlayers("same name", 20, [first, second]).map(player => player.id), [first.id, second.id])
  assert.equal(validatePlayerSelection(first, seed.rows[0], seed.cols[0]).isValid, true)

  const afterFirst = submitPlayerSelection(createGameProgress(), seed, first, "0-0")
  const reused = submitPlayerSelection(afterFirst, seed, first, "0-1")
  assert.equal(reused.guesses, 1)
  assert.match(reused.lastError, /already been used/)
  const afterSecond = submitPlayerSelection(afterFirst, seed, second, "0-1")
  assert.equal(afterSecond.correctAnswers, 2)
  assert.equal(afterSecond.usedPlayers.has(first.id), true)
  assert.equal(afterSecond.usedPlayers.has(second.id), true)
})
