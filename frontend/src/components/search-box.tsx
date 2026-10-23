import { FilterIcon, SearchIcon } from './icons'

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
  showFilter = true,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  showFilter?: boolean
}) {
  return (
    <label className="flex h-8 w-[min(428px,100%)] items-center gap-2 rounded-[4px] border border-line bg-control px-2 text-text-muted focus-within:border-line-strong">
      <SearchIcon className="size-5 shrink-0" aria-hidden />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-foreground outline-0"
      />
      {showFilter && <FilterIcon className="size-5 shrink-0" aria-hidden />}
    </label>
  )
}
