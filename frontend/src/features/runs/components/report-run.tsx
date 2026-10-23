import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { FlagIcon } from '@/components/icons'
import { useReadOnly } from '@/hooks/use-read-only'
import { REPORT_REASONS, reportRun, type ReportReason } from '@/lib/runs/reports'

const field = 'rounded-[4px] border border-line bg-control px-2.5 py-1.5 text-[15px] text-foreground'
const action =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3.5 text-[15px] text-foreground disabled:cursor-default disabled:opacity-50'

/** Anyone can report a run (not while the boards are read-only); staff see the report but not who sent it. */
export function ReportRun({ changelogId }: { changelogId: number }) {
  const { blocked } = useReadOnly()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const send = useMutation({
    mutationFn: () => reportRun(changelogId, reason as ReportReason, details.trim()),
  })

  if (blocked) return null
  if (send.isSuccess) {
    return (
      <p className="mt-2.5 mb-0 text-sm text-green">Thanks, staff will take a look. Reports are anonymous.</p>
    )
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 inline-flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-sm text-text-muted hover:text-foreground"
      >
        <FlagIcon className="size-[18px]" /> Report run
      </button>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send.mutate()
  }
  return (
    <form
      onSubmit={submit}
      aria-label="Report this run"
      className="mt-3 flex max-w-[460px] flex-col gap-2 rounded-md border border-line bg-row-alt px-3.5 py-3"
    >
      <span className="text-base font-semibold">
        Report this run <small className="font-normal text-text-muted">(anonymous)</small>
      </span>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason | '')}
        required
        aria-label="Reason"
        className={field}
      >
        <option value="">What's wrong?</option>
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={
          reason === 'other'
            ? 'Describe the problem'
            : 'Details (optional): timestamps, links, what you noticed'
        }
        aria-label="Details"
        maxLength={1000}
        rows={2}
        required={reason === 'other'}
        className={`${field} resize-y`}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={send.isPending} className={action}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={send.isPending || !reason}
          className={`${action} border-brand bg-brand text-white`}
        >
          {send.isPending ? 'Sending…' : 'Send report'}
        </button>
      </div>
      {send.error && <span className="text-sm text-hl-red-text">{send.error.message}</span>}
    </form>
  )
}
