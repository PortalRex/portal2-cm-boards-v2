import { useCurrentUser } from './use-current-user'

/** Whether `player` is the signed-in viewer (never for the sample stand-in). */
export function useIsMe(profileNumber: string | null | undefined): boolean {
  const me = useCurrentUser()
  return Boolean(profileNumber && me && !me.sample && me.profileNumber === profileNumber)
}
