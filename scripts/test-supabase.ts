import { createSupabaseServerClient } from "../lib/supabase/server"

async function main() {
  const missing = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
    (name) => !process.env[name],
  )
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`)
    process.exitCode = 1
    return
  }

  const supabase = createSupabaseServerClient()
  // HEAD verifies access, including an empty table, without fetching row data.
  const { error, status } = await supabase
    .schema("public")
    .from("daily_puzzles")
    .select("*", { head: true })
    .limit(1)
    .abortSignal(AbortSignal.timeout(15_000))

  if (error) {
    // Do not log response bodies or errors that might contain credentials.
    console.error(`Supabase connection test failed (HTTP ${status}).`)
    process.exitCode = 1
    return
  }

  console.log(`Supabase connection successful: public.daily_puzzles is readable (HTTP ${status}).`)
}

main().catch(() => {
  console.error("Supabase connection test failed. Check the server environment variables and network connection.")
  process.exitCode = 1
})
