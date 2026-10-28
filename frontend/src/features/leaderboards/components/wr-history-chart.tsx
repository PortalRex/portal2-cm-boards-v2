import { cn } from 'cn'
import { useMemo, useRef, useState } from 'react'
import { HistoryMinimap } from '@/components/charts/history-minimap'
import { HistoryPlot, HistoryTooltip } from '@/components/charts/history-plot'
import { ExpandIcon, TrophyFilledIcon } from '@/components/icons'
import { Loading } from '@/components/status'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatWhen, HISTORY_MIN_SPAN, playerColors } from '@/lib/charts/history'
import { formatDate, parseTimestamp } from '@/lib/format'
import type { WrPoint } from '../api/map-board'
import type { ChartPoint } from '../utils/wr-chart'

type Domain = [number, number]

/** When a record was set, as exactly as it's known: day and time, the day, or the month. */
function setWhen(p: ChartPoint): string {
  const t = p.setAt ?? p.t
  if (p.old?.dateEstimated) return `${formatDate(t).slice(0, 7)} (month only)`
  if (p.old && !p.old.timeKnown) return formatDate(t)
  return formatWhen(t)
}

/** A record's tooltip: when, who (in their colour), the time and how much it took off. */
function WrTooltip({ point: p, color }: { point: ChartPoint; color: string }) {
  return (
    <HistoryTooltip when={setWhen(p)} name={p.player} color={color} score={p.score} gain={p.gain}>
      {p.old && (
        <span className="max-w-[240px] text-text-muted">
          Before the boards (no demo){p.old.note ? ` · ${p.old.note}` : ''}
        </span>
      )}
    </HistoryTooltip>
  )
}

const PLOT_TEXT = {
  label: 'World record history: click a record, then use the left and right arrow keys',
  hint: 'Scroll or pinch to zoom · drag to move · click to see the board as it stood then · arrow keys: previous / next record',
  tooltip: (p: ChartPoint, color: string) => <WrTooltip point={p} color={color} />,
  // Records from before the boards (no demo) are hollow.
  hollow: (p: ChartPoint) => Boolean(p.old),
}

/**
 * The map's WR history, with the whole of it in small underneath to zoom and move with, and a
 * bigger view in a dialog.
 */
export function WrHistoryChart({
  points,
  loading,
  at,
  onPick,
}: {
  points: WrPoint[] | undefined
  loading: boolean
  at: string | null
  onPick: (t: number | null) => void
}) {
  // Records oldest first, each with how much it took off the previous one.
  const records = useMemo<ChartPoint[]>(() => {
    const list = (points ?? [])
      .filter((p) => p.timestamp)
      .map((p) => ({ ...p, t: parseTimestamp(p.timestamp!).getTime() }))
      .sort((a, b) => a.t - b.t)
    return list.map((p, i) => ({
      ...p,
      gain: i > 0 && list[i - 1]!.score > p.score ? list[i - 1]!.score - p.score : null,
    }))
  }, [points])
  const colorOf = useMemo(() => playerColors(records), [records])
  const [zoom, setZoom] = useState<Domain | null>(null)
  const [expanded, setExpanded] = useState(false)
  // A click on the big chart closed it: the arrow keys carry on from the small one.
  const pickedInDialog = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // The arrow keys moved the moment; moving the mouse hands the tooltip back to it.
  const [keyboard, setKeyboard] = useState(false)
  // "Now" for the chart, fixed while the page is open.
  const [now] = useState(() => Date.now())

  const box = 'relative mb-[26px] min-h-[272px]'
  if (loading && !records.length) {
    return (
      <div className={box}>
        <Loading />
      </div>
    )
  }
  if (!records.length)
    return <div className={cn(box, 'flex items-center text-text-muted')}>No world record history</div>

  // The whole history: from the first record to today (a week at least, so a new map's first
  // record isn't squashed against the edge).
  const full: Domain = [Math.min(records[0]!.t, now - HISTORY_MIN_SPAN), now]
  const [from, to] = zoom ?? full
  const inView = records.filter((r) => r.t >= from && r.t <= to).length
  const plot = {
    ...PLOT_TEXT,
    records,
    colorOf,
    full,
    zoom,
    setZoom,
    now,
    atMs: at ? parseTimestamp(at).getTime() : null,
    keyboard,
    setKeyboard,
  }
  const minimap = (
    <HistoryMinimap records={records} full={full} zoom={zoom} onZoom={setZoom} minSpan={HISTORY_MIN_SPAN} />
  )
  const button =
    'inline-flex h-6 cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-seg-active px-2 text-xs whitespace-nowrap text-text-2 hover:bg-control-raised-2 hover:text-foreground'

  return (
    <div ref={boxRef} className={box}>
      <div className="mb-1 flex min-h-7 items-center gap-2 pr-[34px]">
        <span className="mr-auto text-sm text-text-muted">
          {records.length} world record{records.length === 1 ? '' : 's'}
          {zoom ? ` · ${inView} in view` : ''}
        </span>
        {zoom && (
          <button type="button" onClick={() => setZoom(null)} className={button}>
            Reset zoom
          </button>
        )}
        <button
          type="button"
          aria-label="Expand the WR history"
          onClick={() => setExpanded(true)}
          className={cn(button, 'upto700:hidden')}
        >
          <ExpandIcon className="size-3.5" />
        </button>
        <TrophyFilledIcon className="absolute top-0 right-1.5 z-[1] size-[26px] text-trophy" />
      </div>
      <HistoryPlot {...plot} onPick={onPick} height={200} />
      {minimap}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="flex w-[min(1400px,94vw)] max-w-none flex-col gap-3 rounded-md bg-panel p-4 sm:max-w-none"
          onCloseAutoFocus={(e) => {
            if (!pickedInDialog.current) return
            pickedInDialog.current = false
            e.preventDefault()
            boxRef.current?.querySelector<HTMLElement>('[data-history-plot]')?.focus()
          }}
        >
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="text-lg font-semibold">World record history</DialogTitle>
            {zoom && (
              <button type="button" onClick={() => setZoom(null)} className={cn(button, 'ml-auto')}>
                Reset zoom
              </button>
            )}
          </div>
          <div>
            <HistoryPlot
              {...plot}
              onPick={onPick}
              // Clicking a record shows its board, behind the dialog.
              onClicked={() => {
                pickedInDialog.current = true
                setExpanded(false)
              }}
              height="65vh"
            />
            {minimap}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
