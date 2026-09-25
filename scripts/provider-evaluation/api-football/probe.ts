import { nameKey } from "../../reconciliation/reconcile"

export const SAMPLE = ["Rodri", "Alisson", "Marquinhos", "Robert Lewandowski", "Zinedine Zidane", "Ronaldinho"]
export const QUERIES = ["Rodri", "Alisson", "Marquinhos", "Lewandowski", "Zidane", "Ronaldinho"]
type Row = Record<string, any>
export type Status = "ok" | "empty-result" | "authentication-failure" | "quota-rate-limit" | "subscription-coverage" | "malformed-response" | "network-error" | "budget-exhausted"
export function envelope(body: unknown, http = 200): { status: Status; rows: Row[]; truncated: boolean } {
  const b = body as Row | null
  const errors = b?.errors
  const message = JSON.stringify(errors ?? {}).toLowerCase()
  let status: Status = "ok"
  if (http === 401 || /token|api.?key|unauthorized|authentication/.test(message)) status = "authentication-failure"
  else if (http === 429 || /rate|quota|limit|requests/.test(message)) status = "quota-rate-limit"
  else if (http === 403 || /subscription|plan|access|permission|season/.test(message)) status = "subscription-coverage"
  else if (http >= 400 || (errors && Object.keys(errors).length) || !Array.isArray(b?.response) || b.response.some((r: unknown) => r === null || typeof r !== "object")) status = "malformed-response"
  if (status !== "ok") return { status, rows: [], truncated: false }
  return { status: b!.response.length ? "ok" : "empty-result", rows: b!.response, truncated: Number(b!.paging?.total ?? 1) > Number(b!.paging?.current ?? 1) }
}
const female = (v: unknown) => /^(female|women|f)$/i.test(String(v))
export function profiles(rows: Row[]) {
  return rows.map(r => r.player ?? r).filter(p => p && Number.isSafeInteger(p.id) && !female(p.gender)).map(p => ({
    id: p.id as number, name: p.name ?? null, firstname: p.firstname ?? null, lastname: p.lastname ?? null,
    dob: p.birth?.date ?? null, nationality: p.nationality ?? null, position: p.position ?? null, gender: p.gender ?? null,
  }))
}
export function teams(rows: Row[]) {
  return rows.filter(r => r.team && !female(r.team.gender) && !r.team.national && !/women|féminin/i.test(r.team.name ?? ""))
    .map(r => ({ id: r.team.id, name: r.team.name, seasons: r.seasons ?? [], evidenceType: "provider-team-seasons" }))
}
export function assess(name: string, candidates: ReturnType<typeof profiles>, status: Status, truncated: boolean, histories: Map<number, { status: Status; teams: ReturnType<typeof teams> }>) {
  if (!["ok", "empty-result"].includes(status)) return "insufficient-data"
  if (!candidates.length) return truncated ? "insufficient-data" : "not-found"
  if (candidates.length > 1 || SAMPLE.slice(0, 3).includes(name)) return "ambiguous"
  const p = candidates[0]
  const exactName = [p.name, `${p.firstname ?? ""} ${p.lastname ?? ""}`.trim()].some(n => n && nameKey(n) === nameKey(name))
  return !truncated && exactName && p.dob && histories.get(p.id)?.teams.length ? "strong-candidate" : "insufficient-data"
}
