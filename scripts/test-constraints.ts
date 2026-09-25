import { PLAYERS_DATABASE } from "../components/data/players"
import { ROWS, COLUMNS, validatePlayerSelection, checkInvalidPairing, validatePuzzle } from "../lib/gameLogic"

// Test function to check all grid intersections
function testAllIntersections() {
  const validation = validatePuzzle({ rows: ROWS, cols: COLUMNS }, PLAYERS_DATABASE)
  if (!validation.isValid) {
    throw new Error(`Puzzle is not playable: ${[...validation.errors, ...validation.invalidCells].join("; ")}`)
  }
  console.log("🔍 Testing Football Immaculate Grid Constraints\n")
  console.log("Grid Layout:")
  console.log("ROWS:", ROWS) // ["Bayern Munich", "Premier League", "Brazil"]
  console.log("COLUMNS:", COLUMNS) // ["Serie A", "Spain", "DEF"]
  console.log("\n" + "=".repeat(60) + "\n")

  const results: { [key: string]: any } = {}

  for (let rowIndex = 0; rowIndex < ROWS.length; rowIndex++) {
    for (let colIndex = 0; colIndex < COLUMNS.length; colIndex++) {
      const row = ROWS[rowIndex]
      const col = COLUMNS[colIndex]
      const cellKey = `${row} × ${col}`

      console.log(`📍 Testing Cell [${rowIndex},${colIndex}]: ${cellKey}`)

      // Check for invalid pairings first
      const invalidPairing = checkInvalidPairing(row, col)
      if (invalidPairing.isInvalid) {
        console.log(`❌ INVALID PAIRING: ${invalidPairing.reason}`)
        results[cellKey] = {
          isValid: false,
          reason: invalidPairing.reason,
          validPlayers: [],
        }
        console.log("")
        continue
      }

      // Find all players that satisfy both criteria
      const validPlayers = PLAYERS_DATABASE.filter((player) => {
        const validation = validatePlayerSelection(player, row, col)
        return validation.isValid
      })

      console.log(`✅ Valid players found: ${validPlayers.length}`)

      if (validPlayers.length > 0) {
        console.log("Players:", validPlayers.map((p) => `${p.name} (${p.nation}, ${p.positions.join(", ")})`).join(", "))
        results[cellKey] = {
          isValid: true,
          validPlayers: validPlayers.map((p) => ({
            name: p.name,
            nation: p.nation,
            positions: p.positions,
            clubs: p.clubs,
            leagues: p.leagues,
            rarity: p.rarity,
          })),
        }
      } else {
        console.log("⚠️  NO VALID PLAYERS FOUND!")
        results[cellKey] = {
          isValid: true,
          validPlayers: [],
        }
      }
      console.log("")
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("📊 SUMMARY")
  console.log("=".repeat(60))

  let totalCells = 0
  let invalidPairings = 0
  let emptyCells = 0
  let validCells = 0

  for (const [cellKey, result] of Object.entries(results)) {
    totalCells++
    if (!result.isValid) {
      invalidPairings++
      console.log(`❌ ${cellKey}: ${result.reason}`)
    } else if (result.validPlayers.length === 0) {
      emptyCells++
      console.log(`⚠️  ${cellKey}: No valid players`)
    } else {
      validCells++
      console.log(`✅ ${cellKey}: ${result.validPlayers.length} players`)
    }
  }

  console.log(`\nTotal cells: ${totalCells}`)
  console.log(`Invalid pairings: ${invalidPairings}`)
  console.log(`Empty cells: ${emptyCells}`)
  console.log(`Valid cells with players: ${validCells}`)

  if (emptyCells > 0 || invalidPairings > 0) {
    console.log("\n⚠️  ISSUES DETECTED - Some cells may be unsolvable!")
  } else {
    console.log("\n🎉 All cells have valid solutions!")
  }

  return results
}

// Run the test
testAllIntersections()
