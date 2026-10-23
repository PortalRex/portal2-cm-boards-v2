/** The boards' own address: SAR only submits to it (and Mel to mel.portal2.sr). */
export const OFFICIAL_HOST = 'board.portal2.sr'

/**
 * SAR's `autosubmit.key`: pairs of lines, the boards' address then the key. On the official address
 * both games' entries; elsewhere this site's address (which only test builds of SAR accept).
 */
export function keyFile(key: string, host: string): string {
  if (host === OFFICIAL_HOST) return `${OFFICIAL_HOST}\n${key}\nmel.portal2.sr\n${key}\n`
  return `${host}\n${key}\n`
}
