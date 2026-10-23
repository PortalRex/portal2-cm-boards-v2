import { describe, expect, it } from 'vitest'
import type { Run } from '@/types/runs'
import { filterTimes, sortTimes } from './all-times'

const run = (id: number, over: Partial<Run> & { title?: string; mode?: string; mapId?: string } = {}): Run =>
  ({
    id,
    timestamp: null,
    score: 1000,
    postRank: null,
    scoreDelta: null,
    map: {
      id: over.mapId ?? 'm1',
      title: over.title ?? 'Map',
      mode: over.mode ?? 'sp',
      game: 'portal2',
      chapter: '',
    },
    ...over,
  }) as Run

const ids = (runs: Run[]) => runs.map((r) => r.id)

describe('sortTimes', () => {
  const runs = [
    run(1, { timestamp: '2020-01-01T00:00:00', postRank: 5, scoreDelta: -10, mapId: 'b' }),
    run(2, { timestamp: '2024-06-01T00:00:00', postRank: null, scoreDelta: null, mapId: 'a' }),
    run(3, { timestamp: null, postRank: 1, scoreDelta: -300, mapId: 'a' }),
    run(4, { timestamp: '2022-03-01T00:00:00', postRank: 20, scoreDelta: -50, mapId: 'c' }),
  ]
  const order = new Map([
    ['a', 0],
    ['b', 1],
    ['c', 2],
  ])

  it('newest and oldest first, undated runs last either way', () => {
    expect(ids(sortTimes(runs, 'newest', order))).toEqual([2, 4, 1, 3])
    expect(ids(sortTimes(runs, 'oldest', order))).toEqual([1, 4, 2, 3])
  })

  it('best rank first, unranked last', () =>
    expect(ids(sortTimes(runs, 'rank', order))).toEqual([3, 1, 4, 2]))

  it('the most time taken off first, first times last', () =>
    expect(ids(sortTimes(runs, 'improvement', order))).toEqual([3, 4, 1, 2]))

  it('map order, newest first within a map', () =>
    expect(ids(sortTimes(runs, 'map', order))).toEqual([2, 3, 1, 4]))

  it("doesn't change the list it's given", () => {
    sortTimes(runs, 'oldest', order)
    expect(ids(runs)).toEqual([1, 2, 3, 4])
  })
})

describe('filterTimes', () => {
  const runs = [
    run(1, { title: 'Portal Gun' }),
    run(2, { title: 'Doors', mode: 'coop' }),
    run(3, { title: 'Portal Carousel' }),
  ]
  const coop = new Set(['coop'])

  it('by single player or co-op', () => {
    expect(ids(filterTimes(runs, 'all', '', coop))).toEqual([1, 2, 3])
    expect(ids(filterTimes(runs, 'sp', '', coop))).toEqual([1, 3])
    expect(ids(filterTimes(runs, 'coop', '', coop))).toEqual([2])
  })

  it('by map name, ignoring case', () =>
    expect(ids(filterTimes(runs, 'all', ' portal ', coop))).toEqual([1, 3]))
})
