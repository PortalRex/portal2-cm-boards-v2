import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import coopPreviews from '@/testing/fixtures/coop-previews.json'
import spPreviews from '@/testing/fixtures/sp-previews.json'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

function servePreviews() {
  const asked: string[] = []
  server.use(
    http.get(`${API}/sp`, ({ request }) => {
      asked.push(`sp ${new URL(request.url).searchParams.get('game_id') ?? ''}`)
      return HttpResponse.json(spPreviews)
    }),
    http.get(`${API}/coop`, ({ request }) => {
      asked.push(`coop ${new URL(request.url).searchParams.get('game_id') ?? ''}`)
      return HttpResponse.json(coopPreviews)
    }),
  )
  return asked
}

const card = async (title: string) =>
  (await screen.findByRole('heading', { name: title, level: 3 })).closest('article') as HTMLElement

describe('Map list', () => {
  it("lists Portal 2's single player chapters with each map's world record and next six times", async () => {
    const asked = servePreviews()
    await renderRoute('/maps')
    expect(await screen.findByRole('heading', { name: 'The Courtesy Call' })).toBeInTheDocument()
    expect(screen.getByText('Chapter 01')).toBeInTheDocument()
    const first = spPreviews[0]!
    const c = await card('Container Ride')
    expect(await within(c).findByRole('link', { name: first[0]!.user_name })).toBeInTheDocument()
    expect(within(c).getAllByRole('listitem')).toHaveLength(6)
    expect(within(c).getByRole('link', { name: 'Container Ride' })).toHaveAttribute('href', '/map/sp/62761')
    expect(asked).toEqual(['sp '])
  })

  it('offers the demo of each run that has one, as the old boards did', async () => {
    const [ride, ...others] = spPreviews
    const withDemos = ride!.map((r, i) => ({ ...r, demo_id: i === 0 ? 901 : i === 2 ? 903 : null }))
    server.use(http.get(`${API}/sp`, () => HttpResponse.json([withDemos, ...others])))
    await renderRoute('/maps')
    const c = await card('Container Ride')
    await within(c).findByRole('link', { name: ride![0]!.user_name })
    const demos = within(c).getAllByRole('link', { name: 'Download demo' })
    expect(demos.map((a) => a.getAttribute('href'))).toEqual([
      expect.stringMatching(/\/demos\/901\/file$/),
      expect.stringMatching(/\/demos\/903\/file$/),
    ])
  })

  it('leaves the record row empty for a map without previews, like legacy', async () => {
    servePreviews()
    await renderRoute('/maps')
    await screen.findAllByRole('link', { name: spPreviews[0]![0]!.user_name })
    // The fixture only has previews for the first two maps.
    const c = await card('Smooth Jazz')
    expect(within(c).queryAllByRole('listitem')).toHaveLength(0)
    expect(within(c).queryByText('No scores yet')).toBeNull()
  })

  it('switches to the co-op courses, keeping the mode in the address', async () => {
    const asked = servePreviews()
    const { router } = await renderRoute('/maps')
    await userEvent.click(await screen.findByRole('radio', { name: 'Cooperative' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ mode: 'coop' }))
    expect(await screen.findByText('Course 01')).toBeInTheDocument()
    expect(asked).toContain('coop ')
  })

  it("picks a season and shows that season's copies of the maps", async () => {
    servePreviews()
    const { router } = await renderRoute('/maps')
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Season' }),
      'portal-2-season-1',
    )
    await waitFor(() => expect(router.state.location.search).toEqual({ season: 'portal-2-season-1' }))
    expect((await card('Container Ride')).querySelector('a')).toHaveAttribute(
      'href',
      '/map/sp/62761?season=portal-2-season-1',
    )
  })

  it("asks for Mel's boards with its game id", async () => {
    localStorage.setItem('p2cm.game', 'mel')
    const asked = servePreviews()
    await renderRoute('/maps')
    expect(await screen.findByRole('radio', { name: 'Story Mode' })).toBeInTheDocument()
    await waitFor(() => expect(asked).toContain('sp 2'))
    // Mel has no seasons.
    expect(screen.queryByRole('combobox', { name: 'Season' })).toBeNull()
  })

  it('highlights the signed-in player in the cards', async () => {
    const first = spPreviews[0]!
    servePreviews()
    await renderRoute('/maps', { user: { ...users.player, profile_number: first[0]!.profile_number } })
    const link = await within(await card('Container Ride')).findByRole('link', { name: first[0]!.user_name })
    expect(link.className).toMatch(/font-semibold/)
    expect(link.closest('div')!.parentElement!.className).toMatch(/me-row/)
  })

  it('shows an error state when the previews fail', async () => {
    server.use(http.get(`${API}/sp`, () => new HttpResponse(null, { status: 500 })))
    await renderRoute('/maps')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
