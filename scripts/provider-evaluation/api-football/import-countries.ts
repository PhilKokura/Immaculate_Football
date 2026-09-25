import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const cacheFile = join(dirname(fileURLToPath(import.meta.url)), ".local", "active-top5", "raw", "countries", "countries.json")

function validCountries(body: unknown): body is { response: unknown[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false
  const value = body as Record<string, unknown>
  return Array.isArray(value.response) && value.response.length > 0 &&
    value.response.every(country => country !== null && typeof country === "object" && !Array.isArray(country))
}

async function main() {
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as unknown
    if (!validCountries(cached)) throw new Error("Cached countries response is malformed")
    console.log(`Countries loaded from cache: ${cached.response.length}; live requests: 0`)
    return
  }

  const key = process.env.API_FOOTBALL_KEY?.trim()
  if (!key) throw new Error("API_FOOTBALL_KEY is missing; no request made")
  let response: Response
  try {
    response = await fetch("https://v3.football.api-sports.io/countries", {
      headers: { "x-apisports-key": key },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    })
  } catch {
    throw new Error("Network request failed")
  }
  const body: unknown = await response.json()
  if (!response.ok || !validCountries(body)) throw new Error(`Countries request failed or returned malformed data (HTTP ${response.status})`)
  const errors = (body as { errors?: unknown }).errors
  if (errors && JSON.stringify(errors) !== "[]" && JSON.stringify(errors) !== "{}") throw new Error("Countries request returned a provider error")
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(body) + "\n", { flag: "wx" })
  console.log(`Countries cached: ${body.response.length}; live requests: 1`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Countries import failed")
  process.exitCode = 1
})
