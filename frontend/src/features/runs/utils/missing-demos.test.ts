import { describe, expect, it } from 'vitest'
import type { CoopHalf } from '@/types/runs'
import { waitingForDemos } from './missing-demos'

const half = (name: string | null, demoId: number | null): CoopHalf => ({
  player: name ? { profileNumber: name, name, avatar: null } : null,
  isHost: null,
  changelogId: 1,
  score: 1000,
  timestamp: null,
  note: null,
  youtubeId: null,
  autorenderId: null,
  demoId,
  hasSegments: false,
  portals: null,
  sarVersion: null,
})

describe('waitingForDemos', () => {
  it('names the player whose demo a co-op run still needs', () => {
    expect(waitingForDemos([half('Lambo', 5), half('Luke', null)])).toBe('Pending: waiting for Luke’s demo')
    expect(waitingForDemos([half('Lambo', 5), half(null, null)])).toBe(
      'Pending: waiting for their partner’s demo',
    )
  })

  it('says when both are missing, and nothing when neither is', () => {
    expect(waitingForDemos([half('Lambo', null), half('Luke', null)])).toBe(
      'Pending: waiting for both players’ demos',
    )
    expect(waitingForDemos([half('Lambo', 5), half('Luke', 6)])).toBeNull()
  })
})
