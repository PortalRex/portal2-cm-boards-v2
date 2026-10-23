import { cn } from 'cn'
import { pageWindow } from '@/lib/pagination'
import { TriangleLeft, TriangleRight } from './icons'

const buttonClass =
  'inline-flex h-6 min-w-[26px] cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent px-1 text-base hover:not-disabled:bg-seg-active disabled:cursor-default disabled:opacity-35'

/** ◀ 1 2 3 4 … ▶ (pages are 0-based; nothing when there's only one). */
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  if (pageCount <= 1) return null
  const { pages, more } = pageWindow(page, pageCount)
  return (
    <nav
      aria-label="Pagination"
      className="inline-flex h-8 items-center gap-0.5 rounded-[4px] border border-line-strong px-1.5"
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        aria-label="Previous page"
      >
        <TriangleLeft />
      </button>
      {pages.map((p) => (
        <button
          type="button"
          key={p}
          className={cn(buttonClass, p === page && 'bg-seg-active')}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p + 1}
        </button>
      ))}
      {more && (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(Math.min(pageCount - 1, pages[pages.length - 1]! + 1))}
          aria-label="More pages"
        >
          …
        </button>
      )}
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
        disabled={page >= pageCount - 1}
        aria-label="Next page"
      >
        <TriangleRight />
      </button>
    </nav>
  )
}
