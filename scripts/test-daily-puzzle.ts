import { getOrCreateDailyPuzzle } from "../lib/dailyPuzzle"

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const first = await getOrCreateDailyPuzzle(today)

  console.log(`Puzzle ID: ${first.id}`)
  console.log(`Puzzle date: ${first.puzzle_date}`)
  console.log(`Row criteria: ${JSON.stringify(first.row_criteria)}`)
  console.log(`Column criteria: ${JSON.stringify(first.column_criteria)}`)

  const second = await getOrCreateDailyPuzzle(today)
  if (second.id !== first.id) {
    throw new Error("Daily puzzle read-back returned a different ID")
  }
  console.log(`Second call returned the same puzzle ID: ${second.id}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Daily puzzle test failed")
  process.exitCode = 1
})
