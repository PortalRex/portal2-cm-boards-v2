import { cn } from 'cn'
import { rankVars, WR_COLOR } from '@/lib/ranks'
import { TriangleRight, TrophyIcon } from './icons'

/**
 * A run's rank; world records show the old board's pink trophy instead of "1". On coloured rank
 * tiles pass `inherit` so the trophy takes the tile's colour; `colored` colours the number by
 * rank (the old board's scale, as in score updates).
 */
export function RankNumber({
  rank,
  empty = '–',
  inherit = false,
  colored = false,
}: {
  rank: number | null | undefined
  empty?: string
  inherit?: boolean
  colored?: boolean
}) {
  if (rank == null) return <>{empty}</>
  if (rank === 1) {
    return (
      <TrophyIcon
        className="inline-block size-[1.15em] fill-current align-middle"
        style={inherit ? undefined : { color: WR_COLOR }}
        role="img"
        aria-label="World record (rank 1)"
      >
        <title>World record (rank 1)</title>
      </TrophyIcon>
    )
  }
  return colored ? (
    <span className="rank-tint" style={rankVars(rank)}>
      {rank}
    </span>
  ) : (
    <>{rank}</>
  )
}

const cell =
  'flex items-center justify-center bg-rank-cell font-semibold text-[var(--rank-color-dark,var(--rank-cell-text))] light:text-[var(--rank-color,var(--rank-cell-text))]'

/** "30 ▶ 12": the rank before and after a run, each in its rank colour; world records glow. */
export function RankChange({ pre, post }: { pre: number | null; post: number | null }) {
  return (
    <div className="num grid h-full min-h-[46px] grid-cols-[1fr_0_1fr] items-stretch text-lg">
      <span
        className={cn(cell, 'shadow-[inset_-1px_0_0_var(--rank-cell-divider)]', pre === 1 && 'wr-glow')}
        style={rankVars(pre)}
        data-testid="rank-before"
      >
        <RankNumber rank={pre} inherit />
      </span>
      <TriangleRight
        size={12}
        className="relative z-[1] self-center justify-self-center text-rank-cell-text"
      />
      <span className={cn(cell, post === 1 && 'wr-glow')} style={rankVars(post)} data-testid="rank-after">
        <RankNumber rank={post} inherit />
      </span>
    </div>
  )
}
