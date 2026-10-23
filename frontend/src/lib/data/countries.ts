import { COUNTRY_TABLE } from './country-table'

export interface Country {
  id: number
  /** ISO 3166 alpha-2, lower case ("gb"). */
  code: string
  name: string
}

// Everyday English names ("South Korea", "Russia", "Taiwan") from the browser, where it knows the
// country; the list's own name otherwise. A few the browser names awkwardly are set here.
const NAME_OVERRIDES: Record<string, string> = {
  cd: 'DR Congo',
  cg: 'Republic of the Congo',
  ps: 'Palestine',
  va: 'Vatican City',
}

const regionNames =
  typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

function niceName(code: string, fallback: string) {
  const override = NAME_OVERRIDES[code]
  if (override) return override
  try {
    const name = regionNames?.of(code.toUpperCase())
    return name && name !== code.toUpperCase() ? name : fallback
  } catch {
    return fallback
  }
}

const COUNTRIES: Country[] = Object.entries(COUNTRY_TABLE).map(([id, [code, name]]) => ({
  id: Number(id),
  code,
  name: niceName(code, name),
}))

const byId = new Map(COUNTRIES.map((c) => [c.id, c]))
const byCode = new Map(COUNTRIES.map((c) => [c.code, c]))

/** A country by its id in the countries table, or null. */
export const countryById = (id: number | null | undefined): Country | null =>
  id == null ? null : (byId.get(id) ?? null)

/** Every country, by name. */
export const COUNTRY_LIST: Country[] = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

export const countryIdByCode = (code: string | null | undefined): number | null =>
  (code ? byCode.get(code)?.id : null) ?? null

/** A country's display name by its code (the upper-cased code when unknown). */
export const countryName = (code: string | null | undefined): string | undefined =>
  (code && byCode.get(code)?.name) || code?.toUpperCase()
