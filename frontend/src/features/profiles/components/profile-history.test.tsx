import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/testing/test-utils'
import type { Run } from '@/types/runs'
import { ProfileHistory } from './profile-history'

const portalGun = {
  id: '47458',
  title: 'Portal Gun',
  mode: 'sp',
  game: 'portal2',
  chapter: 'The Courtesy Call',
}
const laserStairs = {
  id: '47759',
  title: 'Laser Stairs',
  mode: 'sp',
  game: 'portal2',
  chapter: 'The Cold Boot',
}
const hero = { profileNumber: '76561198000000001', name: 'hero', avatar: null }

let nextId = 1
/** hero's PB at `time` (2026-10-28, UTC); each has its video, so nothing is asked of autorender. */
const pb = (time: string, over: Partial<Run> = {}): Run => ({
  id: nextId++,
  game: 'portal2',
  timestamp: `2026-10-28T${time}:00`,
  map: portalGun,
  score: 2300,
  preRank: 10,
  postRank: 8,
  scoreDelta: -20,
  pointsDelta: 5,
  players: [hero],
  submitter: hero.profileNumber,
  youtubeId: null,
  autorenderId: `v${nextId}`,
  demoId: null,
  portals: null,
  note: null,
  verified: true,
  banned: false,
  coopId: null,
  rolesKnown: null,
  sarVersion: null,
  dateEstimated: false,
  ...over,
})

describe('ProfileHistory', () => {
  it('shows a session of PBs on a map as one row, its earlier PBs opening under it', async () => {
    // Newest first: three Portal Gun PBs in an hour (with a Laser Stairs run between), then one a day before.
    const history = [
      pb('15:00', { score: 2243, preRank: 4, postRank: 2, scoreDelta: -10 }),
      pb('14:40', { map: laserStairs, score: 1163 }),
      pb('14:30', { score: 2253, preRank: 6, postRank: 4, scoreDelta: -15 }),
      pb('14:00', { score: 2268, preRank: 9, postRank: 6, scoreDelta: -12 }),
      pb('14:00', { timestamp: '2026-10-27T10:00:00', score: 2280 }),
    ]
    await renderWithProviders(<ProfileHistory history={history} game="portal2" map={null} />)
    // Portal Gun's session, Laser Stairs, then the day before's Portal Gun PB.
    const toggle = screen.getByRole('button', { name: '+2 earlier PBs' })
    const session = toggle.closest('.grid') as HTMLElement
    // From the rank before its first PB (9) to the last one's (2), the time all three took off.
    expect(session).toHaveTextContent(/^9.*2.*Portal Gun.*22\.43.*-0\.37/)
    expect(screen.getByText(/Laser Stairs/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Earlier PBs this session' })).toBeNull()

    await userEvent.click(toggle)
    const earlier = screen.getByRole('list', { name: 'Earlier PBs this session' })
    expect(
      within(earlier)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('22.53'), expect.stringContaining('22.68')])
  })
})
