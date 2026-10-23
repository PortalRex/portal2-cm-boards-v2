import { cn } from 'cn'
import { TriangleLeft, TriangleRight } from '@/components/icons'
import { Segmented } from '@/components/segmented'

/** The small switch in the recap and activity panel headers. */
export function PanelSwitch<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <Segmented
      size="xs"
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      itemClassName="upto600:whitespace-nowrap"
    />
  )
}

const pagerButton =
  'inline-flex cursor-pointer border-0 bg-transparent p-1 text-inherit disabled:cursor-default disabled:opacity-30'

/** ◀ label ▶ for stepping through weeks, days or months. `placeholder` keeps the space, invisible. */
export function Pager({
  label,
  unit,
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
  placeholder = false,
  numeric = false,
}: {
  label: string
  unit: string
  onPrev?: () => void
  onNext?: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  placeholder?: boolean
  numeric?: boolean
}) {
  return (
    <div
      className={cn('flex items-center gap-1.5 text-[15px] upto600:ml-auto', placeholder && 'invisible')}
      aria-hidden={placeholder || undefined}
    >
      <button
        type="button"
        className={pagerButton}
        onClick={onPrev}
        disabled={placeholder || prevDisabled}
        tabIndex={placeholder ? -1 : undefined}
        aria-label={`Previous ${unit}`}
      >
        <TriangleLeft />
      </button>
      <span
        className={cn(
          'min-w-[118px] text-center upto600:min-w-0 upto600:whitespace-nowrap',
          numeric && 'num',
        )}
      >
        {label}
      </span>
      <button
        type="button"
        className={pagerButton}
        onClick={onNext}
        disabled={placeholder || nextDisabled}
        tabIndex={placeholder ? -1 : undefined}
        aria-label={`Next ${unit}`}
      >
        <TriangleRight />
      </button>
    </div>
  )
}
