// Shared runtime nation identity and flag rules. Country codes only affect presentation.
export const canonicalNationAliases: Record<string, string> = {
  "Czech Republic": "Czechia",
  Turkey: "Türkiye",
}

export const nationCountryCodes: Record<string, string> = {
  "Bosnia and Herzegovina": "BA",
  "Burkina Faso": "BF",
  "Côte d'Ivoire": "CI",
  "Cape Verde": "CV",
  "Central African Republic": "CF",
  "China PR": "CN",
  Comoros: "KM",
  Congo: "CG",
  "Congo DR": "CD",
  "Costa Rica": "CR",
  Czechia: "CZ",
  "Dominican Republic": "DO",
  "Equatorial Guinea": "GQ",
  "Guinea-Bissau": "GW",
  "Korea Republic": "KR",
  Mozambique: "MZ",
  "New Zealand": "NZ",
  Niger: "NE",
  "North Macedonia": "MK",
  "Northern Ireland": "GB-NIR",
  "Republic of Ireland": "IE",
  "Saudi Arabia": "SA",
  "Sierra Leone": "SL",
  Türkiye: "TR",
}

// These eight API-Sports assets were verified during the original runtime build.
export const verifiedMissingCountryFlags: Record<string, string> = {
  "Cape Verde": "https://media.api-sports.io/flags/cv.svg",
  "Central African Republic": "https://media.api-sports.io/flags/cf.svg",
  Comoros: "https://media.api-sports.io/flags/km.svg",
  "Equatorial Guinea": "https://media.api-sports.io/flags/gq.svg",
  "Guinea-Bissau": "https://media.api-sports.io/flags/gw.svg",
  Mozambique: "https://media.api-sports.io/flags/mz.svg",
  Niger: "https://media.api-sports.io/flags/ne.svg",
  "Sierra Leone": "https://media.api-sports.io/flags/sl.svg",
}

export function canonicalizeRuntimeNation(nation: string): string {
  return canonicalNationAliases[nation] ?? nation
}

export function createNationFlagResolver(countries: readonly {
  name: string
  code?: string | null
  flag?: string | null
}[]): (nation: string) => string | undefined {
  const byName = new Map<string, { code: string | null; flag: string }>()
  const byCode = new Map<string, string>()
  for (const country of countries) {
    if (!country.name || !country.flag) continue
    byName.set(country.name, { code: country.code ?? null, flag: country.flag })
    if (country.code) byCode.set(country.code, country.flag)
  }

  return (nation: string): string | undefined => {
    const expectedCode = nationCountryCodes[nation]
    const exact = byName.get(nation)
    // The provider cache reverses Congo names. A verified code takes priority.
    if (exact && (!expectedCode || exact.code === expectedCode)) return exact.flag
    return (expectedCode ? byCode.get(expectedCode) : undefined) ??
      verifiedMissingCountryFlags[nation]
  }
}
