import type { Player, PlayerId, Team, TeamId, PlayerTeamHistory, LegacyPlayerLink } from "./types"

// Assigned once in this application namespace. Never regenerate from names,
// biographical attributes, provider IDs, or source-row order.
export const PLAYER_IDS = {
  rodri: "player:6e683a80-c5e1-4d55-a960-7d088de034a1",
  alisson: "player:02916b31-af24-4565-912e-d19bcf785431",
  marquinhos: "player:a39c4f08-9d75-491e-9c31-00a6d17e3278",
} as const satisfies Record<string, PlayerId>

export const players: readonly Player[] = [
  { id: PLAYER_IDS.rodri, displayName: "Rodri", firstName: "Rodrigo", lastName: "Hernández Cascante", dateOfBirth: "1996-06-22", nationality: "Spain", position: "MID", gender: "male", externalRefs: [{ provider: "api-football", externalId: "44" }] },
  { id: PLAYER_IDS.alisson, displayName: "Alisson Becker", firstName: "Alisson", lastName: "Ramsés Becker", dateOfBirth: "1992-10-02", nationality: "Brazil", position: "GK", gender: "male", externalRefs: [{ provider: "api-football", externalId: "280" }] },
  { id: PLAYER_IDS.marquinhos, displayName: "Marquinhos", firstName: "Marcos", lastName: "Aoás Corrêa", dateOfBirth: "1994-05-14", nationality: "Brazil", position: "DEF", gender: "male", externalRefs: [{ provider: "api-football", externalId: "257" }] },
]

// These are explicitly assigned immutable fixture keys, not name-derived IDs.
// No provider team IDs were supplied; empty externalRefs means unknown, not absent.
export const TEAM_IDS = {
  villarrealII: "team:amber", villarreal: "team:birch", atletico: "team:cedar",
  manchesterCity: "team:delta", barcelona: "team:elm", spain: "team:flint",
  spainU21: "team:granite", spainU19: "team:hazel", internacional: "team:iris",
  roma: "team:jade", liverpool: "team:kelp", brazil: "team:larch",
  brazilU17: "team:maple", corinthians: "team:north", psg: "team:opal", brazilU23: "team:pine",
} as const satisfies Record<string, TeamId>

export const teams: readonly Team[] = [
  { id: TEAM_IDS.villarrealII, displayName: "Villarreal II", teamType: "reserve-club", externalRefs: [] },
  { id: TEAM_IDS.villarreal, displayName: "Villarreal", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.atletico, displayName: "Atletico Madrid", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.manchesterCity, displayName: "Manchester City", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.barcelona, displayName: "Barcelona", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.spain, displayName: "Spain", teamType: "national-team", externalRefs: [] },
  { id: TEAM_IDS.spainU21, displayName: "Spain U21", teamType: "youth-national-team", externalRefs: [] },
  { id: TEAM_IDS.spainU19, displayName: "Spain U19", teamType: "youth-national-team", externalRefs: [] },
  { id: TEAM_IDS.internacional, displayName: "Internacional", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.roma, displayName: "AS Roma", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.liverpool, displayName: "Liverpool", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.brazil, displayName: "Brazil", teamType: "national-team", externalRefs: [] },
  { id: TEAM_IDS.brazilU17, displayName: "Brazil U17", teamType: "youth-national-team", externalRefs: [] },
  { id: TEAM_IDS.corinthians, displayName: "Corinthians", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.psg, displayName: "Paris Saint Germain", teamType: "senior-club", externalRefs: [] },
  { id: TEAM_IDS.brazilU23, displayName: "Brazil U23", teamType: "youth-national-team", externalRefs: [] },
]

const observationSource = {
  provider: "api-football", endpoint: "players/teams",
  reference: "User-supplied three-identity POC observations; no live call in this change",
}
function association(playerId: PlayerId, teamId: TeamId): PlayerTeamHistory {
  return { playerId, teamId, seasons: [],
    seasonAvailability: teamId === TEAM_IDS.corinthians ? "observed-empty" : "not-provided",
    evidenceSource: observationSource, evidenceType: "api-football-players-teams-association" }
}
export const playerTeamHistory: readonly PlayerTeamHistory[] = [
  ...[TEAM_IDS.villarrealII, TEAM_IDS.villarreal, TEAM_IDS.atletico, TEAM_IDS.manchesterCity, TEAM_IDS.barcelona, TEAM_IDS.spain, TEAM_IDS.spainU21, TEAM_IDS.spainU19].map(teamId => association(PLAYER_IDS.rodri, teamId)),
  ...[TEAM_IDS.internacional, TEAM_IDS.roma, TEAM_IDS.liverpool, TEAM_IDS.brazil, TEAM_IDS.brazilU17].map(teamId => association(PLAYER_IDS.alisson, teamId)),
  ...[TEAM_IDS.corinthians, TEAM_IDS.roma, TEAM_IDS.psg, TEAM_IDS.brazil, TEAM_IDS.brazilU23, TEAM_IDS.brazilU17].map(teamId => association(PLAYER_IDS.marquinhos, teamId)),
]

const sourceHash = "a0b938a62ceb0b3268453c042424bed69e84357d2d6a7ede96a627435e7a7e89"
export const legacyLinks: readonly LegacyPlayerLink[] = [
  { sourceHash, sourceRef: "source-record:00000001", canonicalPlayerId: PLAYER_IDS.rodri, status: "confirmed", scope: "identity-only-no-association-inheritance", evidence: ["User confirmed API-Football identity 44, Rodrigo Hernández Cascante, DOB 1996-06-22."] },
  { sourceHash, sourceRef: "source-record:00000014", canonicalPlayerId: PLAYER_IDS.alisson, status: "confirmed", scope: "identity-only-no-association-inheritance", evidence: ["User confirmed API-Football identity 280, Alisson Ramsés Becker, DOB 1992-10-02."] },
  { sourceHash, sourceRef: "source-record:00000034", canonicalPlayerId: PLAYER_IDS.marquinhos, status: "confirmed", scope: "identity-only-no-association-inheritance", evidence: ["User confirmed API-Football identity 257, Marcos Aoás Corrêa, DOB 1994-05-14."] },
]
