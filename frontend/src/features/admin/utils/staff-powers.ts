import { isRoleAdmin, isStaff, type CurrentUser } from '@/lib/auth'

/** What the staff tools need to know about a profile (the profile page's player has these). */
export interface StaffProfile {
  profileNumber: string
  name: string
  avatar: string | null
  country: string | null
  role: string | null
  banned: boolean
  frozen: boolean
  nameLocked: boolean
  avatarLocked: boolean
  avatarCustom: boolean
  steamName: string | null
}

export interface StaffPowers {
  /** Set the staff tier (admins, not on themselves). */
  role: boolean
  /** Freeze / unfreeze (any staff, not themselves; only admins on other staff). */
  freeze: boolean
  /** Ban / unban (moderators and admins, not themselves; staff lose their role first). */
  ban: boolean
  /** Name, picture and country (moderators and admins). */
  display: boolean
}

/** What a staff member can do to this profile; null when they aren't staff. */
export function staffPowers(user: CurrentUser | null | undefined, player: StaffProfile): StaffPowers | null {
  if (!user || !isStaff(user)) return null
  const self = user.profileNumber === player.profileNumber
  const mod = user.role === 'moderator' || user.role === 'admin'
  return {
    role: isRoleAdmin(user) && !self,
    freeze: !self && (!player.role || isRoleAdmin(user)),
    ban: mod && !self && (!player.role || player.banned),
    display: mod,
  }
}
