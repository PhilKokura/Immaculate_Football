export type PlayerId = `player:${string}`
export type TeamId = `team:${string}`

/** External IDs are meaningful only together with their provider namespace. */
export interface ExternalReference {
  provider: string
  externalId: string
}

export interface Player {
  id: PlayerId
  displayName: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string // ISO YYYY-MM-DD
  nationality?: string // Identity attribute, not national-team participation evidence.
  position?: "ATT" | "MID" | "DEF" | "GK"
  gender: "male"
  externalRefs: readonly ExternalReference[]
}

export type TeamType = "senior-club" | "reserve-club" | "national-team" | "youth-national-team" | "unknown"
export interface Team {
  id: TeamId
  displayName: string
  teamType: TeamType
  externalRefs: readonly ExternalReference[]
}

export interface PlayerTeamHistory {
  playerId: PlayerId
  teamId: TeamId
  seasons: readonly number[] // Provider season values; never inferred from a career timeline.
  seasonAvailability: "provided" | "observed-empty" | "not-provided"
  evidenceSource: {
    provider: string
    endpoint: string
    reference: string
  }
  /** Association only: does not prove an individual match appearance. */
  evidenceType: "api-football-players-teams-association"
}

export interface LegacyPlayerLink {
  sourceHash: string
  sourceRef: `source-record:${string}`
  canonicalPlayerId: PlayerId
  status: "confirmed" | "candidate" | "rejected"
  /** Identifies ONE person within a potentially conflated row, not all its claims. */
  scope: "identity-only-no-association-inheritance"
  evidence: readonly string[]
}
