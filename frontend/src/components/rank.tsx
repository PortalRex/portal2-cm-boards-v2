import { cn } from 'cn'
import { rankVars, WR_COLOR } from '@/lib/ranks'
import { TriangleRight, TrophyFilledIcon } from './icons'

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
      <TrophyFilledIcon
        className="inline-block size-[1.15em] align-middle"
        style={inherit ? undefined : { color: WR_COLOR }}
        role="img"
        aria-label="World record (rank 1)"
      >
        <title>World record (rank 1)</title>
      </TrophyFilledIcon>
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

// Ranks 2–500 sit in a tag of the rank's deeper colour (the light-theme scale), toned down with
// grey so white numbers read on it; the box around it stays grey.
const tag =
  'min-w-[2.6em] rounded-md bg-[color-mix(in_oklab,var(--rank-color)_80%,#6b6b6b)] px-2 py-0.5 text-center text-white'

/** One side of a RankChange: a grey box with the rank as a coloured tag (a glowing one for a record). */
function RankCell({ rank, testId }: { rank: number | null; testId: string }) {
  const tagged = rank != null && rank <= 500
  return (
    <span
      className="flex items-center justify-center bg-rank-cell font-semibold text-rank-cell-text"
      style={rankVars(rank)}
      data-testid={testId}
    >
      {tagged ? (
        <span className={cn(tag, rank === 1 && 'wr-glow')}>
          <RankNumber rank={rank} inherit />
        </span>
      ) : (
        <RankNumber rank={rank} inherit />
      )}
    </span>
  )
}

/** "30 ▶ 12": the rank before and after a run, each tagged in its rank colour; a world record's tag glows. */
export function RankChange({ pre, post }: { pre: number | null; post: number | null }) {
  return (
    <div className="num relative grid h-full min-h-[46px] grid-cols-2 items-stretch bg-rank-cell text-lg">
      <RankCell rank={pre} testId="rank-before" />
      <RankCell rank={post} testId="rank-after" />
      <TriangleRight
        size={12}
        className="absolute top-1/2 left-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-rank-cell-text"
      />
    </div>
  )
}
