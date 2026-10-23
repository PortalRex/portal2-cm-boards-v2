import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { adaptChangelog } from '@/lib/adapters/runs'
import { BUILTIN_CATALOG } from '@/lib/catalog'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { renderWithProviders } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'
import { AllTimes } from './all-times'

const history = (changelog as ChangelogRaw[]).map((r) => adaptChangelog(r, 'portal2', BUILTIN_CATALOG))
const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('AllTimes', () => {
  it('lists every time, newest first, each opening its run page', async () => {
    await renderWithProviders(<AllTimes runs={history} />)
    expect(screen.getByText(`${history.length} times`)).toBeInTheDocument()
    const first = rows()[0]!
    const newest = [...history]
      .filter((h) => h.timestamp)
      .sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!))[0]!
    expect(within(first).getByRole('link', { name: newest.map.title })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/map\//),
    )
    expect(within(first).getByTitle('Open this run')).toHaveAttribute('href', `/run/${newest.id}`)
  })

  it('sorts oldest first', async () => {
    await renderWithProviders(<AllTimes runs={history} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'oldest')
    const oldest = [...history]
      .filter((h) => h.timestamp)
      .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!))[0]!
    expect(within(rows()[0]!).getByTitle('Open this run')).toHaveAttribute('href', `/run/${oldest.id}`)
  })

  it('filters by map name and by co-op', async () => {
    await renderWithProviders(<AllTimes runs={history} />)
    const title = history[0]!.map.title
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter by map' }), title)
    const matching = history.filter((h) => h.map.title.toLowerCase().includes(title.toLowerCase())).length
    expect(rows()).toHaveLength(Math.min(matching, 50))
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Filter by map' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Co-op' }))
    const coop = history.filter((h) => BUILTIN_CATALOG.multiplayerModes.has(h.map.mode)).length
    expect(screen.getByText(`${coop} ${coop === 1 ? 'time' : 'times'}`)).toBeInTheDocument()
  })

  it('pages through long lists, 50 at a time', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...history[0]!, id: 100000 + i }))
    await renderWithProviders(<AllTimes runs={many} />)
    expect(rows()).toHaveLength(50)
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })

  it('starts the next page at the top of the list when paging from below it', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...history[0]!, id: 100000 + i }))
    await renderWithProviders(<AllTimes runs={many} />)
    const list = screen.getByRole('heading', { name: 'All times' }).closest('section')!
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: -800 } as DOMRect)
    const scroll = vi.spyOn(list, 'scrollIntoView')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(rows()[0]!).getByTitle('Open this run')).toHaveAttribute('href', '/run/100069')
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  })

  it('says so without times', async () => {
    await renderWithProviders(<AllTimes runs={[]} />)
    expect(screen.getByText('No times yet.')).toBeInTheDocument()
  })
})
