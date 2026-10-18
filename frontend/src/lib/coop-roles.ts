import type { CSSProperties } from 'react'
// Co-op players are shown blue (the host) first, orange second. Runs carry `players` in that
// order plus `rolesKnown`; when nobody knows who hosted, rows use a neutral tint.
//
// Staff can record who hosted (PUT /coop/{id}/host). The new choice is kept as an override
// (co-op id -> host profile number, or null for unknown) so every row showing the run updates
// straight away, before the boards are fetched again. The overrides live in the query cache
// (see hooks/use-coop-role-overrides.ts).

export type RoleOverrides = ReadonlyMap<number, string | null>

interface CoopPlayer {
  profileNumber: string | null
}

interface CoopRun<P extends CoopPlayer> {
  players: P[]
  coopId?: number | null
  rolesKnown?: boolean | null
}

/** The run's players and whether their colours are known, after any staff edit. */
export function coopRoles<P extends CoopPlayer>(
  run: CoopRun<P>,
  overrides: RoleOverrides = new Map(),
): { players: P[]; rolesKnown: boolean } {
  const players = run.players
  if (run.coopId == null || !overrides.has(run.coopId))
    return { players, rolesKnown: run.rolesKnown !== false }
  const host = overrides.get(run.coopId)
  if (host == null) return { players, rolesKnown: false }
  const isHost = (p: P) => (p.profileNumber === host ? 1 : 0)
  return { players: [...players].sort((a, b) => isHost(b) - isHost(a)), rolesKnown: true }
}

export type CoopTint = 'blue' | 'orange' | 'neutral'

/** The tint of the player at `index` (legacy `tint-blue` / `tint-orange` / `tint-neutral`). */
export const tintFor = (rolesKnown: boolean, index: number): CoopTint =>
  rolesKnown ? (index === 0 ? 'blue' : 'orange') : 'neutral'

// The PB player's colour (grey when it's unknown who was blue).
const PB_RGB: Record<CoopTint, string> = {
  blue: '127 188 255',
  orange: '255 184 119',
  neutral: '195 198 204',
}

/** The PB player's colour as CSS (for the PB trophy). */
export const pbColor = (tint: CoopTint) => `rgb(${PB_RGB[tint]})`

/** A PB player's name in their colour, glowing (the "Coloured name" PB style); give it `pbNameVars`. */
export const PB_NAME = 'font-semibold text-[rgb(var(--pb-rgb))] [text-shadow:0_0_6px_rgb(var(--pb-rgb)/55%)]'
export const pbNameVars = (tint: CoopTint) => ({ '--pb-rgb': PB_RGB[tint] }) as CSSProperties

/** The other names next to a marked PB. */
export const NOT_PB_NAME = 'opacity-55'
