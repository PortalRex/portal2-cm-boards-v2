import type { ReactNode } from 'react'
import { ApiError } from '@/lib/api-client'

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="p-10 text-center text-lg text-text-muted">
      {label}…
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-lg text-text-muted">{children}</div>
}

/**
 * What a page shows when its data can't be loaded. Legacy fell back to sample data instead; the
 * new site never does that outside VITE_USE_MOCK (D1 in FRONTEND_REWRITE.md).
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const detail = error instanceof ApiError ? error.message : null
  return (
    <div role="alert" className="flex flex-col items-center gap-3 p-10 text-center text-lg text-text-muted">
      <p className="m-0">Couldn’t load this right now.</p>
      {detail && <p className="m-0 text-base text-text-dim">{detail}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-9 cursor-pointer rounded-[4px] border border-line-strong bg-control px-4 text-base text-foreground hover:bg-control-raised"
        >
          Try again
        </button>
      )}
    </div>
  )
}
