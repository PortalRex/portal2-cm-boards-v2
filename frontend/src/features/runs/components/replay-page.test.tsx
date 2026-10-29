import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import changelog from '@/testing/fixtures/changelog.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'

// Laser Relays is 47759.
describe('Replay page', () => {
  let was = false
  beforeEach(() => {
    was = env.VITE_VIEWER
    env.VITE_VIEWER = true
  })
  afterEach(() => {
    env.VITE_VIEWER = was
  })

  it('plays the runs in the demo viewer under the map and what is raced', async () => {
    await renderRoute('/replay?demo=7&with=9&race=1,2&map=47759&what=top')
    expect(await screen.findByRole('heading', { name: 'Laser Relays', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Laser Relays' })).toHaveAttribute('href', '/map/sp/47759')
    expect(screen.getByText('The top 3 raced')).toBeInTheDocument()
    expect(screen.getByTitle('Laser Relays replay')).toHaveAttribute(
      'src',
      '/viewer/?embed=full#board=7&with=9&race=1,2',
    )
  })

  it("names a run's players and time, linking to its details", async () => {
    const run = { ...(changelog as ChangelogRaw[])[0]!, score: 1234, post_rank: 2 }
    server.use(http.get(`${API}/changelog/:id`, () => HttpResponse.json(run)))
    await renderRoute(`/replay?demo=7&run=${run.id}`)
    expect(await screen.findByText('12.34 · rank 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: run.user_name })).toHaveAttribute(
      'href',
      `/profile/${run.profile_number}`,
    )
    expect(screen.getByRole('link', { name: 'Run details' })).toHaveAttribute('href', `/run/${run.id}`)
  })

  it('says so without a run, or without the demo viewer', async () => {
    const { unmount } = await renderRoute('/replay')
    expect(await screen.findByText('No run to replay.')).toBeInTheDocument()
    unmount()
    env.VITE_VIEWER = false
    await renderRoute('/replay?demo=7')
    expect(await screen.findByText('Replays aren’t available on this site.')).toBeInTheDocument()
  })
})
