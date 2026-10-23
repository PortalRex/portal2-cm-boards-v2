import { useQuery } from '@tanstack/react-query'
import { isStaff, siteQueryOptions } from '@/lib/auth'
import { useCurrentUser } from './use-current-user'

/**
 * Read-only mode (the server's SERVER.READ_ONLY, for the first days after opening): `on` while it
 * lasts, and `blocked` for whoever can't change anything then, which is everyone but staff. The
 * server refuses their changes either way; the site hides what would fail.
 */
export function useReadOnly(): { on: boolean; blocked: boolean } {
  const site = useQuery(siteQueryOptions()).data
  const user = useCurrentUser()
  const on = Boolean(site?.readOnly)
  return { on, blocked: on && !isStaff(user) }
}
