/**
 * Where a picture by address may be: Steam's image servers and Imgur's, the same list the server
 * holds for players' pictures (`moderation::AVATAR_HOSTS`). The browser loads the picture straight
 * from its address, so another server could log whoever sees it.
 */
export const IMAGE_HOSTS = [
  'avatars.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'avatars.cloudflare.steamstatic.com',
  'avatars.fastly.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'steamuserimages-a.akamaihd.net',
  'images.steamusercontent.com',
  'i.imgur.com',
]

/** Said when an address isn't one: the server's wording for players' pictures. */
export const IMAGE_ADDRESS_RULE =
  'The picture has to be on Steam or Imgur (an https:// address of the image itself).'

/** Whether `address` is a picture address the site loads: https, on one of IMAGE_HOSTS, with no
 *  login or port, and a file path (as the server checks it). */
export const imageAddressOk = (address: string): boolean => imageAddress(address) !== null

/** The address as the browser writes it (quotes percent-encoded, so it's safe inside CSS `url("…")`),
 *  or null when it isn't one the site loads (see imageAddressOk). */
export function imageAddress(address: string): string | null {
  if (address.length > 500 || /\s/.test(address)) return null
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return null
  }
  const ok =
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    IMAGE_HOSTS.includes(url.hostname) &&
    url.pathname.length > 1
  return ok ? url.href : null
}
