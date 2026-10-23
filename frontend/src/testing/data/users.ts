import type { MeRaw } from '@/lib/auth'

// /auth/me answers for each kind of visitor the tests check (anonymous is null).
const me = (n: number, name: string, role: MeRaw['role'], extra: Partial<MeRaw> = {}): MeRaw => ({
  profile_number: `7656119800000000${n}`,
  user_name: name,
  avatar: `https://avatars.steamstatic.com/${n}_full.jpg`,
  admin: role ? 1 : 0,
  role,
  banned: false,
  ...extra,
})

export const users = {
  player: me(1, 'Player', null),
  verifier: me(2, 'Verifier', 'verifier'),
  moderator: me(3, 'Moderator', 'moderator'),
  admin: me(4, 'Admin', 'admin'),
  bannedAdmin: me(5, 'Banned Admin', 'admin', { banned: true }),
} satisfies Record<string, MeRaw>

export type TestUser = keyof typeof users
