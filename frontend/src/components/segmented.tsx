import { cn } from 'cn'
import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

// Legacy's segmented switches: the full-size one (map list modes) and the compact ones in filter
// bars, panel headers and dialogs. Below 700 px every one shares the space evenly with 12 px
// padding: legacy's map list stylesheet set that for `.segmented button` and, loaded on every
// page, it applied site-wide.
const PHONE = 'upto700:min-w-0 upto700:flex-1 upto700:px-3'
const SIZES = {
  lg: { group: 'h-[46px]', item: 'min-w-[162px] px-6 text-xl' },
  md: { group: 'h-8', item: 'min-w-0 px-3.5 text-base' },
  sm: { group: 'h-[30px]', item: 'min-w-0 px-3.5 text-[15px]' },
  xs: { group: 'h-7', item: 'min-w-0 px-3 text-[15px]' },
}

// Radix treats an empty value as "nothing chosen", so an option whose value is '' (e.g. "All")
// goes through under this stand-in instead.
const EMPTY = '__empty__'
const toItem = (v: string) => (v === '' ? EMPTY : v)

/** The boards' segmented switch (map list modes, Mel boards): one choice of a few. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'lg',
  className,
  itemClassName,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  label?: string
  size?: keyof typeof SIZES
  /** Layout on the group (e.g. full width on phones). */
  className?: string
  itemClassName?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={toItem(value)}
      // Radix sends '' when the active item is clicked again; keep the choice.
      onValueChange={(v) => v && onChange((v === EMPTY ? '' : v) as T)}
      aria-label={label}
      className={cn('flex gap-1.5', SIZES[size].group, className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={toItem(o.value)}
          className={cn(
            // No transition: legacy's switches change at once.
            'h-full rounded-[4px] border-0 font-normal text-text-2 transition-none hover:bg-seg-hover data-[state=on]:bg-seg-active data-[state=on]:font-medium data-[state=on]:text-foreground',
            SIZES[size].item,
            PHONE,
            itemClassName,
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
