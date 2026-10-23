import { describe, expect, it } from 'vitest'
import { adaptMe } from '@/lib/auth'
import { users } from '@/testing/data/users'
import { staffPowers, type StaffProfile } from './staff-powers'

const target: StaffProfile = {
  profileNumber: '76561198099999999',
  name: 'Target',
  avatar: null,
  country: null,
  role: null,
  banned: false,
  frozen: false,
  nameLocked: false,
  avatarLocked: false,
  avatarCustom: false,
  steamName: 'Target',
}
const me = (u: keyof typeof users) => adaptMe(users[u])

describe('staffPowers', () => {
  it('gives players nothing, and never banned or anonymous users', () => {
    expect(staffPowers(null, target)).toBeNull()
    expect(staffPowers(me('player'), target)).toBeNull()
    expect(staffPowers(me('bannedAdmin'), target)).toBeNull()
  })

  it('lets verifiers freeze only', () => {
    expect(staffPowers(me('verifier'), target)).toEqual({
      role: false,
      freeze: true,
      ban: false,
      display: false,
    })
  })

  it('lets moderators also ban and change names, pictures and countries', () => {
    expect(staffPowers(me('moderator'), target)).toEqual({
      role: false,
      freeze: true,
      ban: true,
      display: true,
    })
  })

  it('lets admins also set staff tiers', () => {
    expect(staffPowers(me('admin'), target)).toEqual({ role: true, freeze: true, ban: true, display: true })
  })

  it("doesn't ban staff until they lose their role, but unbans them", () => {
    expect(staffPowers(me('admin'), { ...target, role: 'verifier' })?.ban).toBe(false)
    expect(staffPowers(me('admin'), { ...target, role: 'verifier', banned: true })?.ban).toBe(true)
  })

  it('lets only admins freeze other staff', () => {
    for (const role of ['verifier', 'moderator', 'admin']) {
      const staff = { ...target, role }
      expect(staffPowers(me('verifier'), staff)?.freeze).toBe(false)
      expect(staffPowers(me('moderator'), staff)?.freeze).toBe(false)
      expect(staffPowers(me('admin'), staff)?.freeze).toBe(true)
    }
  })

  it('keeps staff from changing their own role, freezing or banning themselves', () => {
    const self = { ...target, profileNumber: users.admin.profile_number, role: 'admin' }
    expect(staffPowers(me('admin'), self)).toEqual({ role: false, freeze: false, ban: false, display: true })
  })
})
