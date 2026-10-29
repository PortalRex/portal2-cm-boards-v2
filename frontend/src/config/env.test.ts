import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('uses the legacy defaults when nothing is set', () => {
    expect(parseEnv({})).toEqual({
      VITE_API_URL: '/api/v1',
      VITE_AUTORENDER_URL: 'https://autorender.portal2.sr',
      VITE_AUTORENDER_STORAGE_URL: 'https://portal2.fsn1.your-objectstorage.com',
      VITE_MEL_GAME_ID: 2,
      VITE_USE_MOCK: false,
      VITE_VIEWER: false,
    })
  })

  it('treats empty strings as unset and trims trailing slashes', () => {
    const env = parseEnv({ VITE_API_URL: 'http://localhost:8080/api/v1/', VITE_MEL_GAME_ID: '' })
    expect(env.VITE_API_URL).toBe('http://localhost:8080/api/v1')
    expect(env.VITE_MEL_GAME_ID).toBe(2)
  })

  it('parses the Mel game id and the mock switch', () => {
    const env = parseEnv({ VITE_MEL_GAME_ID: '7', VITE_USE_MOCK: 'true' })
    expect(env.VITE_MEL_GAME_ID).toBe(7)
    expect(env.VITE_USE_MOCK).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(() => parseEnv({ VITE_MEL_GAME_ID: 'mel' })).toThrow()
    expect(() => parseEnv({ VITE_AUTORENDER_URL: 'not a url' })).toThrow()
  })
})
