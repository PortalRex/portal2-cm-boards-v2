import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { countryById } from '@/lib/data/countries'
import countries from '@/testing/fixtures/countries-overall.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

function serveCountries() {
  const boards: string[] = []
  server.use(
    http.get(`${API}/countries/stats`, ({ request }) => {
      const board = new URL(request.url).searchParams.get('board') ?? ''
      boards.push(board)
      return HttpResponse.json(board === 'coop' ? [] : countries)
    }),
  )
  return boards
}

describe('Countries', () => {
  it('lists countries with their players, points and best players, linking to their boards', async () => {
    serveCountries()
    await renderRoute('/stats/countries')
    const first = countryById(countries[0]!.country_id)!
    const table = await screen.findByRole('table', { name: 'Countries' })
    const link = within(table)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === `/leaderboard/overall?country=${first.code}`)!
    expect(link).toHaveTextContent(first.name)
    const players = countries.reduce((n, c) => n + c.players, 0)
    expect(
      screen.getByText(`${players} ranked players across 4 countries. Set yours in`, { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/more/settings')
    const row = link.closest('[role=row]') as HTMLElement
    expect(within(row).getByRole('link', { name: 'Bexc' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Countries' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches board (not kept in the address, as legacy)', async () => {
    const boards = serveCountries()
    const { router } = await renderRoute('/stats/countries')
    await screen.findByRole('table', { name: 'Countries' })
    await userEvent.click(screen.getByRole('radio', { name: 'Cooperative' }))
    expect(await screen.findByText('No countries yet.')).toBeInTheDocument()
    expect(screen.getByText(/No one has set a country yet/)).toBeInTheDocument()
    await waitFor(() => expect(boards).toEqual(['overall', 'coop']))
    expect(router.state.location.search).toEqual({})
  })
})
