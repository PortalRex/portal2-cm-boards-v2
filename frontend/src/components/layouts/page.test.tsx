import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/testing/test-utils'
import { Page } from './page'

const mapPicture = 'https://example.test/map.jpg'
const background = () => screen.getByTestId('page-background')

describe('Page background', () => {
  it("shows the page's own picture, tinted", async () => {
    await renderWithProviders(
      <Page background={mapPicture} tint="mono">
        x
      </Page>,
    )
    expect(background().style.backgroundImage).toContain(mapPicture)
    expect(background().className).toContain('bg-blend-luminosity')
  })

  it("puts a preset chosen in Settings in place of the page's own, in colour", async () => {
    localStorage.setItem('p2cm.background', 'crt')
    await renderWithProviders(
      <Page background={mapPicture} tint="mono" blur>
        x
      </Page>,
    )
    expect(background().style.backgroundImage).toBe('')
    expect(background()).toHaveAttribute('data-backdrop', 'crt')
    // The scene is drawn inside it.
    expect(background().querySelector('.crt-screen')).not.toBeNull()
    expect(background().className).not.toContain('bg-blend-luminosity')
    expect(background().className).not.toContain('blur-')
  })

  it('puts a chosen Imgur picture there, and ignores an address from anywhere else', async () => {
    localStorage.setItem('p2cm.background', 'https://i.imgur.com/AbCd123.png')
    const { unmount } = await renderWithProviders(<Page background={mapPicture}>x</Page>)
    expect(background().style.backgroundImage).toContain('https://i.imgur.com/AbCd123.png')
    unmount()
    localStorage.setItem('p2cm.background', 'https://evil.example/me.png')
    await renderWithProviders(<Page background={mapPicture}>x</Page>)
    expect(background().style.backgroundImage).toContain(mapPicture)
  })
})
