import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dictionarySchema, vocabularySchema, decisionsSchema, type Config } from "./model"

export const CONFIG_FILES = ["club-aliases.json", "fm-club-replacements.json", "position-synonyms.json", "nation-code-aliases.json", "club-vocabulary.json", "manual-decisions.json"] as const

export function loadConfig(directory: string): Config {
  const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"))
  return {
    clubs: dictionarySchema.parse(read(CONFIG_FILES[0])), fm: dictionarySchema.parse(read(CONFIG_FILES[1])),
    positions: dictionarySchema.parse(read(CONFIG_FILES[2])), nations: dictionarySchema.parse(read(CONFIG_FILES[3])),
    vocabulary: vocabularySchema.parse(read(CONFIG_FILES[4])), decisions: decisionsSchema.parse(read(CONFIG_FILES[5])).decisions,
  }
}
