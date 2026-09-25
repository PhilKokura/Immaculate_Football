import "server-only"

import { createClient } from "@supabase/supabase-js"

/** Privileged client for trusted server code; never use for browser requests. */
export function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url) {
    throw new Error("Missing SUPABASE_URL")
  }
  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY")
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
