import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** The parts of GET /user/{id} that Settings shows (server models/users.rs). */
export interface MyUser {
  profile_number: string
  /** The name chosen on the boards; null = the Steam name. */
  board_name: string | null
  steam_name: string | null
  avatar: string | null
  country_id: number | null
  /** Set by staff: the player can't change it. */
  name_locked?: boolean
  avatar_locked?: boolean
}

export const myUserQueryOptions = (profileNumber: string) =>
  queryOptions({
    queryKey: queryKeys.user(profileNumber),
    queryFn: ({ signal }) => api.get<MyUser>(`/user/${profileNumber}`, { signal }),
  })

/** Your country (null clears it). */
export const setMyCountry = (countryId: number | null) =>
  api.put<{ country_id: number | null }>('/user/country', { body: { country_id: countryId } })

/** Your country from your Steam profile's public location (404 when it shows none). */
export const setMyCountryFromSteam = () => api.post<{ country_id: number | null }>('/user/country/steam')

/**
 * Your own name (null = your Steam name) and/or picture ("default", "steam" or an https address).
 * Refused for what staff have set.
 */
export const setMyDisplay = (changes: { name?: string | null; avatar?: string }) =>
  api.put('/user/display', { body: changes })

/** Whether you have a SAR auto-submit key, and when it was made (server api/v1/handlers/submit_key.rs). */
export interface SubmitKeyStatus {
  has_key: boolean
  created: string | null
}

export const submitKeyQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.submitKey(),
    queryFn: ({ signal }) => api.get<SubmitKeyStatus>('/user/submit-key', { signal }),
  })

/** Makes you a new auto-submit key (the old one stops working). The only time the key is shown. */
export const resetSubmitKey = () => api.post<{ key: string }>('/user/submit-key')

/** Removes your auto-submit key. */
export const removeSubmitKey = () => api.delete<{ has_key: boolean }>('/user/submit-key')
