import { describe, expect, it } from 'vitest'
import { imageAddress, imageAddressOk } from './image-address'

// The same cases as the server's moderation::tests::pictures_only_from_steam_or_imgur.
describe('imageAddressOk', () => {
  it('takes https pictures on Steam and Imgur', () => {
    for (const address of [
      'https://i.imgur.com/AbCd123.png',
      'https://I.IMGUR.COM/AbCd123.png',
      'https://avatars.steamstatic.com/abc_full.jpg',
      'https://images.steamusercontent.com/ugc/1/2/',
    ])
      expect(imageAddressOk(address), address).toBe(true)
  })

  it('refuses other servers, http, logins, ports and pages', () => {
    for (const address of [
      'http://i.imgur.com/AbCd123.png',
      'https://imgur.com/AbCd123',
      'https://i.imgur.com/',
      'https://i.imgur.com',
      'https://i.imgur.com.evil.example/me.png',
      'https://evil.example/i.imgur.com/me.png',
      'https://i.imgur.com@evil.example/me.png',
      'https://user:pw@i.imgur.com/me.png',
      'https://i.imgur.com:8443/me.png',
      'https://i.imgur.com/a b.png',
      '//i.imgur.com/me.png',
      'javascript:alert(1)',
      '',
      `https://i.imgur.com/${'a'.repeat(500)}.png`,
    ])
      expect(imageAddressOk(address), address).toBe(false)
  })

  it('writes the address so it stays inside CSS url("…")', () => {
    expect(imageAddress('https://i.imgur.com/a"b).png')).toBe('https://i.imgur.com/a%22b).png')
    expect(imageAddress('https://i.imgur.com/a\\b.png')).toBe('https://i.imgur.com/a/b.png')
    expect(imageAddress('https://evil.example/a.png')).toBeNull()
  })
})
