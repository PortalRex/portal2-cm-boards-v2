import { cn } from 'cn'

// The games editor's look, from legacy GamesEditor.css. That sheet styled every input, select and
// button under `.ge` and then overrode some with class rules, so these are each element's final
// result, worked out from the cascade (e.g. `.ge button` outranked `.ge-game`'s own padding,
// size and radius, and `.ge .ge-game` cancelled its hover).

export const field =
  'h-[34px] rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground focus:border-brand-light focus:outline-none'
/** `.ge input.ge-short`. */
export const shortField = cn(field, 'w-[150px]')

export const button =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3.5 text-[15px] whitespace-nowrap text-foreground disabled:cursor-default disabled:opacity-45'
export const primary = cn(button, 'border-brand bg-brand font-semibold text-white')
export const danger = cn(button, 'border-hl-red text-hl-red-text')
/** `.ge .ge-link`: a text button. */
export const textButton =
  'h-auto cursor-pointer border-0 bg-transparent p-0 text-[13px] whitespace-nowrap text-brand-light disabled:cursor-default disabled:opacity-45'
export const textDanger = cn(textButton, 'text-hl-red-text')
/** `.ge .ge-add`: "+ Add …" (also `.ge-modes + .ge-add`, 10px instead of 12px above). */
export const addButton = cn(button, 'mt-3 border-dashed bg-transparent text-text-muted')

export const card = 'rounded-md border border-line bg-row-alt px-[18px] py-4'
export const cardTitle = 'm-0 text-[19px] font-semibold'
export const cardHead = 'mb-2.5 flex flex-wrap items-center justify-between gap-2.5'
export const hint = 'm-0 text-sm text-text-muted'
export const error = 'm-0 text-sm text-hl-red-text'
export const actions = 'flex flex-wrap justify-end gap-2'
export const inline = 'flex flex-wrap items-center gap-1.5'
export const addForm = cn(inline, 'mt-1')
export const row = 'flex flex-wrap gap-3'
/** `.ge-form label`, with its `> span`. */
export const formLabel = 'flex min-w-[180px] flex-1 flex-col gap-1'
export const formLabelText = 'text-sm text-text-muted'
export const check = 'inline-flex items-center gap-1 text-sm'
export const chips = 'flex flex-wrap items-center gap-2'
export const chip = 'inline-flex items-center gap-2 rounded-[4px] border border-line px-2.5 py-1 text-sm'
export const upload =
  'inline-flex h-[30px] cursor-pointer items-center rounded-[4px] border border-line-strong bg-control px-3 text-sm hover:border-brand'
/** A map in a chapter (`.ge .ge-map`, a button). */
export const mapChip =
  'h-[30px] cursor-grab rounded-[15px] border border-line bg-control-raised px-3 text-sm whitespace-nowrap text-foreground'
