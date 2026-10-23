import { describe, expect, it } from 'vitest'
import { COUNTRY_LIST, countryById, countryIdByCode, countryName } from './countries'

// Expected values are the legacy outputs (frontend-legacy/src/data/countries.js): browser names
// where Intl knows the country, a few set by hand.
describe('countries', () => {
  it.each([
    [1, { code: 'af', name: 'Afghanistan' }],
    [53, { code: 'ci', name: 'Côte d’Ivoire' }],
    [50, { code: 'cd', name: 'DR Congo' }],
    [225, { code: 'gb', name: 'United Kingdom' }],
    [226, { code: 'us', name: 'United States' }],
    [234, { code: 'vi', name: 'U.S. Virgin Islands' }],
    [999, null],
  ])('country %s', (id, expected) => {
    if (expected) expect(countryById(id)).toEqual({ id, ...expected })
    else expect(countryById(id)).toBeNull()
  })

  it('lists every country by name', () => {
    expect(COUNTRY_LIST).toHaveLength(239)
    expect(COUNTRY_LIST.slice(0, 3)).toEqual([
      { id: 1, code: 'af', name: 'Afghanistan' },
      { id: 2, code: 'al', name: 'Albania' },
      { id: 3, code: 'dz', name: 'Algeria' },
    ])
  })

  it('looks countries up by code', () => {
    expect(countryIdByCode('gb')).toBe(225)
    expect(countryIdByCode('zz')).toBeNull()
    expect(countryName('kr')).toBe('South Korea')
    expect(countryName('zz')).toBe('ZZ')
    expect(countryById(null)).toBeNull()
  })
})
