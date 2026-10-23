import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getInbox, inboxQueryOptions, waitForInbox, type StaffInboxData } from '../api/inbox'

// After a failed wait (server restarting or offline), ask again after this long.
const RETRY_MS = 10_000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * The staff inbox, kept live: once it has loaded, a long poll waits for the next entry (or the
 * inbox being read in another tab), loads the inbox into the query cache and waits again. The
 * poll stops when the component unmounts or the user stops being staff.
 */
export function useStaffInbox(enabled: boolean) {
  const qc = useQueryClient()
  const inbox = useQuery({ ...inboxQueryOptions(), enabled })
  const loaded = inbox.data != null

  useEffect(() => {
    if (!enabled || !loaded) return
    const abort = new AbortController()
    const { signal } = abort
    const key = inboxQueryOptions().queryKey
    void (async () => {
      while (!signal.aborted) {
        // Whatever the cache holds now: the last load, a refetch, or the badge cleared on opening.
        const current = qc.getQueryData<StaffInboxData>(key)
        try {
          const changed = await waitForInbox(current?.items[0]?.id ?? null, current?.seen_id ?? null, signal)
          if (changed && !signal.aborted) qc.setQueryData(key, await getInbox(signal))
        } catch {
          if (!signal.aborted) await sleep(RETRY_MS, signal)
        }
      }
    })()
    return () => abort.abort()
  }, [enabled, loaded, qc])

  return inbox
}
