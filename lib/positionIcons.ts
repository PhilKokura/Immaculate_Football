const positionMapping = {
  DEF: "positions/DEF.png",
  MID: "positions/MID.png",
  ATT: "positions/ATT.png",
  GK: "positions/GK.png",
} as const

export function getPositionIconPath(positionName: string): string | null {
  const iconFile = positionMapping[positionName as keyof typeof positionMapping]
  return iconFile ? `/images/${iconFile}` : null
}

export function isPosition(constraint: string): boolean {
  return constraint in positionMapping
}

export function getPositionDisplayName(position: string): string {
  const displayNames = {
    DEF: "Defender",
    MID: "Midfielder",
    ATT: "Attacker",
    GK: "Goalkeeper",
  }
  return displayNames[position as keyof typeof displayNames] || position
}
