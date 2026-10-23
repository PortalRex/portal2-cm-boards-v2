import { describe, expect, it } from 'vitest'
import { youtubeChannelLabel, youtubeChannelUrl } from './youtube'

// The legacy outputs (frontend-legacy/src/lib/youtube.js): input, link, label.
describe('YouTube channel links', () => {
  it.each([
    ['', null, ''],
    ['/@iVerb', 'https://www.youtube.com/@iVerb', '@iVerb'],
    [
      '/channel/UCabcdefghijklmnopqrstuv',
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'UCabcdefghijklmnopqrstuv',
    ],
    ['/user/someone', 'https://www.youtube.com/user/someone', 'user/someone'],
    [
      'UCabcdefghijklmnopqrstuv',
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'UCabcdefghijklmnopqrstuv',
    ],
    ['@handle', 'https://www.youtube.com/@handle', '@handle'],
    ['handle', 'https://www.youtube.com/@handle', '@handle'],
    ['https://www.youtube.com/@Zypeh/videos?x=1', 'https://www.youtube.com/@Zypeh/videos', '@Zypeh/videos'],
    ['/c/name/', 'https://www.youtube.com/c/name', 'c/name'],
    ['/weird', 'https://www.youtube.com/@weird', '@weird'],
  ])('%j', (value, url, label) => {
    expect(youtubeChannelUrl(value)).toBe(url)
    expect(youtubeChannelLabel(value)).toBe(label)
  })

  it('handles missing values', () => {
    expect(youtubeChannelUrl(null)).toBeNull()
    expect(youtubeChannelLabel(undefined)).toBe('')
  })
})
