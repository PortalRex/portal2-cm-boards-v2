import { describe, expect, it } from 'vitest'
import type { Run } from '@/types/runs'
import {
  applyFilterChanges,
  changelogFilters,
  CLEARED,
  extraFilterCount,
  isFiltered,
  readFilters,
} from './filters'
import { mergeCoopHalves } from './merge-coop-halves'

const modes = ['sp', 'coop']

describe('readFilters', () => {
  it('uses the legacy defaults', () => {
    expect(readFilters({}, modes)).toEqual({
      mode: '',
      mapId: '',
      q: '',
      limit: '200',
      wr: false,
      video: false,
      demo: false,
      pending: false,
      banned: 'hide',
      rank: '',
      days: '',
      page: 0,
    })
  })

  it('reads a shared link', () => {
    const f = readFilters(
      {
        mode: 'coop',
        map: '47741',
        q: 'zyp',
        limit: '500',
        wr: '1',
        banned: 'only',
        rank: '10',
        days: '7',
        page: '3',
      },
      modes,
    )
    expect(f).toMatchObject({
      mode: 'coop',
      mapId: '47741',
      q: 'zyp',
      limit: '500',
      wr: true,
      banned: 'only',
    })
    expect(f).toMatchObject({ rank: '10', days: '7', page: 3 })
  })

  it("drops values that aren't allowed, like a board of another game", () => {
    expect(
      readFilters({ mode: 'story', limit: '9', banned: 'all', rank: '3', days: '2', page: '-4' }, modes),
    ).toMatchObject({
      mode: '',
      limit: '200',
      banned: 'hide',
      rank: '',
      days: '',
      page: 0,
    })
    expect(readFilters({ wr: 'true' }, modes).wr).toBe(false)
  })
})

describe('applyFilterChanges', () => {
  it('writes toggles as 1, leaves out defaults and resets the page', () => {
    expect(applyFilterChanges({ page: '4', q: 'a' }, { wr: true, limit: '200', banned: 'show' })).toEqual({
      q: 'a',
      wr: '1',
      banned: 'show',
    })
    expect(applyFilterChanges({ wr: '1' }, { wr: false })).toEqual({})
  })

  it('keeps the page when it is what changes, and other parameters', () => {
    expect(applyFilterChanges({ game: 'mel', q: 'a' } as never, { page: '2' })).toEqual({
      game: 'mel',
      q: 'a',
      page: '2',
    })
    expect(applyFilterChanges({ page: '2' }, { page: '0' })).toEqual({})
  })

  it('clears every filter but keeps the limit', () => {
    expect(applyFilterChanges({ mode: 'sp', wr: '1', q: 'x', limit: '500', days: '7' }, CLEARED)).toEqual({
      limit: '500',
    })
  })
})

describe('filter summaries', () => {
  it('counts the folded filters and knows when the feed is filtered', () => {
    const base = readFilters({}, modes)
    expect(extraFilterCount(base)).toBe(0)
    expect(isFiltered(base, '')).toBe(false)
    const busy = readFilters({ wr: '1', video: '1', rank: '10', limit: '500', banned: 'show' }, modes)
    expect(extraFilterCount(busy)).toBe(5)
    expect(isFiltered(busy, '')).toBe(true)
    expect(isFiltered(base, 'zyp')).toBe(true)
    // The limit alone doesn't count as filtering.
    expect(isFiltered(readFilters({ limit: '500' }, modes), '')).toBe(false)
  })

  it('asks the server for the filters with the debounced search', () => {
    expect(
      changelogFilters(readFilters({ mode: 'sp', wr: '1', limit: '100' }, modes), 'portal2', 'zyp'),
    ).toEqual({
      game: 'portal2',
      mode: 'sp',
      mapId: undefined,
      limit: 100,
      wr: true,
      video: false,
      demo: false,
      pending: false,
      banned: 'hide',
      rank: '',
      days: '',
      search: 'zyp',
    })
  })
})

describe('mergeCoopHalves', () => {
  const run = (id: number, coopId: number | null, submitter: string, game = 'portal2') =>
    ({ id, coopId, submitter, game, preRank: 5, postRank: 2, scoreDelta: -10 }) as Run

  it('shows both halves of a co-op run as one row, listing each PB', () => {
    const merged = mergeCoopHalves([run(3, 9, 'b'), run(2, null, 'c'), run(1, 9, 'a')])
    expect(merged.map((r) => r.id)).toEqual([3, 2])
    expect(merged[0]!.pbs!.map((p) => p.profileNumber)).toEqual(['b', 'a'])
    expect(merged[1]!.pbs).toBeNull()
  })

  it("doesn't merge runs of different games with the same co-op id", () => {
    expect(mergeCoopHalves([run(3, 9, 'b'), run(1, 9, 'a', 'mel')])).toHaveLength(2)
  })
})
