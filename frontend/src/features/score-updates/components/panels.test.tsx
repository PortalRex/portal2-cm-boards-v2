import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import { sampleActivity, sampleDaily, sampleWeeklyRecap } from '@/testing/data/sample'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { ActivityPanel } from './activity-panel'
import { RecapPanel } from './recap-panel'

const recapPanel = () =>
  screen.getByRole('heading', { name: /weekly recap|daily chambers|following/i }).closest('section')!

describe('RecapPanel', () => {
  it("shows the week's top runs, paging back through earlier weeks", async () => {
    const weeks: string[] = []
    server.use(
      http.get(`${API}/recap/weekly`, ({ request }) => {
        const week = new URL(request.url).searchParams.get('week')!
        weeks.push(week)
        return HttpResponse.json(sampleWeeklyRecap('portal2', week))
      }),
    )
    await renderWithProviders(<RecapPanel game="portal2" />)
    expect(await within(recapPanel()).findAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(() => expect(new Set(weeks).size).toBe(2))
    // Seven days earlier, and the label names that week once it has loaded.
    const [thisWeek, lastWeek] = [...new Set(weeks)]
    expect(Date.parse(thisWeek!) - Date.parse(lastWeek!)).toBe(7 * 86400000)
    await waitFor(() => expect(screen.queryByText('This week')).toBeNull())
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled()
  })

  it("says when the week has no runs, and sends the game's id", async () => {
    let gameId: string | null = null
    server.use(
      http.get(`${API}/recap/weekly`, ({ request }) => {
        gameId = new URL(request.url).searchParams.get('game_id')
        return HttpResponse.json({ start: '2026-10-12', end: '2026-10-19', runs: [] })
      }),
    )
    await renderWithProviders(<RecapPanel game="mel" />)
    expect(await screen.findByText('No runs this week yet.')).toBeInTheDocument()
    expect(gameId).toBe('2')
  })

  it('shows the daily chambers with their top three and how many more', async () => {
    const daily = sampleDaily('portal2', '2026-10-17')
    const chamber = daily.chambers[0]!
    chamber.runs = (changelog as typeof chamber.runs).slice(0, 5)
    daily.chambers[1]!.runs = []
    server.use(http.get(`${API}/daily`, () => HttpResponse.json(daily)))
    await renderWithProviders(<RecapPanel game="portal2" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }))
    expect(await screen.findByRole('heading', { name: 'Daily Chambers' })).toBeInTheDocument()
    expect(await screen.findByText('Singleplayer')).toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
    expect(screen.getByText('No times yet today. Be the first!')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('asks you to follow players, then lists their latest runs', async () => {
    await renderWithProviders(<RecapPanel game="portal2" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Following' }))
    expect(
      screen.getByText('Follow players from their profile to see their latest runs here.'),
    ).toBeInTheDocument()
  })

  it('lists followed players’ runs from both games, newest first', async () => {
    const first = changelog[0]!
    localStorage.setItem(
      'p2cm.follows',
      JSON.stringify([{ profileNumber: first.profile_number, name: first.user_name, avatar: null }]),
    )
    const asked: string[] = []
    server.use(
      http.get(`${API}/changelog`, ({ request }) => {
        const url = new URL(request.url)
        asked.push(url.searchParams.get('game_id') ?? 'portal2')
        return HttpResponse.json(url.searchParams.get('game_id') ? [] : [first])
      }),
    )
    await renderWithProviders(<RecapPanel game="portal2" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Following' }))
    expect(await within(recapPanel()).findByRole('link', { name: first.user_name })).toBeInTheDocument()
    expect(asked.sort()).toEqual(['2', 'portal2'])
  })
})

describe('ActivityPanel', () => {
  it('charts submissions by month, year or all time', async () => {
    let params: URLSearchParams | null = null
    server.use(
      http.get(`${API}/graph`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(sampleActivity())
      }),
    )
    await renderWithProviders(<ActivityPanel game="portal2" />)
    expect(await screen.findByRole('heading', { name: 'Daily Activity' })).toBeInTheDocument()
    expect(params!.get('tz')).toBeTruthy()
    // Portal 2 is the server's default game.
    expect(params!.get('game_id')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Year' }))
    expect(screen.getByRole('heading', { name: 'Weekly Activity' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.getByRole('heading', { name: 'Monthly Activity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /previous/i })).toBeNull()
  })

  it("counts only the picked game's runs, as the recap does", async () => {
    let gameId: string | null = null
    server.use(
      http.get(`${API}/graph`, ({ request }) => {
        gameId = new URL(request.url).searchParams.get('game_id')
        return HttpResponse.json(sampleActivity())
      }),
    )
    await renderWithProviders(<ActivityPanel game="mel" />)
    expect(await screen.findByRole('heading', { name: 'Daily Activity' })).toBeInTheDocument()
    expect(gameId).toBe('2')
  })

  it('shows an error state when the graph fails', async () => {
    server.use(http.get(`${API}/graph`, () => new HttpResponse(null, { status: 500 })))
    await renderWithProviders(<ActivityPanel game="portal2" />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
