import { cn } from 'cn'
import { useState } from 'react'
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  addMonths,
  firstDay,
  lastDay,
  monthGrid,
  monthOf,
  today as todayOf,
  type YearMonth,
} from '@/lib/calendar'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const navButton =
  'inline-flex size-7 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-text-2 hover:bg-seg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
const cell =
  'h-8 cursor-pointer rounded-[4px] border-0 bg-transparent text-sm text-foreground hover:bg-seg-hover disabled:pointer-events-none disabled:opacity-25'

/**
 * A day picker in the site's colours: a button showing the day (YYYY-MM-DD) that opens a calendar.
 * Only clicking a day picks it; the month and year controls just change what's shown. Days outside
 * `min`..`max` (default: today) can't be picked.
 */
export function DatePicker({
  value,
  min,
  max = todayOf(),
  onChange,
  label,
  placeholder = 'Pick a day',
  className,
}: {
  value: string | null
  min?: string
  max?: string
  onChange: (day: string) => void
  /** The button's name for screen readers. */
  label: string
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'days' | 'months'>('days')
  const [shown, setShown] = useState<YearMonth>(() => monthOf(value ?? max))
  const inRange = (day: string) => (!min || day >= min) && day <= max
  const today = todayOf()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Each opening starts on the picked day's month.
        if (next) {
          setView('days')
          setShown(monthOf(value ?? max))
        }
      }}
    >
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'inline-flex h-7 cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-control px-2 text-sm text-foreground normal-case hover:border-line-strong data-[state=open]:border-line-strong',
          className,
        )}
      >
        <span className={cn('num', !value && 'text-text-muted')}>{value ?? placeholder}</span>
        <CalendarIcon className="size-4 text-text-2" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[260px] gap-2 rounded-md border border-line bg-menu p-2.5 text-foreground shadow-[0_8px_24px_rgb(0_0_0/45%)] ring-0"
      >
        {view === 'days' ? (
          <DaysView
            shown={shown}
            setShown={setShown}
            min={min}
            max={max}
            value={value}
            today={today}
            inRange={inRange}
            onMonths={() => setView('months')}
            onPick={(day) => {
              onChange(day)
              setOpen(false)
            }}
          />
        ) : (
          <MonthsView
            shown={shown}
            min={min}
            max={max}
            onPick={(ym) => {
              setShown(ym)
              setView('days')
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function DaysView({
  shown,
  setShown,
  min,
  max,
  value,
  today,
  inRange,
  onMonths,
  onPick,
}: {
  shown: YearMonth
  setShown: (ym: YearMonth) => void
  min?: string
  max: string
  value: string | null
  today: string
  inRange: (day: string) => boolean
  onMonths: () => void
  onPick: (day: string) => void
}) {
  const prev = addMonths(shown, -1)
  const next = addMonths(shown, 1)
  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className={navButton}
          aria-label="Previous month"
          disabled={Boolean(min && lastDay(prev) < min)}
          onClick={() => setShown(prev)}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-transparent px-2 py-1 text-[15px] font-medium text-foreground hover:bg-seg-hover"
          aria-label={`${MONTH_NAMES[shown.month]} ${shown.year}: choose a month`}
          onClick={onMonths}
        >
          {MONTH_NAMES[shown.month]} {shown.year}
          <ChevronDownIcon className="size-4 text-text-2" />
        </button>
        <button
          type="button"
          className={navButton}
          aria-label="Next month"
          disabled={firstDay(next) > max}
          onClick={() => setShown(next)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div
        role="group"
        aria-label={`${MONTH_NAMES[shown.month]} ${shown.year}`}
        className="grid grid-cols-7 gap-0.5"
      >
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-center text-xs tracking-[0.04em] text-text-muted uppercase">
            {d}
          </span>
        ))}
        {monthGrid(shown).map(({ day, inMonth }) => (
          <button
            key={day}
            type="button"
            className={cn(
              cell,
              !inMonth && 'text-text-muted',
              day === today && 'ring-1 ring-line-strong ring-inset',
              day === value && 'bg-brand font-semibold text-white hover:bg-brand',
            )}
            aria-label={day}
            aria-pressed={day === value}
            disabled={!inRange(day)}
            onClick={() => onPick(day)}
          >
            {Number(day.slice(8))}
          </button>
        ))}
      </div>
    </>
  )
}

function MonthsView({
  shown,
  min,
  max,
  onPick,
}: {
  shown: YearMonth
  min?: string
  max: string
  onPick: (ym: YearMonth) => void
}) {
  const [year, setYear] = useState(shown.year)
  const minYear = min ? Number(min.slice(0, 4)) : -Infinity
  const maxYear = Number(max.slice(0, 4))
  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className={navButton}
          aria-label="Previous year"
          disabled={year <= minYear}
          onClick={() => setYear(year - 1)}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="num text-[15px] font-medium">{year}</span>
        <button
          type="button"
          className={navButton}
          aria-label="Next year"
          disabled={year >= maxYear}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((name, month) => {
          const ym = { year, month }
          const outside = Boolean((min && lastDay(ym) < min) || firstDay(ym) > max)
          return (
            <button
              key={name}
              type="button"
              className={cn(
                cell,
                'h-9',
                year === shown.year && month === shown.month && 'bg-seg-active font-medium',
              )}
              disabled={outside}
              onClick={() => onPick(ym)}
            >
              {name}
            </button>
          )
        })}
      </div>
    </>
  )
}
