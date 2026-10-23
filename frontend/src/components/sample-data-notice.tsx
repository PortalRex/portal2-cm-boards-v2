import { env } from '@/config/env'

/** Says the page is showing sample data (VITE_USE_MOCK=true), as the legacy site's corner badge did. */
export function SampleDataNotice({ active = env.VITE_USE_MOCK }: { active?: boolean }) {
  if (!active) return null
  return (
    <div
      role="status"
      title={`Could not reach ${env.VITE_API_URL}`}
      className="fixed right-4 bottom-4 z-30 rounded-full bg-pending px-3 py-1.5 text-sm tracking-[0.04em] text-pending-text uppercase"
    >
      Sample data · API offline
    </div>
  )
}
