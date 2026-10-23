import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { EmptyState } from '@/components/status'
import type { Player } from '@/types/runs'
import type { WrStats } from '../api/stats'
import { hue } from '../utils/format'
import { Intro } from './stats-ui'

const ROW = 40
const STEP_MS = 220

type Frames = WrStats['race'][string]['frames']

/** Bars sliding between places month by month; play, pause or drag through the months. */
export function Race({ frames, players }: { frames: Frames; players: Record<string, Player> }) {
  const [index, setIndex] = useState(frames.length - 1)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [playing, frames.length])
  // Everyone in any frame, so bars slide between places as the frames change.
  const ids = useMemo(() => [...new Set(frames.flatMap((f) => f.top.map((t) => t.profileNumber)))], [frames])
  const frame = frames[index]
  if (!frame) return <EmptyState>No records yet.</EmptyState>
  const max = Math.max(1, ...frame.top.map((t) => t.held))
  const place = new Map(frame.top.map((t, i) => [t.profileNumber, i]))
  const play = () => {
    if (index >= frames.length - 1) setIndex(0)
    setPlaying((p) => !p)
  }
  return (
    <>
      <Intro>
        How many maps’ records each player held, month by month since the first record. Press play.
      </Intro>
      <div className="mb-[18px] flex items-center gap-3.5">
        <button
          type="button"
          onClick={play}
          aria-label={playing ? 'Pause' : 'Play'}
          className="size-[46px] cursor-pointer rounded-full border-0 bg-[#3b9bff] text-lg text-white"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false)
            setIndex(Number(e.target.value))
          }}
          aria-label="Month"
          // Legacy left the slider with the browser's own margin, font and field colour (no reset).
          className="flex-1 accent-[#3b9bff] [background-color:revert] [color:revert] [font:revert] [margin:revert]"
        />
        <span className="num min-w-24 text-right text-[26px] font-semibold upto900:min-w-[70px] upto900:text-lg">
          {new Date(frame.date).toLocaleDateString('en-GB', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
      <div className="relative overflow-hidden" style={{ height: frame.top.length * ROW + 8 }}>
        {ids.map((id) => {
          const at = place.get(id)
          const p = players[id]
          const held = at != null ? (frame.top[at]?.held ?? 0) : 0
          return (
            <div
              key={id}
              data-testid="race-row"
              aria-hidden={at == null}
              className="absolute inset-x-0 top-0 grid h-9 grid-cols-[200px_minmax(0,1fr)] items-center gap-3 transition-[transform,opacity] duration-200 ease-linear upto900:grid-cols-[120px_minmax(0,1fr)]"
              style={{
                transform: `translateY(${(at ?? frame.top.length) * ROW}px)`,
                opacity: at == null ? 0 : 1,
              }}
            >
              <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
                <Avatar src={p?.avatar} name={p?.name} size={24} />
                {/* Clipped by the row on wide screens (legacy's ellipsis was on the row, where it doesn't
                    apply); an ellipsis from 900px down. */}
                <span className="upto900:truncate">{p?.name ?? id}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-[26px] rounded-[4px] transition-[width] duration-200 ease-linear"
                  style={{ width: `${(held / max) * 100}%`, background: `hsl(${hue(id)} 60% 52%)` }}
                />
                <span className="num font-semibold">{held || ''}</span>
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
