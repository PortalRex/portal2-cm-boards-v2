import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { invalidateRun } from '@/lib/invalidate'
import { queryKeys } from '@/lib/query-keys'
import type { Player } from '@/types/runs'
import { COMMENT_MAX, runCommentQueryOptions, setRunComment } from '../api/comment'

const button =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3 text-[15px] text-text-2 hover:not-disabled:border-text-muted hover:not-disabled:text-foreground disabled:cursor-default disabled:opacity-50'
const link = 'cursor-pointer border-0 bg-transparent p-0 text-[15px] text-brand-light hover:underline'

/**
 * A run's comment in its details: the text (or "No comment"), and for whoever may change it (its
 * player, until staff set or clear it; staff, always) a way to add, edit or remove it.
 */
export function RunComment({
  changelogId,
  note: shown,
  coopId,
  players = [],
}: {
  /** The run (half) the comment is on; none for a partner demo without a run. */
  changelogId: number | null
  /** The comment the run came with, shown until the comment loads. */
  note: string | null | undefined
  coopId?: number | null
  players?: Player[]
}) {
  const qc = useQueryClient()
  const comment = useQuery({ ...runCommentQueryOptions(changelogId ?? -1), enabled: changelogId != null })
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (note: string | null) => setRunComment(changelogId!, note),
    onSuccess: (saved) => {
      setDraft(null)
      qc.setQueryData(queryKeys.runComment(changelogId!), saved)
      // The lists show the comment too.
      return invalidateRun(qc, { changelogId, coopId, profileNumbers: players.map((p) => p.profileNumber) })
    },
  })
  const note = comment.data ? comment.data.note : (shown ?? null)
  const editable = Boolean(comment.data?.editable)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(draft?.trim() || null)
  }

  return (
    <>
      <dt className="text-text-2 uppercase">Comment:</dt>
      <dd className="m-0 min-w-0 text-text-2">
        {draft != null ? (
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <textarea
              className="min-h-16 w-full rounded-[4px] border border-line bg-control px-2.5 py-1.5 text-base text-foreground"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={COMMENT_MAX}
              aria-label="Comment"
              // Opened by the Edit / Add button just clicked.
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className={button} disabled={save.isPending}>
                Save
              </button>
              {note && (
                <button
                  type="button"
                  className={button}
                  disabled={save.isPending}
                  onClick={() => save.mutate(null)}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className={button}
                disabled={save.isPending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <span className="ml-auto text-sm text-text-muted">
                {draft.length}/{COMMENT_MAX}
              </span>
            </div>
            {save.error && <span className="text-sm text-hl-red-text">{save.error.message}</span>}
          </form>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="break-words">{note || 'No comment'}</span>
            {comment.data?.locked && <span className="text-sm text-text-muted">(set by staff)</span>}
            {editable && (
              <button type="button" className={link} onClick={() => setDraft(note ?? '')}>
                {note ? 'Edit' : 'Add comment'}
              </button>
            )}
          </span>
        )}
      </dd>
    </>
  )
}
