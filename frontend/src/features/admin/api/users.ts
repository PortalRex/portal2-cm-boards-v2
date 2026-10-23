import { api } from '@/lib/api-client'
import type { Role } from '@/lib/auth'

// Staff changes to a profile (server handlers/moderation.rs and countries.rs). Each is written to
// the audit log with its reason.

/** A name and/or picture: name null = back to the Steam name; avatar "default", "steam" or an https address. */
export interface DisplayChanges {
  name?: string | null
  avatar?: string
}

export const setProfileDisplay = (profileNumber: string, changes: DisplayChanges, reason?: string) =>
  api.put(`/admin/users/${profileNumber}/display`, { body: { ...changes, reason } })

export const setProfileBanned = (profileNumber: string, banned: boolean, reason?: string) =>
  api.put(`/admin/users/${profileNumber}/banned`, { body: { banned, reason } })

export const setProfileFrozen = (profileNumber: string, frozen: boolean, reason?: string) =>
  api.put(`/admin/users/${profileNumber}/freeze`, { body: { frozen, reason } })

// Legacy saved the role without the reason; kept so.
export const setProfileRole = (profileNumber: string, role: Role | null) =>
  api.put(`/admin/users/${profileNumber}/role`, { body: { role } })

export const setProfileCountry = (profileNumber: string, countryId: number | null, reason?: string) =>
  api.put(`/admin/users/${profileNumber}/country`, { body: { country_id: countryId, reason } })
