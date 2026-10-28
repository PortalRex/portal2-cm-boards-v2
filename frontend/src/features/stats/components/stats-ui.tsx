import { cn } from 'cn'
import type { ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { PlayerLink } from '@/components/player-link'
import { Segmented } from '@/components/segmented'
import { mapPath } from '@/lib/catalog'
import type { Player } from '@/types/runs'
import type { RecordWhere, Team } from '../api/stats'

// Pieces shared by the Stats pages (legacy Stats.css).

export function Figures({ items }: { items: { label: string; value: ReactNode; note: ReactNode }[] }) {
  return (
    <div className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 upto900:grid-cols-2">
      {items.map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5 rounded-md bg-row px-4 py-3.5">
          <span className="text-sm tracking-[0.04em] text-text-muted uppercase">{f.label}</span>
          <span className="num text-[28px] font-semibold">{f.value}</span>
          <span className="text-sm text-text-muted">{f.note}</span>
        </div>
      ))}
    </div>
  )
}

export function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2
      className={cn(
        'mt-7 mb-3 border-b-2 border-text-muted pb-1 text-[30px] font-light uppercase',
        className,
      )}
    >
      {children}
    </h2>
  )
}

export function Intro({ children }: { children: ReactNode }) {
  return <p className="mt-0 mb-4 max-w-[900px] text-text-muted">{children}</p>
}

/**
 * A stats table: a header row, then rows striped from the first. `cols`: the grid's columns.
 * `cards`: on phones each row is a little card, its lines closer together and labelling
 * themselves, so there's no header row (it would be a stack of column names).
 */
export function Table({
  label,
  cols,
  head,
  cards = false,
  children,
}: {
  label: string
  cols: string
  head: ReactNode
  cards?: boolean
  children: ReactNode
}) {
  return (
    <div
      role="table"
      aria-label={label}
      className={cn('flex flex-col', cols, cards && 'upto900:*:gap-y-1 upto900:*:py-2')}
    >
      <div
        role="row"
        className={cn(
          rowClass,
          'min-h-[34px] text-sm tracking-[0.04em] text-text-muted uppercase',
          cards && 'upto900:hidden',
        )}
      >
        {head}
      </div>
      {children}
    </div>
  )
}

/** A row of a stats table (striped on even children, as legacy: the header is the first). */
export const rowClass =
  'grid min-h-[42px] grid-cols-(--st-cols) items-center gap-3.5 rounded-[4px] px-3 even:bg-row upto480:gap-2 upto480:px-2'

export function Row({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="row" className={cn(rowClass, className)}>
      {children}
    </div>
  )
}

export function PlayerCell({
  player,
  size = 24,
  className,
}: {
  player: Player
  size?: number
  className?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar src={player.avatar} name={player.name} size={size} />
      <PlayerLink player={player} className="truncate" />
    </span>
  )
}

/** Players of one or more teams (a co-op pair counts as one team). */
export function Teams({ teams, size = 22 }: { teams: Team[] | null | undefined; size?: number }) {
  if (!teams?.length) return <span className="text-text-muted">–</span>
  return (
    <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
      {teams.map((t, i) => (
        <span key={i} className="inline-flex flex-wrap gap-x-2.5 gap-y-1">
          {t.players.map((p) => (
            <span key={p.profileNumber} className="inline-flex items-center gap-2">
              <Avatar src={p.avatar} name={p.name} size={size} />
              <PlayerLink player={p} />
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

/** The record's map, linking to its page when the catalog has it. */
export function MapName({ where }: { where: RecordWhere }) {
  return where.map ? <AppLink href={mapPath(where.map)}>{where.mapName}</AppLink> : <>{where.mapName}</>
}

/** The pages' board / view switches (legacy .segmented.st-seg: 40 px, 17 px text). */
export function StatsSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  wide = false,
  body = false,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  className?: string
  /** The section heads' board switch (legacy .st-boards: wider buttons). */
  wide?: boolean
  /**
   * A switch in a section's body (legacy .st-seg-body): from 900px down its buttons keep their
   * own width and wrap, rather than sharing the row (legacy's rule outranked the shared phone one).
   */
  body?: boolean
}) {
  return (
    <Segmented
      value={value}
      options={options}
      onChange={onChange}
      label={label}
      size="md"
      className={cn(
        'h-10 upto900:h-auto upto900:flex-wrap',
        body && 'upto900:w-full',
        // Four or more don't fit a phone's row: two by two, rather than one left on its own.
        body && options.length > 3 && 'upto480:grid upto480:grid-cols-2',
        className,
      )}
      itemClassName={cn(
        'h-10 text-[17px] upto900:text-[15px]',
        wide
          ? 'min-w-[120px] px-6 upto900:h-[38px] upto900:min-w-0 upto900:px-3'
          : 'min-w-0 px-[18px] upto900:px-3',
        // Small enough on a phone for three to share a row.
        body && 'upto900:flex-auto upto700:flex-auto upto480:px-2 upto480:text-[13px]',
      )}
    />
  )
}
