import { CLUBS, LEAGUES, NATIONS, POSITIONS, validateSeedWithMinimum } from "@/lib/gameLogic"
import fs from "fs"

type Seed = {
  rows: string[]
  cols: string[]
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateSeed(): Seed {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const rows = [pickRandom(CLUBS), pickRandom(LEAGUES), pickRandom(NATIONS)]
    // A nation on both axes is forbidden by gameplay validation.
    const cols = [pickRandom(LEAGUES), pickRandom(POSITIONS), pickRandom(CLUBS)]
    if (validateSeedWithMinimum(rows, cols, 5)) return { rows, cols }
  }
  throw new Error("Could not generate a playable seed with five players per cell")
}

function generateSeeds(n: number): Seed[] {
  const seeds: Seed[] = []
  while (seeds.length < n) {
    const seed = generateSeed()
    // optional: doppelte Seeds vermeiden
    if (!seeds.some((s) => JSON.stringify(s) === JSON.stringify(seed))) {
      seeds.push(seed)
    }
  }
  return seeds
}

// 50 Seeds generieren
const seeds = generateSeeds(50)

// Datei speichern
fs.writeFileSync("data/seeds.json", JSON.stringify(seeds, null, 2), "utf-8")
console.log("✅ 50 Seeds gespeichert in data/seeds.json")
