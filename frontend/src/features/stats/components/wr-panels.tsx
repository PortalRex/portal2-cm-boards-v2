import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StatsIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { EmptyState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { useCatalog } from '@/lib/catalog'
import { formatDate, formatLongScore, formatScore } from '@/lib/format'
import { wrStatsQueryOptions, type WrStats } from '../api/stats'
import { boardLabel, days, HISTORY_VIEWS, number, pick } from '../utils/format'
import { Race } from './race'
import { Figures, Intro, MapName, PlayerCell, Row, SectionTitle, StatsSwitch, Table, Teams } from './stats-ui'

// The world record pages of the Stats section (Records, History, Race), all from one /stats/wr
// answer for the game. Below 900 px the tables keep every column: legacy's rule hiding some of
// them lost its body (see Follow-ups in FRONTEND_REWRITE.md), so only the grids change.

function Shell({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: (stats: WrStats) => ReactNode
}) {
  const catalog = useCatalog()
  const game = useGame()
  const stats = useQuery(wrStatsQueryOptions(catalog, game))
  return (
    <Panel icon={StatsIcon} title={title} actions={actions} className="rounded-tl-none" bodyClassName="pb-9">
      {stats.isPending ? (
        <Loading label="Loading the record history" />
      ) : !stats.data ? (
        <EmptyState>Couldn’t load the stats.</EmptyState>
      ) : (
        children(stats.data)
      )}
    </Panel>
  )
}

const stood = 'num whitespace-nowrap'
const strong = 'num text-right font-semibold'
const live = 'text-[#6be38a]'

// --- Records ----------------------------------------------------------------------------

/** Every map's current record for one of the game's modes, and who holds how many. */
export function RecordsPanel({ mode: modeParam, onMode }: { mode?: string; onMode: (mode: string) => void }) {
  const catalog = useCatalog()
  const game = useGame()
  const modes = catalog.games[game]?.modes ?? []
  const mode = pick(modeParam, modes, modes[0] ?? '')
  return (
    <Shell
      title="World records"
      actions={
        <StatsSwitch
          label="Mode"
          value={mode}
          onChange={(m) => onMode(m === modes[0] ? '' : m)}
          options={modes.map((m) => ({ value: m, label: boardLabel(catalog, m) }))}
        />
      }
    >
      {(s) => {
        const rows = s.records.filter((r) => r.mode === mode)
        const oldest = [...s.records].sort((a, b) => b.days - a.days)[0]
        return (
          <>
            <Figures
              items={[
                ...modes.map((m) => ({
                  label: `${boardLabel(catalog, m)} total`,
                  value: formatLongScore(s.totalTime[m] ?? 0),
                  note: `${s.records.filter((r) => r.mode === m).length} records added up`,
                })),
                {
                  label: 'Oldest record',
                  value: days(Math.max(0, ...s.records.map((r) => r.days))),
                  note: oldest?.mapName ?? '',
                },
              ]}
            />
            <Table
              label="World records"
              cols="[--st-cols:minmax(140px,1fr)_90px_minmax(0,1.6fr)_120px_110px_80px] upto900:[--st-cols:minmax(0,1fr)_76px] *:py-1.5"
              head={
                <>
                  <span>Map</span>
                  <span className="text-right">Record</span>
                  <span className="upto900:col-span-full">Held by</span>
                  <span>Since</span>
                  <span className="text-right">Standing</span>
                  <span className="text-right" title="Record times the map has had">
                    Records
                  </span>
                </>
              }
            >
              {rows.map((r) => (
                <Row key={r.mapId}>
                  <span className="min-w-0 truncate whitespace-nowrap upto900:whitespace-normal">
                    <MapName where={r} />
                  </span>
                  <span className={strong}>{formatScore(r.score)}</span>
                  <span className="upto900:col-span-full">
                    <Teams teams={r.teams} />
                  </span>
                  <span className={stood}>{formatDate(r.since)}</span>
                  <span className="num text-right">{days(r.days)}</span>
                  <span className="num text-right text-text-muted">{r.records}</span>
                </Row>
              ))}
            </Table>
            <SectionTitle>Records held now</SectionTitle>
            <Intro>Every map’s current record, by player (ties count for everyone tied).</Intro>
            <ShareBars rows={s.holders.filter((h) => h.held > 0)} total={s.records.length} />
          </>
        )
      }}
    </Shell>
  )
}

function ShareBars({ rows, total }: { rows: WrStats['holders']; total: number }) {
  const sorted = [...rows].sort((a, b) => b.held - a.held || b.days - a.days)
  const max = sorted[0]?.held || 1
  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Records held now">
      {sorted.map((h) => (
        <div
          key={h.player.profileNumber}
          role="listitem"
          className="grid min-h-8 grid-cols-[minmax(150px,240px)_minmax(0,1fr)_40px_60px] items-center gap-3 upto900:grid-cols-[minmax(0,140px)_minmax(0,1fr)_30px_46px] upto900:gap-2"
        >
          <PlayerCell player={h.player} />
          <span className="h-3.5 overflow-hidden rounded-[7px] bg-row">
            <span
              className="block h-full rounded-[7px] bg-[linear-gradient(90deg,#ff7b1a,#3b9bff)]"
              style={{ width: `${(h.held / max) * 100}%` }}
            />
          </span>
          <span className="num font-semibold">{h.held}</span>
          <span className="num text-right text-text-muted">{((h.held / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

// --- History ----------------------------------------------------------------------------

/** The record history: longest-lasting records, streaks, biggest cuts and record-days. */
export function HistoryPanel({ view: viewParam, onView }: { view?: string; onView: (view: string) => void }) {
  const view = pick(
    viewParam,
    HISTORY_VIEWS.map((h) => h.value),
    'longest',
  )
  return (
    <Shell title="Record history">
      {(s) => (
        <>
          <StatsSwitch
            label="View"
            body
            className="mb-3.5 h-auto flex-wrap"
            value={view}
            onChange={(v) => onView(v === 'longest' ? '' : v)}
            options={HISTORY_VIEWS}
          />
          {view === 'domination' ? (
            <Domination rows={s.domination} />
          ) : view === 'improvements' ? (
            <Improvements rows={s.improvements} />
          ) : view === 'days' ? (
            <DaysHolding rows={s.holders} />
          ) : (
            <Longest rows={s.longest} />
          )}
        </>
      )}
    </Shell>
  )
}

const rank = (i: number) => <span className="num text-text-muted">{i + 1}</span>
const mapCell = (r: Parameters<typeof MapName>[0]['where']) => (
  <span className="min-w-0 truncate whitespace-nowrap upto900:whitespace-normal">
    <MapName where={r} />
  </span>
)

function Longest({ rows }: { rows: WrStats['longest'] }) {
  return (
    <>
      <Intro>
        Every record time a map has had, by how long it stood (records still standing count up to today).
      </Intro>
      <Table
        label="Longest lasting records"
        cols="[--st-cols:40px_minmax(120px,1fr)_80px_minmax(0,1.2fr)_100px_220px_minmax(0,1.2fr)] upto900:[--st-cols:28px_minmax(0,1fr)_70px_84px] *:py-1.5"
        head={
          <>
            <span className="text-text-muted">#</span>
            <span>Map</span>
            <span className="text-right">Time</span>
            <span className="upto900:col-[2/-1] upto900:row-[2]">Set by</span>
            <span className="text-right">Stood</span>
            <span>From – to</span>
            <span>Beaten by</span>
          </>
        }
      >
        {rows.map((r, i) => (
          <Row key={`${r.mapId}-${r.score}`}>
            {rank(i)}
            {mapCell(r)}
            <span className={strong}>{formatScore(r.score)}</span>
            <span className="upto900:col-[2/-1] upto900:row-[2]">
              <Teams teams={r.teams} />
            </span>
            <span className="num text-right">{days(r.days)}</span>
            <span className={stood}>
              {formatDate(r.start)} –{' '}
              {r.end ? formatDate(r.end) : <span className={live}>still standing</span>}
            </span>
            <span>
              {r.end ? (
                <>
                  <Teams teams={r.beatenBy} />{' '}
                  <span className="num text-text-muted">({formatScore(r.beatenWith)})</span>
                </>
              ) : (
                <span className="text-text-muted">–</span>
              )}
            </span>
          </Row>
        ))}
      </Table>
    </>
  )
}

function Domination({ rows }: { rows: WrStats['domination'] }) {
  return (
    <>
      <Intro>
        One player holding a map’s record through several record times in a row: the longest streaks.
      </Intro>
      <Table
        label="Longest domination"
        cols="[--st-cols:40px_minmax(120px,1fr)_minmax(0,1fr)_80px_100px_220px_150px] upto900:[--st-cols:28px_minmax(0,1fr)_30px_84px] upto900:*:py-1.5"
        head={
          <>
            <span className="text-text-muted">#</span>
            <span>Map</span>
            <span className="upto900:col-[2/-1] upto900:row-[2]">Player</span>
            <span className="text-right">Records</span>
            <span className="text-right">Held</span>
            <span>From – to</span>
            <span className="text-right">Times</span>
          </>
        }
      >
        {rows.map((r, i) => (
          <Row key={`${r.mapId}-${r.player.profileNumber}-${r.start}`}>
            {rank(i)}
            {mapCell(r)}
            <PlayerCell player={r.player} size={22} className="upto900:col-[2/-1] upto900:row-[2]" />
            <span className={strong}>{r.records}</span>
            <span className="num text-right">{days(r.days)}</span>
            <span className={stood}>
              {formatDate(r.start)} –{' '}
              {r.end ? formatDate(r.end) : <span className={live}>still holds it</span>}
            </span>
            <span className="num text-right text-text-muted">
              {formatScore(r.fromScore)} → {formatScore(r.toScore)}
            </span>
          </Row>
        ))}
      </Table>
    </>
  )
}

function Improvements({ rows }: { rows: WrStats['improvements'] }) {
  return (
    <>
      <Intro>The biggest single cuts to a world record.</Intro>
      <Table
        label="Biggest improvements"
        cols="[--st-cols:40px_minmax(120px,1fr)_90px_150px_minmax(0,1fr)_110px_minmax(0,1.3fr)] upto900:[--st-cols:28px_minmax(0,1fr)_70px] *:py-1.5"
        head={
          <>
            <span className="text-text-muted">#</span>
            <span>Map</span>
            <span className="text-right">Saved</span>
            <span className="text-right">Time</span>
            <span className="upto900:col-[2/-1] upto900:row-[2]">By</span>
            <span>Date</span>
            <span>Previous record</span>
          </>
        }
      >
        {rows.map((r, i) => (
          <Row key={`${r.mapId}-${r.toScore}`}>
            {rank(i)}
            {mapCell(r)}
            <span className={`${strong} ${live}`}>−{formatScore(r.delta)}</span>
            <span className="num text-right">
              <span className="text-text-muted">{formatScore(r.fromScore)} →</span> {formatScore(r.toScore)}
            </span>
            <span className="upto900:col-[2/-1] upto900:row-[2]">
              <Teams teams={r.teams} />
            </span>
            <span className={stood}>{formatDate(r.date)}</span>
            <span>
              <Teams teams={r.previous} />{' '}
              <span className="num text-text-muted">(stood {days(r.previousDays)})</span>
            </span>
          </Row>
        ))}
      </Table>
    </>
  )
}

function DaysHolding({ rows }: { rows: WrStats['holders'] }) {
  return (
    <>
      <Intro>
        Days spent holding world records, every map added together (holding two records for a day counts two).
        Ties count from the player’s own run.
      </Intro>
      <Table
        label="Days holding"
        cols="[--st-cols:40px_minmax(0,1fr)_130px_80px_120px_100px] upto900:[--st-cols:28px_minmax(0,1fr)_90px_50px]"
        head={
          <>
            <span className="text-text-muted">#</span>
            <span>Player</span>
            <span className="text-right">Record-days</span>
            <span className="text-right">Years</span>
            <span className="text-right">Records set</span>
            <span className="text-right">Held now</span>
          </>
        }
      >
        {rows.slice(0, 100).map((h, i) => (
          <Row key={h.player.profileNumber}>
            {rank(i)}
            <PlayerCell player={h.player} />
            <span className={strong}>{number(Math.round(h.days))}</span>
            <span className="num text-right text-text-muted">{(h.days / 365.25).toFixed(1)}</span>
            <span className="num text-right">{number(h.set)}</span>
            <span className="num text-right">{h.held}</span>
          </Row>
        ))}
      </Table>
    </>
  )
}

// --- Race -------------------------------------------------------------------------------

/** How many records each player held, month by month, as a bar chart race. */
export function RacePanel({
  board: boardParam,
  onBoard,
}: {
  board?: string
  onBoard: (board: string) => void
}) {
  const catalog = useCatalog()
  const game = useGame()
  const boards = [...(catalog.games[game]?.modes ?? []), 'overall']
  const board = pick(boardParam, boards, 'overall')
  return (
    <Shell
      title="World record race"
      actions={
        <StatsSwitch
          label="Board"
          value={board}
          onChange={(b) => onBoard(b === 'overall' ? '' : b)}
          options={boards.map((b) => ({ value: b, label: boardLabel(catalog, b) }))}
        />
      }
    >
      {(s) => <Race key={board} frames={s.race[board]?.frames ?? []} players={s.racePlayers} />}
    </Shell>
  )
}
