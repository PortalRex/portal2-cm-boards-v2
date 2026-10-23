// @vitest-environment happy-dom
// Multipart uploads need happy-dom (see lib/api-client.upload.test.ts).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { CatalogGameRaw } from '@/lib/catalog'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { GamesEditor } from './games-editor'

const portal2 = (over: Partial<CatalogGameRaw> = {}): CatalogGameRaw => ({
  id: 1,
  name: 'Portal 2',
  slug: 'portal2',
  kind: 'game',
  base_game_id: null,
  starts_at: null,
  ends_at: null,
  sort_order: 0,
  hidden: false,
  short_name: null,
  logo_version: 3,
  background_version: null,
  mode_names: {},
  chapters: [
    {
      id: 10,
      name: 'The Courtesy Call',
      game_mode: 'sp',
      is_multiplayer: false,
      sort_order: 0,
      maps: [
        {
          steam_id: '47458',
          name: 'Portal Gun',
          bsp_name: 'sp_a1_intro3',
          default_cat_id: 1,
          source_map: null,
          sort_order: 0,
          image_version: 2,
          categories: [{ id: 1, name: 'Any%' }],
          links: [],
        },
      ],
    },
  ],
  ...over,
})

function serve() {
  const sent: { method: string; path: string; file: string | null }[] = []
  server.use(
    http.get(`${API}/catalog`, () => HttpResponse.json([portal2()])),
    http.all(`${API}/admin/*`, async ({ request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
      const image = request.method === 'POST' ? (await request.formData()).get('image') : null
      // The changes only (the editor also loads each game's webhook).
      if (request.method !== 'GET')
        sent.push({ method: request.method, path, file: image instanceof File ? image.name : null })
      return new HttpResponse(null, { status: 200 })
    }),
  )
  return sent
}

describe('game and map images', () => {
  it('uploads a background, and goes back to the built-in logo', async () => {
    const sent = serve()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await userEvent.click(await screen.findByRole('button', { name: /Portal 2/ }))
    const branding = within(screen.getByRole('region', { name: 'Logo & background' }))
    await userEvent.upload(
      branding.getByLabelText('Upload background'),
      new File(['png'], 'bg.png', { type: 'image/png' }),
    )
    await userEvent.click(branding.getByRole('button', { name: 'Use the built-in logo' }))
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent).toEqual([
      { method: 'POST', path: '/admin/games/1/images/background', file: 'bg.png' },
      { method: 'DELETE', path: '/admin/games/1/images/logo', file: null },
    ])
  })

  it('replaces a map’s image, or goes back to its built-in one', async () => {
    const sent = serve()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await userEvent.click(await screen.findByRole('button', { name: /Portal 2/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Portal Gun' }))
    const editor = within(screen.getByRole('region', { name: 'Edit Portal Gun' }))
    await userEvent.upload(
      editor.getByLabelText('Replace image'),
      new File(['jpg'], 'gun.jpg', { type: 'image/jpeg' }),
    )
    await userEvent.click(editor.getByRole('button', { name: 'Use the built-in image' }))
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent).toEqual([
      { method: 'POST', path: '/admin/maps/47458/image', file: 'gun.jpg' },
      { method: 'DELETE', path: '/admin/maps/47458/image', file: null },
    ])
  })
})
