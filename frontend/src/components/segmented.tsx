import { cn } from 'cn'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

// Legacy's segmented switches: the full-size one (map list modes) and the compact ones in filter
// bars, panel headers and dialogs. Below 700 px every one shares the space evenly with 12 px
// padding: legacy's map list stylesheet set that for `.segmented button` and, loaded on every
// page, it applied site-wide.
const PHONE = 'max-[700px]:min-w-0 max-[700px]:flex-1 max-[700px]:px-3'
const SIZES = {
  lg: { group: 'h-[46px]', item: 'min-w-[162px] px-6 text-xl' },
  md: { group: 'h-8', item: 'min-w-0 px-3.5 text-base' },
  sm: { group: 'h-[30px]', item: 'min-w-0 px-3.5 text-[15px]' },
  xs: { group: 'h-7', item: 'min-w-0 px-3 text-[15px]' },
}

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
  options: { value: T; label: string }[]
  label?: string
  size?: keyof typeof SIZES
  /** Layout on the group (e.g. full width on phones). */
  className?: string
  itemClassName?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix sends '' when the active item is clicked again; keep the choice.
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('flex gap-1.5', SIZES[size].group, className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            'h-full rounded-[4px] border-0 font-normal text-text-2 hover:bg-seg-hover data-[state=on]:bg-seg-active data-[state=on]:font-medium data-[state=on]:text-foreground',
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
