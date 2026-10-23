import { useReadOnly } from '@/hooks/use-read-only'

/** A line under the top bar while the boards are read-only (staff are told they can still edit). */
export function ReadOnlyBanner() {
  const { on, blocked } = useReadOnly()
  if (!on) return null
  return (
    <div
      role="status"
      className="border-b border-line bg-pending px-4 py-2 text-center text-base text-pending-text"
    >
      {blocked
        ? 'The boards are read-only for now: submitting runs, reactions and reports open soon.'
        : 'Read-only mode is on: only staff can make changes.'}
    </div>
  )
}
