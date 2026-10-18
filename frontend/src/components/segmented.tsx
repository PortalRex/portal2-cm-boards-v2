import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

/** The boards' segmented switch (map list modes, Mel boards): one choice of a few. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix sends '' when the active item is clicked again; keep the choice.
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="flex h-[46px] gap-1.5"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-full min-w-[162px] rounded-[4px] border-0 px-6 text-xl font-normal text-text-2 hover:bg-seg-hover data-[state=on]:bg-seg-active data-[state=on]:font-medium data-[state=on]:text-foreground max-[700px]:min-w-0 max-[700px]:flex-1 max-[700px]:px-3"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
