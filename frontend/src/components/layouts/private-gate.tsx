import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SteamIcon } from '@/components/icons'
import { isStaff, logout, meQueryOptions, siteQueryOptions, steamLoginUrl } from '@/lib/auth'

const buttonClass =
  'inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[4px] px-[18px] text-lg no-underline'

/**
 * Staff-only mode (the server's SERVER.PRIVATE): until launch only signed-in staff see the site;
 * everyone else gets this page with the Steam sign-in. The server enforces it either way. Staff
 * viewing the site as a player still get in.
 */
export function PrivateGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { pathname, searchStr } = useLocation()
  const site = useQuery(siteQueryOptions())
  const me = useQuery(meQueryOptions())

  if (site.isPending || me.isPending) return <div className="min-h-screen bg-page" aria-busy="true" />
  const user = me.data ?? null
  if (!site.data?.private || isStaff(user)) return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4 text-foreground">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-3.5 rounded-lg border border-line bg-panel px-6 py-8 text-center">
        <h1 className="m-0 text-[44px] font-bold tracking-[0.02em]">P2CM</h1>
        <p className="m-0 text-lg">Coming soon!</p>
        {user ? (
          <>
            <p className="m-0 text-base text-text-muted">
              You’re signed in as <strong>{user.name}</strong>, which isn’t a staff account.
            </p>
            <button
              type="button"
              onClick={() => void logout(qc)}
              className={`${buttonClass} border border-line-strong bg-control text-foreground`}
            >
              Sign out
            </button>
          </>
        ) : (
          <a
            href={steamLoginUrl(pathname + searchStr)}
            className={`${buttonClass} border border-brand bg-brand font-semibold text-white`}
          >
            <SteamIcon size={20} /> Sign in through Steam
          </a>
        )}
      </div>
    </div>
  )
}
