import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { formatDate } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { removeSubmitKey, resetSubmitKey, submitKeyQueryOptions } from '../api/settings'
import { keyFile, OFFICIAL_HOST } from '../utils/key-file'

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'autosubmit.key'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * SAR's challenge mode auto-submit: makes, replaces or removes your key. The key is shown once,
 * when it's made (the server keeps only its hash).
 */
export function AutoSubmitSetting({
  button,
  note,
  section,
}: {
  /** The page's button, note and section styles. */
  button: string
  note: string
  section: (title: string, children: ReactNode) => ReactNode
}) {
  const qc = useQueryClient()
  const status = useQuery(submitKeyQueryOptions()).data
  // A key just made: shown until the page is left.
  const [made, setMade] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.submitKey() })
  const reset = useMutation({
    mutationFn: resetSubmitKey,
    onSuccess: (r) => {
      setMade(r.key)
      setConfirming(false)
      setCopied(false)
      return refresh()
    },
  })
  const remove = useMutation({
    mutationFn: removeSubmitKey,
    onSuccess: () => {
      setMade(null)
      return refresh()
    },
  })
  if (!status) return null
  const busy = reset.isPending || remove.isPending
  const host = window.location.host
  const file = made ? keyFile(made, host) : null
  const error = reset.error ?? remove.error

  return section(
    'SAR auto-submit',
    <>
      <p className="mt-0 mb-3 max-w-[640px] text-base text-text-2">
        SAR can submit your challenge mode personal bests here by itself, with the demo, as you finish them.
        It needs your key in its <code>autosubmit.key</code> file.
      </p>
      {file ? (
        <div className="mb-3 max-w-[640px]">
          <p className="mt-0 mb-2 text-base text-text-2">
            Your new key. Copy it now: it isn&apos;t shown again.
          </p>
          <pre
            aria-label="autosubmit.key"
            className="m-0 rounded-[4px] border border-line-strong bg-control px-3 py-2 text-[15px] break-all whitespace-pre-wrap text-foreground"
          >
            {file}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              className={button}
              onClick={() =>
                navigator.clipboard.writeText(file).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className={button} onClick={() => download(file)}>
              Download autosubmit.key
            </button>
          </div>
          <p className={note}>
            Save it as <code>autosubmit.key</code> in your game folder (<code>Portal 2/portal2</code>), then
            run <code>sar_challenge_autosubmit_reload_api_key</code> in the console or restart the game.
            {host !== OFFICIAL_HOST &&
              ` SAR only submits to ${OFFICIAL_HOST}, so until the boards are there this only works with a test build of SAR.`}
          </p>
        </div>
      ) : (
        <p className="mt-0 mb-3 max-w-[640px] text-base text-text-2">
          {status.has_key
            ? `You have a key${status.created ? ` (made ${formatDate(status.created)})` : ''}. It's only shown when it's made: if you've lost it, make a new one.`
            : "You don't have a key yet."}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-base text-text-2">Your current key stops working. Make a new one?</span>
          <button type="button" className={button} disabled={busy} onClick={() => reset.mutate()}>
            Make a new key
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => (status.has_key ? setConfirming(true) : reset.mutate())}
          >
            {status.has_key ? 'Make a new key' : 'Make a key'}
          </button>
          {status.has_key && (
            <button type="button" className={button} disabled={busy} onClick={() => remove.mutate()}>
              Remove key
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 mb-0 max-w-[640px] text-base text-hl-red-text">{error.message}</p>}
    </>,
  )
}
