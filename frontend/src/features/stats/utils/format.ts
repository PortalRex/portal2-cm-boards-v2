import { modeLabel, type Catalog } from '@/lib/catalog'

export const number = (n: number) => Number(n).toLocaleString('en-US')

export const days = (d: number) => `${number(Math.round(d))} day${Math.round(d) === 1 ? '' : 's'}`

/** A board's name: "Overall", or the mode's label. */
export const boardLabel = (c: Catalog, key: string) => (key === 'overall' ? 'Overall' : modeLabel(c, key))

/** A board key from the address, if the game has it (else the default). */
export const pick = (value: string | undefined, allowed: string[], fallback: string) =>
  value && allowed.includes(value) ? value : fallback
