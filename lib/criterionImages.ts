import {
  getCriterionDisplayName,
  getCriterionType,
  getCriterionValue,
} from "@/lib/gameLogic"
import { getCriterion } from "@/components/data/gameData"
import { getNationFlagPath } from "@/lib/nationFlags"
import { getPositionIconPath } from "@/lib/positionIcons"
import { getLeagueIcon } from "@/lib/leagueIcons"
import { getClubIcon } from "@/lib/clubIcons"

/** Runtime criterion art first, with the existing local display fallbacks. */
export function getCriterionImage(criterionKey: string): string | null {
  const runtimeImage = getCriterion(criterionKey)?.image
  if (runtimeImage) return runtimeImage

  const type = getCriterionType(criterionKey)
  const value = getCriterionValue(criterionKey)
  const label = getCriterionDisplayName(criterionKey)

  if (!type || !value) return null
  if (type === "nation") return getNationFlagPath(label)
  if (type === "position") return getPositionIconPath(value)
  if (type === "league") return getLeagueIcon(label)
  if (type === "club") return getClubIcon(label)

  return null
}
