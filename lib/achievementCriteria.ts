/** Stable achievement keys used for runtime validation and the V1 header pool. */
export const V1_ACHIEVEMENT_KEYS = [
  "world-cup-winner",
  "euro-winner",
  "copa-america-winner",
  "champions-league-winner",
  "europa-league-winner",
  "premier-league-champion",
  "bundesliga-champion",
  "la-liga-champion",
  "serie-a-champion",
  "ligue-1-champion",
] as const

/** FootGrid league criterion keys; only the matching domestic title/league pair is redundant. */
export const CHAMPION_LEAGUE_KEY_BY_ACHIEVEMENT: Readonly<Record<string, string>> = {
  "premier-league-champion": "league:d9f6bb17-0d15-4dee-9e4b-34fe0eb0f7ae",
  "bundesliga-champion": "league:adc6642a-fc45-459e-b8e3-514166327280",
  "la-liga-champion": "league:48b9b48f-4075-4d35-9d7a-0191448f5e5d",
  "serie-a-champion": "league:18e907aa-c59d-4a67-aa1f-871a43438bb8",
  "ligue-1-champion": "league:a8d2dfd4-d683-4ecf-859d-303f981ca14a",
}

