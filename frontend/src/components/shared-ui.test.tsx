import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderWithProviders } from '@/testing/test-utils'
import { Avatar, Flag } from './avatar'
import { Page } from './layouts/page'
import { pageWindow } from '@/lib/pagination'
import { Pagination } from './pagination'
import { Card, Panel } from './panel'
import { PlayerLink } from './player-link'
import { RankChange, RankNumber } from './rank'
import { SearchBox } from './search-box'
import { Segmented } from './segmented'
import { Select } from './select'
import { EmptyState, ErrorState, Loading } from './status'
import { YouTubeEmbed } from './youtube-embed'

describe('Panel and Card', () => {
  it('shows the title, actions and body', async () => {
    await renderWithProviders(
      <Panel title="Score Updates" actions={<button>Filter</button>}>
        body
      </Panel>,
    )
    expect(screen.getByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('collapses a card and remembers it in p2cm.collapsed', async () => {
    await renderWithProviders(
      <Card title="Activity" collapseId="profile-activity">
        chart
      </Card>,
    )
    const toggle = await screen.findByRole('button', { name: /activity/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('chart')).toBeNull()
    expect(JSON.parse(localStorage.getItem('p2cm.collapsed')!)).toEqual(['profile-activity'])
  })

  it('opens collapsed if the legacy site saved it so', async () => {
    localStorage.setItem('p2cm.collapsed', '["profile-activity"]')
    await renderWithProviders(
      <Card title="Activity" collapseId="profile-activity">
        chart
      </Card>,
    )
    await screen.findByRole('button', { name: /activity/i })
    expect(screen.queryByText('chart')).toBeNull()
  })
})

describe('Pagination', () => {
  it('shows a window of four pages', () => {
    expect(pageWindow(0, 10)).toEqual({ pages: [0, 1, 2, 3], more: true })
    expect(pageWindow(5, 10)).toEqual({ pages: [4, 5, 6, 7], more: true })
    expect(pageWindow(9, 10)).toEqual({ pages: [6, 7, 8, 9], more: false })
    expect(pageWindow(0, 2)).toEqual({ pages: [0, 1], more: false })
  })

  it('moves between pages and hides with one page', async () => {
    const onChange = vi.fn()
    const { rerender } = await renderWithProviders(<Pagination page={0} pageCount={6} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: 'More pages' }))
    expect(onChange.mock.calls).toEqual([[1], [2], [4]])
    rerender(<></>)
  })

  it('renders nothing for a single page', async () => {
    await renderWithProviders(<Pagination page={0} pageCount={1} onChange={() => {}} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('form controls', () => {
  it('search box reports what is typed', async () => {
    function Box() {
      const [q, setQ] = useState('')
      return (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search players" />
          <p>q={q}</p>
        </>
      )
    }
    await renderWithProviders(<Box />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search players' }), 'zyp')
    expect(screen.getByText('q=zyp')).toBeInTheDocument()
  })

  it('select picks an option', async () => {
    const onChange = vi.fn()
    await renderWithProviders(
      <Select
        value="100"
        onChange={onChange}
        label="Rows"
        options={[
          { value: '100', label: '100' },
          { value: '200', label: '200' },
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rows' }), '200')
    expect(onChange).toHaveBeenCalledWith('200')
  })

  it('segmented switch keeps a choice', async () => {
    const onChange = vi.fn()
    await renderWithProviders(
      <Segmented
        value="sp"
        onChange={onChange}
        label="Mode"
        options={[
          { value: 'sp', label: 'Singleplayer' },
          { value: 'coop', label: 'Cooperative' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Cooperative' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Singleplayer' }))
    expect(onChange.mock.calls).toEqual([['coop']])
  })
})

describe('players', () => {
  const runner = { profileNumber: '76561198000000001', name: 'Player' }

  it('links to the profile and highlights the signed-in player', async () => {
    await renderWithProviders(<PlayerLink player={runner} />, { user: 'player' })
    const link = await screen.findByRole('link', { name: 'Player' })
    expect(link).toHaveAttribute('href', '/profile/76561198000000001')
    expect(link.className).toMatch(/font-semibold/)
  })

  it("doesn't highlight others, and doesn't link the unknown partner", async () => {
    await renderWithProviders(
      <>
        <PlayerLink player={runner} />
        <PlayerLink player={{ profileNumber: null, name: 'Unknown partner' }} />
      </>,
      { user: 'admin' },
    )
    expect((await screen.findByRole('link', { name: 'Player' })).className).not.toMatch(/font-semibold/)
    expect(screen.queryByRole('link', { name: 'Unknown partner' })).toBeNull()
    expect(screen.getByText('Unknown partner')).toBeInTheDocument()
  })

  it('shows the picture or the initial, and the flag', async () => {
    const { container } = await renderWithProviders(
      <>
        <Avatar src={null} name="zypeh" />
        <Flag code="gb" />
      </>,
    )
    expect(container).toHaveTextContent('Z')
    expect(screen.getByRole('img', { name: 'United Kingdom' })).toHaveAttribute(
      'src',
      'https://flagcdn.com/h40/gb.png',
    )
  })
})

describe('ranks', () => {
  it('shows a trophy for world records and colours other ranks', async () => {
    await renderWithProviders(
      <>
        <RankNumber rank={1} />
        <RankNumber rank={20} colored />
        <RankNumber rank={null} />
      </>,
    )
    expect(screen.getByRole('img', { name: 'World record (rank 1)' })).toBeInTheDocument()
    expect(screen.getByText('20')).toHaveStyle({ '--rank-color-dark': 'rgb(66, 255, 66)' })
    expect(screen.getByText('–')).toBeInTheDocument()
  })

  it('shows the rank before and after, glowing for a new world record', async () => {
    await renderWithProviders(<RankChange pre={30} post={1} />)
    expect(screen.getByTestId('rank-before')).toHaveTextContent('30')
    const after = screen.getByTestId('rank-after')
    expect(within(after).getByRole('img', { name: 'World record (rank 1)' })).toBeInTheDocument()
    expect(after.className).toMatch(/wr-glow/)
  })
})

describe('status and media', () => {
  it('shows loading, empty and error states', async () => {
    const retry = vi.fn()
    await renderWithProviders(
      <>
        <Loading />
        <EmptyState>No runs yet</EmptyState>
        <ErrorState error={new ApiError(500, 'Something went wrong on the server.')} onRetry={retry} />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on the server.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })

  it('embeds YouTube on the privacy-enhanced domain, keeping the start time', async () => {
    await renderWithProviders(
      <>
        <YouTubeEmbed id="-c0gaEXuKZA?start=30" />
        <YouTubeEmbed id={null} />
      </>,
    )
    expect(screen.getByTitle('YouTube video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/-c0gaEXuKZA?start=30',
    )
    expect(screen.getByText('No video')).toBeInTheDocument()
  })
})

describe('Page', () => {
  it('is 1240px wide when narrow, the full content width otherwise', async () => {
    const { unmount } = await renderWithProviders(<Page narrow>Narrow</Page>)
    const narrow = screen.getByRole('main')
    expect(narrow).toHaveClass('max-w-[1240px]')
    expect(narrow).not.toHaveClass('max-w-content')
    unmount()
    await renderWithProviders(<Page>Wide</Page>)
    expect(screen.getByRole('main')).toHaveClass('max-w-content')
  })
})
