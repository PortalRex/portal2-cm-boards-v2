import type { CoopTint } from '@/lib/coop-roles'

/** Runs per page on the board and in Chamber History. */
export const PAGE_SIZE = 40

// The colour starts where the avatar ends (`--tint-at`, its size: 30px unless a cell says less).
export const TINT_BG: Record<CoopTint, string> = {
  blue: 'bg-[linear-gradient(90deg,transparent_var(--tint-at,30px),var(--portal-blue)_var(--tint-at,30px),transparent_85%)]',
  orange:
    'bg-[linear-gradient(90deg,transparent_var(--tint-at,30px),var(--portal-orange)_var(--tint-at,30px),transparent_85%)]',
  neutral:
    'bg-[linear-gradient(90deg,transparent_var(--tint-at,30px),var(--portal-neutral)_var(--tint-at,30px),transparent_85%)]',
}

// Rows alternate between the row colour and the translucent panel (legacy .mp-row).
export const rowBase =
  'grid min-h-9 grid-cols-(--mp-cols) items-center gap-x-3.5 pr-2.5 text-lg upto480:gap-x-2 upto480:pr-1.5'
export const headBase = 'min-h-[30px] text-[15px] text-text-muted uppercase'
