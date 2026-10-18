import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { createTestQueryClient } from '@/testing/test-utils'
import {
  adaptMe,
  asViewed,
  isRoleAdmin,
  isStaff,
  logout,
  meQueryOptions,
  ROLE_LABELS,
  siteQueryOptions,
  steamLoginUrl,
  type CurrentUser,
} from './index'

const user = (name: keyof typeof users) => adaptMe(users[name])!

describe('roles', () => {
  it('counts every staff tier as staff, and only admins as admins', () => {
    expect(isStaff(user('verifier'))).toBe(true)
    expect(isStaff(user('moderator'))).toBe(true)
    expect(isStaff(user('admin'))).toBe(true)
    expect(isStaff(user('player'))).toBe(false)
    expect(isStaff(null)).toBe(false)
    expect([isRoleAdmin(user('admin')), isRoleAdmin(user('moderator')), isRoleAdmin(null)]).toEqual([
      true,
      false,
      false,
    ])
    expect(ROLE_LABELS).toEqual({ verifier: 'Verifier', moderator: 'Moderator', admin: 'Admin' })
  })

  it('never treats banned or sample users as staff', () => {
    expect(isStaff(user('bannedAdmin'))).toBe(false)
    expect(isRoleAdmin(user('bannedAdmin'))).toBe(false)
    const sample: CurrentUser = { ...user('admin'), sample: true }
    expect(isStaff(sample)).toBe(false)
  })

  it('hides the role while staff view the site as a player, keeping it as staffRole', () => {
    const viewed = asViewed(user('moderator'), true)!
    expect(viewed.role).toBeNull()
    expect(viewed.staffRole).toBe('moderator')
    expect(isStaff(viewed)).toBe(false)
    expect(asViewed(user('moderator'), false)).toEqual(user('moderator'))
    expect(asViewed(user('player'), true)).toEqual(user('player'))
    expect(asViewed(null, true)).toBeNull()
  })
})

describe('adaptMe', () => {
  it('turns /auth/me into the current user', () => {
    expect(adaptMe(users.admin)).toEqual({
      profileNumber: '76561198000000004',
      name: 'Admin',
      avatar: 'https://avatars.steamstatic.com/4_full.jpg',
      admin: 1,
      role: 'admin',
      banned: false,
    })
    expect(adaptMe(null)).toBeNull()
  })
})

describe('auth queries', () => {
  it('loads the signed-in user', async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(users.verifier)))
    expect(await createTestQueryClient().fetchQuery(meQueryOptions())).toMatchObject({
      name: 'Verifier',
      role: 'verifier',
    })
  })

  it('treats signed out and a failed check as nobody', async () => {
    expect(await createTestQueryClient().fetchQuery(meQueryOptions())).toBeNull()
    server.use(http.get(`${API}/auth/me`, () => new HttpResponse(null, { status: 500 })))
    expect(await createTestQueryClient().fetchQuery(meQueryOptions())).toBeNull()
  })

  it('reads private mode, assuming public when /site fails', async () => {
    server.use(http.get(`${API}/site`, () => HttpResponse.json({ private: true })))
    expect(await createTestQueryClient().fetchQuery(siteQueryOptions())).toEqual({ private: true })
    server.use(http.get(`${API}/site`, () => HttpResponse.error()))
    expect(await createTestQueryClient().fetchQuery(siteQueryOptions())).toEqual({ private: false })
  })

  it('signs out and forgets the user', async () => {
    let called = false
    server.use(
      http.post(`${API}/auth/logout`, () => {
        called = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const qc = createTestQueryClient()
    qc.setQueryData(queryKeys.me(), user('admin'))
    await logout(qc)
    expect(called).toBe(true)
    expect(qc.getQueryData(queryKeys.me())).toBeNull()
  })

  it('sends Steam sign-in back to the page', () => {
    expect(steamLoginUrl('/profile/1?tab=mel')).toBe(
      'http://localhost:3000/api/v1/auth/steam/login?return=%2Fprofile%2F1%3Ftab%3Dmel',
    )
  })
})
