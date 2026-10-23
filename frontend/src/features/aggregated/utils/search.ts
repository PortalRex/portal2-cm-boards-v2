import { z } from 'zod'

const text = z.string().optional().catch(undefined)

/** ?season=, ?country= and ?player= on every aggregated board's address. */
export const aggregatedSearchSchema = z.looseObject({ season: text, country: text, player: text })
