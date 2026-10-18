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
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label?: string
  className?: string
}) {
  return (
    <NativeSelect
      size="lg"
      className={className}
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
