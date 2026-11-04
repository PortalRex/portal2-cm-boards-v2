/** The boards' own address: SAR only submits to it (and Mel to mel.portal2.sr). */
export const OFFICIAL_HOST = 'board.portal2.sr'

/**
 * The name SAR reads this site's key from: `autosubmit.key` on the boards' own address. Elsewhere
 * (the new boards' beta) `autosubmit_beta.key`, which SAR's beta build reads beside the boards'
 * `autosubmit.key`, submitting to both.
 */
export const keyFileName = (host: string) =>
  host === OFFICIAL_HOST ? 'autosubmit.key' : 'autosubmit_beta.key'

/**
 * SAR's key file: pairs of lines, the boards' address then the key. On the official address both
 * games' entries; elsewhere this site's address, for both games (see [keyFileName]).
 */
export function keyFile(key: string, host: string): string {
  if (host === OFFICIAL_HOST) return `${OFFICIAL_HOST}\n${key}\nmel.portal2.sr\n${key}\n`
  return `${host}\n${key}\n`
}
