import { describe, expect, it } from 'vitest'
import { createTestQueryClient } from '@/testing/test-utils'
import { invalidateRun, invalidateUser } from './invalidate'
import { queryKeys } from './query-keys'

const A = '76561198000000001'
const B = '76561198000000002'
const C = '76561198000000003'

function seeded() {
  const qc = createTestQueryClient()
  const keys = {
    catalog: queryKeys.catalog(),
    changelog: queryKeys.changelog('portal2', { limit: 200 }),
    board: queryKeys.mapBoard('portal2', '47741'),
    seasonBoard: queryKeys.mapBoard('portal-2-season-1', 's4-47741'),
    previews: queryKeys.mapPreviews('coop'),
    wr: queryKeys.wrHistory('portal2', '47741'),
    aggregated: queryKeys.aggregated('portal2', 'overall'),
    siteStats: queryKeys.siteStats('portal2'),
    run: queryKeys.run(10),
    otherRun: queryKeys.run(11),
    halves: queryKeys.coopHalves(3),
    profileA: queryKeys.profile(A),
    profileAStats: queryKeys.profileStats(A, 'mel'),
    profileB: queryKeys.profile(B),
    profileC: queryKeys.profile(C),
    userC: queryKeys.user(C),
    wallOfShame: queryKeys.wallOfShame(),
    donators: queryKeys.donators(),
    inbox: queryKeys.admin.inbox(),
  }
  for (const key of Object.values(keys)) qc.setQueryData(key, { seeded: true })
  const invalidated = () =>
    Object.entries(keys)
      .filter(([, key]) => qc.getQueryState(key)?.isInvalidated)
      .map(([name]) => name)
  return { qc, invalidated }
}

describe('invalidateRun', () => {
  it("marks the run, its co-op halves, its players' profiles and every board stale", async () => {
    const { qc, invalidated } = seeded()
    await invalidateRun(qc, { changelogId: 10, coopId: 3, profileNumbers: [A, B, null] })
    expect(invalidated()).toEqual([
      'changelog',
      'board',
      'seasonBoard',
      'previews',
      'wr',
      'aggregated',
      'siteStats',
      'run',
      'halves',
      'profileA',
      'profileAStats',
      'profileB',
    ])
  })

  it('leaves other runs, other players and unrelated data alone', async () => {
    const { qc, invalidated } = seeded()
    await invalidateRun(qc, { changelogId: 10 })
    const stale = invalidated()
    for (const name of [
      'otherRun',
      'profileA',
      'profileC',
      'userC',
      'catalog',
      'wallOfShame',
      'donators',
      'inbox',
    ]) {
      expect(stale).not.toContain(name)
    }
  })
})

describe('invalidateUser', () => {
  it("marks the player's profile and user, the lists showing them and the wall of shame stale", async () => {
    const { qc, invalidated } = seeded()
    await invalidateUser(qc, C)
    const stale = invalidated()
    expect(stale).toEqual(
      expect.arrayContaining(['profileC', 'userC', 'changelog', 'board', 'aggregated', 'wallOfShame']),
    )
    for (const name of ['profileA', 'profileB', 'run', 'catalog', 'donators', 'inbox'])
      expect(stale).not.toContain(name)
  })
})
