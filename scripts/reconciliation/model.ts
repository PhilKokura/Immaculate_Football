import { z } from "zod"

const text = z.string().min(1)
export const sourceSchema = z.array(z.object({
  name: text,
  clubs: z.array(text), leagues: z.array(text), nations: z.array(text), positions: z.array(text),
  rarity: z.number().min(0).max(1),
}).passthrough()) // Preserve extra source fields, too.
export type RawPlayer = z.infer<typeof sourceSchema>[number]

export const dictionarySchema = z.object({
  schemaVersion: z.literal(1), mappingType: text, evidence: z.array(text).min(1),
  mappings: z.record(text, text),
}).strict()
export const vocabularySchema = z.object({
  schemaVersion: z.literal(1), notes: text, recognized: z.array(text), unresolved: z.record(text, text),
}).strict()
export const decisionsSchema = z.object({
  schemaVersion: z.literal(1),
  decisions: z.array(z.object({
    decisionId: text,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRefs: z.array(z.object({ index: z.number().int().nonnegative(), name: text }).strict()).min(1),
    status: z.enum(["confirmed-same-entity", "confirmed-different-entities", "split-required", "mapping-confirmed", "mapping-rejected", "unresolved"]),
    flags: z.array(z.literal("suspected-identity-collision")),
    mapping: z.object({ dictionary: text, raw: text, proposedValue: text }).strict().optional(),
    notes: text, evidence: z.array(text).min(1),
  }).strict()),
}).strict()
export type Dictionary = z.infer<typeof dictionarySchema>
export type Decision = z.infer<typeof decisionsSchema>["decisions"][number]
export type Config = {
  clubs: Dictionary; fm: Dictionary; positions: Dictionary; nations: Dictionary
  vocabulary: z.infer<typeof vocabularySchema>; decisions: Decision[]
}
export type Evidence = {
  raw: string
  mappingType: string
  category: "deterministic-normalization" | "explicit-known-mapping" | "unresolved"
  note?: string
}
export type Association = { value: string; evidence: Evidence[] }
export type PositionCategory = "single-position" | "synonym-duplication-only" | "two-outfield-positions" | "three-outfield-positions" | "goalkeeper-plus-outfield" | "all-four-position-classes" | "missing-or-unresolved-position"
export type ReconciledRecord = {
  sourceRef: string; sourceIndex: number; sourceHash: string; originalName: string; raw: RawPlayer
  normalized: { clubs: Association[]; positions: Association[]; nationValues: Association[]; leagues: Association[] }
  positionCategory: PositionCategory
  flags: string[]
  status: "no-review-flags" | "review-required" | "unresolved"
  reviewDecisions: Decision[]
}
