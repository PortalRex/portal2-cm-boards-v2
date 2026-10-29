import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HistoryIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { ErrorState, Loading } from '@/components/status'
import { useCatalog } from '@/lib/catalog'
import { ACTIVITY_VIEWS, activityWindow, type ActivityPoint, type ActivityView } from '@/lib/activity'
import { activityQueryOptions } from '../api/panels'
import { PanelSwitch, Pager } from './panel-controls'

/**
 * The game's submissions over time, paged month by month, year by year (weekly totals) or all time
 * (monthly).
 */
export function ActivityPanel({ game }: { game: string }) {
  const catalog = useCatalog()
  const activity = useQuery(activityQueryOptions(game, catalog))
  const [view, setView] = useState<ActivityView>('month')
  const [offset, setOffset] = useState(0)
  const win = useMemo(() => activityWindow(activity.data ?? [], view, offset), [activity.data, view, offset])
  const title = ACTIVITY_VIEWS.find((v) => v.value === view)!.title

  const actions = (
    <div className="flex items-center gap-3.5 normal-case upto600:w-full upto600:flex-wrap upto600:justify-between upto600:gap-y-2">
      <PanelSwitch
        value={view}
        onChange={(v) => {
          setView(v)
          setOffset(0)
        }}
        options={ACTIVITY_VIEWS}
        label="Activity"
      />
      {view !== 'all' && (
        <Pager
          numeric
          label={win.label}
          unit={view}
          onPrev={() => setOffset((o) => o + 1)}
          onNext={() => setOffset((o) => Math.max(0, o - 1))}
          prevDisabled={!win.hasPrev}
          nextDisabled={!win.hasNext}
        />
      )}
    </div>
  )
  return (
    <Panel icon={HistoryIcon} title={title} actions={actions} bodyClassName="px-5 pt-3.5 pb-[18px]">
      {activity.isPending ? (
        <Loading />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : (
        <ActivityChart points={win.points} />
      )}
    </Panel>
  )
}

function ActivityChart({ points }: { points: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          isAnimationActive={false}
          contentStyle={{
            background: 'var(--menu)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            fontFamily: 'inherit',
          }}
          labelStyle={{ color: 'var(--text-2)' }}
          labelFormatter={(label, items) =>
            (items?.[0]?.payload as ActivityPoint | undefined)?.partial ? `${label} (today, so far)` : label
          }
          formatter={(v) => [v, 'Scores']}
        />
        <Line
          type="linear"
          dataKey="count"
          stroke="var(--chart-line)"
          strokeWidth={2}
          dot={
            points.length <= 60
              ? { r: 3, stroke: 'var(--chart-line)', strokeWidth: 2, fill: 'var(--panel)' }
              : false
          }
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
