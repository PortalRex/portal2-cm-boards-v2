import { describe, expect, it } from 'vitest'
import { parseSearch, stringifySearch } from './search-params'

describe('search params', () => {
  it('keeps every value as text, so Steam ids stay exact', () => {
    expect(parseSearch('?a=76561198000000001&b=76561198000000002&limit=500')).toEqual({
      a: '76561198000000001',
      b: '76561198000000002',
      limit: '500',
    })
    expect(parseSearch('')).toEqual({})
  })

  it('writes plain query strings like legacy, leaving out empty and off values', () => {
    expect(stringifySearch({ a: '76561198000000001', page: 2, wr: true, video: false, q: '', x: null })).toBe(
      '?a=76561198000000001&page=2&wr=true',
    )
    expect(stringifySearch({})).toBe('')
    expect(stringifySearch({ q: 'zyp eh' })).toBe('?q=zyp+eh')
  })
})
