import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { env } from '@/config/env'
import { api, apiUrl } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

// Who is signed in, their staff role, and the site's private mode. Sign-in itself is Steam
// OpenID on the server: the browser goes to /auth/steam/login and comes back with a session cookie.

export type Role = 'verifier' | 'moderator' | 'admin'

/** GET /auth/me (server/src/tools/auth.rs AuthUser), or null when signed out. */
export interface MeRaw {
  profile_number: string
  user_name: string
  avatar: string | null
  admin: number
  role: Role | null
  banned: boolean
}

export interface CurrentUser {
  profileNumber: string
  name: string
  avatar: string | null
  admin: number
  /** Staff tier; null for players, and for staff viewing the site as a player. */
  role: Role | null
  banned: boolean
  /** The real role of staff viewing the site as a player (for the switch in Settings). */
  staffRole?: Role | null
  /** The stand-in user shown with sample data; never staff. */
  sample?: boolean
}

export const ROLE_LABELS: Record<Role, string> = {
  verifier: 'Verifier',
  moderator: 'Moderator',
  admin: 'Admin',
}

/** Staff (any tier: verifier, moderator, admin) can use the staff tools. Sample and banned users never can. */
export const isStaff = (user: CurrentUser | null | undefined): boolean =>
  Boolean(user?.role) && !user!.sample && !user!.banned

/** Admins also manage roles and the game catalog. */
export const isRoleAdmin = (user: CurrentUser | null | undefined): boolean =>
  isStaff(user) && user?.role === 'admin'

export const adaptMe = (me: MeRaw | null): CurrentUser | null =>
  me && {
    profileNumber: me.profile_number,
    name: me.user_name,
    avatar: me.avatar,
    admin: me.admin,
    role: me.role || null,
    banned: me.banned,
  }

/**
 * Staff can view the site as a regular player (saved in this browser): the user is then given
 * without a role, so every staff tool and link is hidden; `staffRole` keeps the real one. The
 * server still allows what the role allows.
 */
export const asViewed = (user: CurrentUser | null, asPlayer: boolean): CurrentUser | null =>
  asPlayer && user?.role ? { ...user, role: null, staffRole: user.role } : user

/** The signed-in user, marked as the sample stand-in when the site shows sample data. */
export async function getMe(signal?: AbortSignal, sample = env.VITE_USE_MOCK): Promise<CurrentUser | null> {
  // Like legacy: if the check fails, the visitor counts as signed out.
  const user = adaptMe(await api.get<MeRaw | null>('/auth/me', { signal }).catch(() => null))
  return user && sample ? { ...user, sample: true } : user
}

export const meQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => getMe(signal),
    staleTime: Infinity,
  })

export interface SiteInfo {
  /** Staff-only mode (SERVER.PRIVATE): everyone else sees the sign-in gate. */
  private: boolean
}

export const siteQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.site(),
    queryFn: async ({ signal }): Promise<SiteInfo> => {
      const site = await api.get<SiteInfo>('/site', { signal }).catch(() => null)
      return { private: Boolean(site?.private) }
    },
    staleTime: Infinity,
  })

/** Where the Sign in button goes; Steam sends the browser back to `returnTo` afterwards. */
export const steamLoginUrl = (returnTo: string): string => apiUrl('/auth/steam/login', { return: returnTo })

/** Signs out of this browser and forgets the user everywhere on the page. */
export async function logout(qc: QueryClient): Promise<void> {
  await api.post('/auth/logout')
  qc.setQueryData(queryKeys.me(), null)
}
