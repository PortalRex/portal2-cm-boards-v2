import { cn } from 'cn'
import { NativeSelect, NativeSelectOption } from './ui/native-select'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/** The boards' outlined dropdown (a native select, so phones get their own picker). */
export function Select({
  value,
  onChange,
  options,
  label,
  size = 'lg',
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label?: string
  /** "lg": 40 px (the default); "md": 32 px, for filter bars. */
  size?: 'lg' | 'md'
  /** Width classes; the boards' dropdowns are at least 218 px wide unless given another min-width. */
  className?: string
}) {
  return (
    <NativeSelect
      size={size}
      className={cn('min-w-[218px] [&_select]:w-full', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
