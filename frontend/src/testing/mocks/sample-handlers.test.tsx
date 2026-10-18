import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SampleDataNotice } from '@/components/sample-data-notice'
import { adaptChangelog, adaptCoopRanked, adaptSpRanked } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { getMe, isStaff } from '@/lib/auth'
import { BUILTIN_CATALOG } from '@/lib/catalog'
import { SAMPLE_PLAYERS, sampleChangelog, sampleSpBoard } from '@/testing/data/sample'
import type { ChangelogRaw, CoopRankedRaw, SpRankedRaw } from '@/types/runs'
import { API } from './handlers'
import { sampleHandlers } from './sample-handlers'
import { server } from './server'

describe('sample data', () => {
  it('is the same on every call', () => {
    expect(sampleSpBoard('62761')).toEqual(sampleSpBoard('62761'))
    expect(SAMPLE_PLAYERS).toHaveLength(48)
  })

  it('is in the API shape, so the real adapters read it', () => {
    const board = sampleSpBoard('62761').map(adaptSpRanked)
    expect(board[0]).toMatchObject({ rank: 1, points: 200 })
    expect(board.every((r, i) => i === 0 || r.score >= board[i - 1]!.score)).toBe(true)
    const runs = sampleChangelog({ limit: '20' }).map((r) => adaptChangelog(r, 'portal2', BUILTIN_CATALOG))
    expect(runs).toHaveLength(20)
    expect(runs.every((r) => r.map.title)).toBe(true)
  })

  it('answers the changelog filters', () => {
    const coopOnly = sampleChangelog({ sp: 'false' })
    expect(coopOnly.length).toBeGreaterThan(0)
    expect(coopOnly.every((r) => r.coop_id != null)).toBe(true)
    expect(sampleChangelog({ banned: 'true' })).toEqual([])
    expect(sampleChangelog({ wr_gain: 'true' }).every((r) => r.post_rank === 1)).toBe(true)
    const player = SAMPLE_PLAYERS[3]!.profileNumber
    expect(
      sampleChangelog({ profile_number: player }).every(
        (r) => r.profile_number === player || r.orange_profile_number === player,
      ),
    ).toBe(true)
    expect(sampleChangelog({ game: 'mel' }).every((r) => Number(r.map_id) <= 44)).toBe(true)
  })
})

describe('sample handlers', () => {
  it('serve the boards, changelog and a sample user', async () => {
    server.use(...sampleHandlers(API))
    const board = await api.get<CoopRankedRaw[]>('/map/coop/47741')
    expect(board.map(adaptCoopRanked)[0]!.players).toHaveLength(2)
    const sp = await api.get<SpRankedRaw[]>('/map/sp/1', { params: { game_id: 2 } })
    expect(sp.length).toBeGreaterThan(0)
    const runs = await api.get<ChangelogRaw[]>('/changelog', { params: { limit: 5 } })
    expect(runs).toHaveLength(5)
    expect(await api.get('/catalog')).toEqual([])
  })

  it('serve aggregated boards where every sample player has a time on every map', async () => {
    server.use(...sampleHandlers(API))
    const sp = await api.get<{ points: [string, { num_scores: number; points: number }][] }>(
      '/points/game/1/sp',
    )
    expect(sp.points).toHaveLength(SAMPLE_PLAYERS.length)
    expect(sp.points.every(([, p]) => p.num_scores === 60)).toBe(true)
    const chapter = await api.get<typeof sp>('/points/game/1/chapter-7')
    expect(chapter.points[0]![1].num_scores).toBe(9)
    const story = await api.get<typeof sp>('/points/game/2/story')
    expect(story.points[0]![1].num_scores).toBe(22)
  })

  it("serve a sample player's profile that the profile adapters read", async () => {
    server.use(...sampleHandlers(API))
    const pn = SAMPLE_PLAYERS[3]!.profileNumber
    const page = await api.get<{ ranks: Record<string, number>; points: { place: number | null }[] }>(
      `/profile/${pn}`,
    )
    expect(Object.keys(page.ranks)).toHaveLength(108)
    expect(page.points.every((p) => p.place != null)).toBe(true)
    const scores = await api.get<{ map_id: string; rank: number }[]>(`/profile/scores/${pn}`)
    expect(Object.fromEntries(scores.map((s) => [s.map_id, s.rank]))).toEqual(page.ranks)
    expect(await api.get(`/user/${pn}`)).toMatchObject({
      profile_number: pn,
      board_name: SAMPLE_PLAYERS[3]!.name,
    })
    expect(Object.keys(await api.get<object>(`/ranks/game/2/${pn}`))).toHaveLength(40)
    const history = await api.get<{ date: string; overall: number }[]>(`/profile/points_history/${pn}`)
    expect(history.map((h) => h.date)).toEqual([...history.map((h) => h.date)].sort())
  })

  it('serve three banned players for the Wall of Shame, as legacy', async () => {
    server.use(...sampleHandlers(API))
    const banned = await api.get<{ profile_number: string }[]>('/wall_of_shame')
    expect(banned.map((u) => u.profile_number)).toEqual(SAMPLE_PLAYERS.slice(-3).map((p) => p.profileNumber))
  })

  it('signs in a sample player who is never staff', async () => {
    server.use(...sampleHandlers(API))
    const me = await getMe(undefined, true)
    expect(me).toMatchObject({ name: SAMPLE_PLAYERS[0]!.name, sample: true })
    expect(isStaff(me)).toBe(false)
  })

  it('answer 404 for endpoints without sample data', async () => {
    server.use(...sampleHandlers(API))
    await expect(api.get('/donators')).rejects.toMatchObject({
      status: 404,
      message: "Sample data doesn't cover this yet.",
    })
  })
})

describe('SampleDataNotice', () => {
  it('shows only when sample data is on', () => {
    const { rerender } = render(<SampleDataNotice active={false} />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<SampleDataNotice active />)
    expect(screen.getByRole('status')).toHaveTextContent('Sample data · API offline')
  })

  it('is off in tests and normal builds', () => {
    render(<SampleDataNotice />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
