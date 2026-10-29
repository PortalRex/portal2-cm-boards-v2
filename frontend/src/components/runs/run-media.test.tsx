import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AUTORENDER } from '@/testing/mocks/handlers'
import { renderWithProviders } from '@/testing/test-utils'
import { AutorenderLink, CommentButton, DemoLink, RunVideo, YouTubeLink } from './run-media'

const STORAGE = 'https://portal2.fsn1.your-objectstorage.com'

describe('run media links', () => {
  it('links a rendered video, offers a render for a run with a demo, and greys out the rest', async () => {
    const { unmount } = await renderWithProviders(
      <>
        <AutorenderLink run={{ id: 1, autorenderId: 'abcdefghijk' }} />
        <AutorenderLink run={{ id: 2, demoId: 9 }} />
        <AutorenderLink run={{ id: 3 }} />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Watch autorender' })).toHaveAttribute(
      'href',
      `${AUTORENDER}/videos/abcdefghijk`,
    )
    expect(screen.getByRole('link', { name: 'Request an autorender' })).toHaveAttribute(
      'href',
      `${AUTORENDER}/render/portal2/2`,
    )
    expect(screen.getByRole('img', { name: 'No autorender' })).toBeInTheDocument()
    unmount()
  })

  it('uses a share id autorender reported since (the rendered set)', async () => {
    await renderWithProviders(<AutorenderLink run={{ id: 5 }} rendered={new Map([[5, 'zzzzzzzzzzz']])} />)
    expect(screen.getByRole('link', { name: 'Watch autorender' })).toHaveAttribute(
      'href',
      `${AUTORENDER}/videos/zzzzzzzzzzz`,
    )
  })

  it('links YouTube without the start time, and the demo download', async () => {
    await renderWithProviders(
      <>
        <YouTubeLink id="abc123?start=30" />
        <YouTubeLink id={null} />
        <DemoLink demoId={44} />
        <DemoLink demoId={null} />
        <DemoLink demoId={null} hideMissing />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc123',
    )
    expect(screen.getByRole('img', { name: 'No video' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download demo' })).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/demos/44/file',
    )
    expect(screen.getAllByRole('img', { name: 'No demo' })).toHaveLength(1)
  })

  it('shows a comment in a bubble, closed by a click elsewhere', async () => {
    await renderWithProviders(
      <>
        <CommentButton note="Finally got the cube boost" />
        <CommentButton note={null} />
        <p>elsewhere</p>
      </>,
    )
    expect(screen.getByRole('img', { name: 'No comment' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show comment' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Finally got the cube boost')
    await userEvent.click(screen.getByText('elsewhere'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('RunVideo', () => {
  it('plays an autorender video from object storage first, then from autorender', async () => {
    const { container } = await renderWithProviders(<RunVideo run={{ id: 1, autorenderId: 'abcdefghijk' }} />)
    const sources = [...container.querySelectorAll('source')].map((s) => s.getAttribute('src'))
    expect(sources).toEqual([`${STORAGE}/abcdefghijk.mp4`, `${AUTORENDER}/storage/videos/abcdefghijk`])
    expect(screen.getByRole('link', { name: 'Autorender' })).toHaveAttribute(
      'href',
      `${AUTORENDER}/videos/abcdefghijk`,
    )
  })

  it('says so when neither source plays, linking the autorender page', async () => {
    const { container } = await renderWithProviders(<RunVideo run={{ id: 1, autorenderId: 'abcdefghijk' }} />)
    const sources = container.querySelectorAll('source')
    // Only the last source failing means there is no video.
    fireEvent.error(sources[0]!)
    expect(container.querySelector('video')).not.toBeNull()
    fireEvent.error(sources[1]!)
    expect(await screen.findByText('The video couldn’t be played here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Watch on autorender' })).toBeInTheDocument()
  })

  it('falls back to YouTube, then to a render request or "No video"', async () => {
    const { unmount } = await renderWithProviders(<RunVideo run={{ id: 2, youtubeId: 'abc123?start=4' }} />)
    expect(screen.getByTitle('YouTube video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abc123?start=4',
    )
    unmount()
    const second = await renderWithProviders(<RunVideo run={{ id: 3, demoId: 7 }} />)
    expect(screen.getByRole('link', { name: 'Request an autorender' })).toHaveAttribute(
      'href',
      `${AUTORENDER}/render/portal2/3`,
    )
    second.unmount()
    await renderWithProviders(<RunVideo run={{ id: 4 }} game="mel" />)
    expect(screen.getByText('No video')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
