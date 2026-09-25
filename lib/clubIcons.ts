import clubLogos from "../components/data/club_logos.json"

export function getClubIcon(clubName: string): string | null {
  const logoUrl = clubLogos[clubName as keyof typeof clubLogos]

  if (logoUrl && logoUrl !== null) {
    console.log(`[v0] Club icon for ${clubName}: ${logoUrl}`)
    return logoUrl
  }

  if (clubName === "Real Madrid" || clubName === "Paris Saint-Germain") {
    console.log(
      `[v0] SPECIFIC DEBUG - ${clubName} not found in logos. Available keys:`,
      Object.keys(clubLogos).filter((key) => key.includes("Real") || key.includes("Paris")),
    )
  }

  console.log(`[v0] No club icon found for: ${clubName}`)
  return null
}

export function hasClubIcon(clubName: string): boolean {
  const logoUrl = clubLogos[clubName as keyof typeof clubLogos]
  return logoUrl !== null && logoUrl !== undefined
}
