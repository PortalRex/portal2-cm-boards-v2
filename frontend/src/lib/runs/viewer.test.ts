import { describe, expect, it } from 'vitest'
import { replayOf, replayRunsOf, replaySearch, replaySearchSchema, viewerFrameSrc } from './viewer'

describe('replayOf', () => {
  it("is a run's demos, missing ones and repeats left out", () => {
    expect(replayOf([7, null, 9, 9])).toEqual({ open: [7, 9] })
  })

  it('is null without a demo', () => {
    expect(replayOf([null, undefined])).toBeNull()
    expect(replayOf([])).toBeNull()
  })
})

describe('viewerFrameSrc', () => {
  it('names the run, its partner, the raced runs and the swarm', () => {
    expect(viewerFrameSrc({ open: [7, 9], race: [1, 2], swarm: [3] }, 'full')).toBe(
      '/viewer/?embed=full#board=7&with=9&race=1,2&swarm=3',
    )
    expect(viewerFrameSrc({ open: [7] }, 'compact')).toBe('/viewer/?embed=compact#board=7')
  })
})

describe('replay search', () => {
  it('goes there and back', () => {
    const search = replaySearch({ open: [7, 9], race: [1, 2] }, { run: 55, map: '47458', what: 'top' })
    expect(search).toEqual({
      demo: 7,
      with: '9',
      race: '1,2',
      swarm: undefined,
      run: 55,
      map: '47458',
      what: 'top',
    })
    expect(replayRunsOf(search)).toEqual({ open: [7, 9], race: [1, 2], swarm: [] })
  })

  it('drops what it cannot read', () => {
    const search = replaySearchSchema.parse({ demo: 'x', race: '1,a', what: 'nope', with: '4,5' })
    expect(search).toEqual({ with: '4,5' })
    expect(replayRunsOf(search)).toBeNull()
  })
})
