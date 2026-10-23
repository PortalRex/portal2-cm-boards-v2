import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { CatalogGameRaw, CatalogMapRaw } from '@/lib/catalog'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { GamesEditor } from './games-editor'

const map = (steam_id: string, name: string, over: Partial<CatalogMapRaw> = {}): CatalogMapRaw => ({
  steam_id,
  name,
  bsp_name: null,
  default_cat_id: 1,
  source_map: null,
  sort_order: 0,
  image_version: null,
  categories: [{ id: 1, name: 'Any%' }],
  links: [],
  ...over,
})

const game = (over: Partial<CatalogGameRaw>): CatalogGameRaw => ({
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
  logo_version: null,
  background_version: null,
  mode_names: {},
  chapters: [],
  ...over,
})

const catalog = (): CatalogGameRaw[] => [
  game({
    chapters: [
      {
        id: 10,
        name: 'The Courtesy Call',
        game_mode: 'sp',
        is_multiplayer: false,
        sort_order: 0,
        maps: [map('47458', 'Portal Gun')],
      },
      {
        id: 11,
        name: 'The Cold Boot',
        game_mode: 'sp',
        is_multiplayer: false,
        sort_order: 1,
        maps: [map('47455', 'Laser Stairs')],
      },
      {
        id: 12,
        name: 'Team Building',
        game_mode: 'coop',
        is_multiplayer: true,
        sort_order: 2,
        maps: [map('47741', 'Doors')],
      },
    ],
  }),
  game({
    id: 3,
    name: 'Speedrun Mod',
    slug: 'srm',
    hidden: true,
    mode_names: { sp: 'Main Board', bonus: 'Bonus' },
    chapters: [
      {
        id: 20,
        name: 'Act 1',
        game_mode: 'sp',
        is_multiplayer: false,
        sort_order: 0,
        maps: [map('srm-1', 'Portal Gun SRM', { bsp_name: 'sp_a1_intro3', links: ['47458'] })],
      },
      { id: 21, name: 'Empty', game_mode: 'sp', is_multiplayer: false, sort_order: 1, maps: [] },
    ],
  }),
  game({
    id: 4,
    name: 'Season 1',
    slug: 'season-1',
    kind: 'season',
    base_game_id: 1,
    starts_at: '2026-10-01T00:00:00',
    chapters: [],
  }),
]

/** Serves the catalog and records every change the editor sends (method, path, body; not GETs). */
function serveEditor(
  answer: (method: string, path: string, body: unknown) => Response | undefined = () => undefined,
) {
  let fetches = 0
  const sent: { method: string; path: string; body: unknown }[] = []
  server.use(
    http.get(`${API}/catalog`, () => {
      fetches++
      return HttpResponse.json(catalog())
    }),
    http.all(`${API}/admin/*`, async ({ request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
      const body = await request.json().catch(() => null)
      if (request.method !== 'GET') sent.push({ method: request.method, path, body })
      return answer(request.method, path, body) ?? HttpResponse.json({ id: 99 })
    }),
  )
  return { sent, fetches: () => fetches }
}

const pick = async (name: string) =>
  userEvent.click(
    within(await screen.findByRole('complementary', { name: 'Games' })).getByRole('button', {
      name: new RegExp(name),
    }),
  )

describe('the games editor', () => {
  it('lists games and seasons, and opens one', async () => {
    serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    const list = within(await screen.findByRole('complementary', { name: 'Games' }))
    expect(list.getByRole('button', { name: /Speedrun Mod\s*Game · hidden/ })).toBeInTheDocument()
    expect(list.getByRole('button', { name: /Season 1\s*Season/ })).toBeInTheDocument()
    expect(screen.getByText('Pick a game, or create a game or season.')).toBeInTheDocument()
    await pick('Speedrun Mod')
    expect(screen.getByRole('form', { name: 'Speedrun Mod' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Link name' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete game' })).toBeInTheDocument()
  })

  it('keeps Portal 2’s link name and doesn’t offer to delete it', async () => {
    serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Portal 2')
    expect(screen.getByRole('textbox', { name: 'Link name' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete game' })).toBeNull()
  })

  it('creates a game with a link name made from its name, then opens it', async () => {
    const { sent, fetches } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await userEvent.click(await screen.findByRole('button', { name: '+ New game' }))
    const form = screen.getByRole('form', { name: 'New game' })
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Portal Reloaded')
    expect(within(form).getByRole('textbox', { name: 'Link name' })).toHaveValue('portal-reloaded')
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(sent).toEqual([
        { method: 'POST', path: '/admin/games', body: { name: 'Portal Reloaded', slug: 'portal-reloaded' } },
      ]),
    )
    await waitFor(() => expect(fetches()).toBe(2))
  })

  it('creates a season from a game’s maps, with its dates and links', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await userEvent.click(await screen.findByRole('button', { name: '+ New season' }))
    const form = screen.getByRole('form', { name: 'New season' })
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Season 2')
    fireEvent.change(within(form).getByLabelText('Starts (UTC)'), { target: { value: '2026-11-01T00:00' } })
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Map pool from' }), '3')
    expect(
      within(form).getByRole('checkbox', { name: /Link the season's maps to Speedrun Mod/ }),
    ).toBeChecked()
    await userEvent.click(within(form).getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(sent[0]?.body).toEqual({
        name: 'Season 2',
        slug: 'season-2',
        base_game_id: 3,
        starts_at: '2026-11-01T00:00:00',
        ends_at: null,
        link_to_base: true,
      }),
    )
  })

  it('saves only what changed, hides a game, and deletes on a second click', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    const form = within(screen.getByRole('form', { name: 'Speedrun Mod' }))
    await userEvent.type(form.getByRole('textbox', { name: 'Header name' }), ' SRM ')
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show on the site' }))
    const del = screen.getByRole('button', { name: 'Delete game' })
    await userEvent.click(del)
    expect(del).toHaveTextContent('Click again to delete')
    await userEvent.click(del)
    await waitFor(() => expect(sent).toHaveLength(3))
    expect(sent).toEqual([
      { method: 'PUT', path: '/admin/games/3', body: { short_name: 'SRM' } },
      { method: 'PUT', path: '/admin/games/3', body: { hidden: false } },
      { method: 'DELETE', path: '/admin/games/3', body: null },
    ])
    expect(await screen.findByText('Pick a game, or create a game or season.')).toBeInTheDocument()
  })

  it('shows the server’s reason when a change is refused', async () => {
    serveEditor((method) =>
      method === 'PUT' ? new HttpResponse('That link name is taken.', { status: 400 }) : undefined,
    )
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    const slug = screen.getByRole('textbox', { name: 'Link name' })
    await userEvent.clear(slug)
    await userEvent.type(slug, 'portal2')
    await userEvent.click(
      within(screen.getByRole('form', { name: 'Speedrun Mod' })).getByRole('button', { name: 'Save' }),
    )
    expect(await screen.findByText('That link name is taken.')).toBeInTheDocument()
  })
})

describe('game modes', () => {
  it('renames a mode, and adds one with a key made from its name', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    // A named mode without chapters can be removed; one with chapters reset.
    const bonus = screen.getByRole('textbox', { name: 'Name for bonus' }).closest('form')!
    expect(within(bonus).getByText('no chapters yet')).toBeInTheDocument()
    expect(within(bonus).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    const sp = screen.getByRole('textbox', { name: 'Name for sp' })
    expect(within(sp.closest('form')!).getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.clear(sp)
    await userEvent.type(sp, 'Story')
    await userEvent.click(within(sp.closest('form')!).getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Add mode' }))
    const add = screen.getByRole('form', { name: 'Add mode' })
    await userEvent.type(within(add).getByRole('textbox', { name: 'Mode name' }), 'Bonus')
    expect(within(add).getByText('This game already has a mode with that key.')).toBeInTheDocument()
    expect(within(add).getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(within(add).getByRole('textbox', { name: 'Mode name' }), ' Plus')
    expect(within(add).getByRole('textbox', { name: 'Mode key' })).toHaveValue('bonus_plus')
    await userEvent.click(within(add).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent.map((s) => s.body)).toEqual([
      { mode_name: { mode: 'sp', name: 'Story' } },
      { mode_name: { mode: 'bonus_plus', name: 'Bonus Plus' } },
    ])
  })
})

describe('linked leaderboards', () => {
  it('counts links per game, unlinks them all, and links matching maps', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    expect(screen.getByText('1 maps')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unlink all' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Game to link' }), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Link matching maps' }))
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent).toEqual([
      { method: 'DELETE', path: '/admin/games/3/links/1', body: null },
      { method: 'POST', path: '/admin/games/3/links', body: { game_id: 4 } },
    ])
  })

  it('shows a season’s copied maps read-only', async () => {
    serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Season 1')
    expect(screen.getByText('Season of Portal 2')).toBeInTheDocument()
    expect(screen.getByText(/0 maps in 0 chapters, copied from Portal 2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull()
  })
})

describe('chapters and maps', () => {
  it('reorders chapters and moves maps locally, then saves the layout (or undoes it)', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Portal 2')
    const save = screen.getByRole('button', { name: 'Save layout' })
    expect(save).toBeDisabled()
    await userEvent.click(
      within(screen.getByRole('group', { name: 'The Courtesy Call' })).getByRole('button', {
        name: 'Move chapter down',
      }),
    )
    // Drag Portal Gun onto Laser Stairs (into The Cold Boot, before it).
    const gun = screen.getByRole('button', { name: 'Portal Gun' })
    fireEvent.dragStart(gun, { dataTransfer: { effectAllowed: '' } })
    fireEvent.drop(screen.getByRole('button', { name: 'Laser Stairs' }))
    // A single player map can't go into a co-op chapter.
    fireEvent.dragStart(screen.getByRole('button', { name: 'Laser Stairs' }), {
      dataTransfer: { effectAllowed: '' },
    })
    fireEvent.drop(screen.getByRole('group', { name: 'Team Building' }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo changes' }))
    expect(save).toBeDisabled()
    await userEvent.click(
      within(screen.getByRole('group', { name: 'The Courtesy Call' })).getByRole('button', {
        name: 'Move chapter down',
      }),
    )
    fireEvent.dragStart(screen.getByRole('button', { name: 'Portal Gun' }), {
      dataTransfer: { effectAllowed: '' },
    })
    fireEvent.drop(screen.getByRole('button', { name: 'Laser Stairs' }))
    await userEvent.click(save)
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({
      method: 'PUT',
      path: '/admin/games/1/layout',
      body: {
        chapters: [
          { id: 11, maps: ['47458', '47455'] },
          { id: 10, maps: [] },
          { id: 12, maps: ['47741'] },
        ],
      },
    })
  })

  it('renames a chapter into another mode, deletes an empty one, and adds chapters and maps', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    const act1 = within(screen.getByRole('group', { name: 'Act 1' }))
    expect(act1.queryByRole('button', { name: 'Delete' })).toBeNull()
    await userEvent.click(act1.getByRole('button', { name: 'Edit' }))
    await userEvent.selectOptions(act1.getByRole('combobox', { name: 'Mode' }), 'bonus')
    await userEvent.click(act1.getByRole('button', { name: 'Save' }))
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Empty' })).getByRole('button', { name: 'Delete' }),
    )
    await userEvent.click(act1.getByRole('button', { name: '+ Map' }))
    const addMap = screen.getByRole('form', { name: 'Add map' })
    await userEvent.type(within(addMap).getByRole('textbox', { name: 'Map name' }), 'Smooth Jazz')
    await userEvent.type(within(addMap).getByRole('textbox', { name: 'Map file' }), 'sp_a1_jazz')
    await userEvent.click(within(addMap).getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Add chapter' }))
    const addChapter = screen.getByRole('form', { name: 'Add chapter' })
    await userEvent.type(within(addChapter).getByRole('textbox', { name: 'Chapter name' }), 'Co-op')
    await userEvent.click(within(addChapter).getByRole('checkbox', { name: 'Co-op' }))
    await userEvent.click(within(addChapter).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(sent).toHaveLength(4))
    expect(sent).toEqual([
      { method: 'PUT', path: '/admin/chapters/20', body: { name: 'Act 1', game_mode: 'bonus' } },
      { method: 'DELETE', path: '/admin/chapters/21', body: null },
      {
        method: 'POST',
        path: '/admin/chapters/20/maps',
        body: { name: 'Smooth Jazz', steam_id: null, bsp_name: 'sp_a1_jazz' },
      },
      {
        method: 'POST',
        path: '/admin/games/3/chapters',
        body: { name: 'Co-op', game_mode: 'coop', is_multiplayer: true },
      },
    ])
  })

  it('edits a map: name, categories, links, and deleting it on a second click', async () => {
    const { sent } = serveEditor()
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Speedrun Mod')
    await userEvent.click(screen.getByRole('button', { name: 'Portal Gun SRM' }))
    const editor = within(screen.getByRole('region', { name: 'Edit Portal Gun SRM' }))
    expect(editor.getByText('srm-1')).toBeInTheDocument()
    expect(editor.getByText('main')).toBeInTheDocument()
    expect(editor.getByText('Portal 2 · Portal Gun')).toBeInTheDocument()
    const name = editor.getByRole('textbox', { name: 'Map name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Gun')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))
    await userEvent.type(editor.getByRole('textbox', { name: 'New category' }), 'Glitchless')
    await userEvent.click(editor.getByRole('button', { name: 'Add' }))
    await userEvent.click(editor.getByRole('button', { name: 'Unlink' }))
    // Other games' single player maps: the season has none, Portal 2's are offered.
    const options = within(editor.getByRole('combobox', { name: 'Map to link' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Link to a map…', 'Portal 2 · Laser Stairs'])
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Map to link' }), '47455')
    await userEvent.click(editor.getByRole('button', { name: 'Link' }))
    await userEvent.click(editor.getByRole('button', { name: 'Delete map' }))
    await userEvent.click(editor.getByRole('button', { name: 'Click again to delete' }))
    await waitFor(() => expect(sent).toHaveLength(5))
    expect(sent).toEqual([
      { method: 'PUT', path: '/admin/maps/srm-1', body: { name: 'Gun' } },
      { method: 'POST', path: '/admin/maps/srm-1/categories', body: { name: 'Glitchless' } },
      { method: 'DELETE', path: '/admin/maps/srm-1/links/47458', body: null },
      { method: 'POST', path: '/admin/maps/srm-1/links', body: { map: '47455' } },
      { method: 'DELETE', path: '/admin/maps/srm-1', body: null },
    ])
  })
})

describe('WR announcements', () => {
  const webhook = (url: string | null) => HttpResponse.json({ set: url != null, url })

  it("sets a game's own Discord webhook, tests it, and stops posting", async () => {
    let current: string | null = null
    const { sent } = serveEditor((method, path, body) => {
      if (path !== '/admin/games/1/webhook')
        return path === '/admin/games/1/webhook/test' ? new Response(null, { status: 204 }) : undefined
      if (method === 'PUT')
        current = (body as { url: string | null }).url ? 'https://discord.com/api/webhooks/1/…oken' : null
      return webhook(current)
    })
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Portal 2')
    const card = within(await screen.findByRole('region', { name: 'WR announcements' }))
    expect(await card.findByText('Not posting anywhere yet.')).toBeInTheDocument()
    expect(card.queryByRole('button', { name: 'Send a test' })).toBeNull()
    await userEvent.type(
      card.getByRole('textbox', { name: 'Discord webhook' }),
      'https://discord.com/api/webhooks/1/token',
    )
    await userEvent.click(card.getByRole('button', { name: 'Save' }))
    expect(await card.findByText('https://discord.com/api/webhooks/1/…oken')).toBeInTheDocument()
    await userEvent.click(card.getByRole('button', { name: 'Send a test' }))
    expect(await card.findByRole('status')).toHaveTextContent('Test message sent.')
    await userEvent.click(card.getByRole('button', { name: 'Stop posting' }))
    expect(await card.findByText('Not posting anywhere yet.')).toBeInTheDocument()
    expect(sent.filter((s) => s.path.startsWith('/admin/games/1/webhook') && s.method !== 'GET')).toEqual([
      {
        method: 'PUT',
        path: '/admin/games/1/webhook',
        body: { url: 'https://discord.com/api/webhooks/1/token' },
      },
      { method: 'POST', path: '/admin/games/1/webhook/test', body: null },
      { method: 'PUT', path: '/admin/games/1/webhook', body: { url: null } },
    ])
  })

  it('shows why a webhook was refused', async () => {
    serveEditor((method, path) =>
      path === '/admin/games/1/webhook'
        ? method === 'PUT'
          ? new HttpResponse("That isn't a Discord webhook address.", { status: 400 })
          : webhook(null)
        : undefined,
    )
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Portal 2')
    const card = within(await screen.findByRole('region', { name: 'WR announcements' }))
    await userEvent.type(card.getByRole('textbox', { name: 'Discord webhook' }), 'https://evil.example/hook')
    await userEvent.click(card.getByRole('button', { name: 'Save' }))
    expect(await card.findByText("That isn't a Discord webhook address.")).toBeInTheDocument()
  })

  it('gives each game and season its own webhook', async () => {
    const asked: string[] = []
    serveEditor((_method, path) => {
      if (!path.endsWith('/webhook')) return undefined
      asked.push(path)
      return webhook(null)
    })
    await renderWithProviders(<GamesEditor />, { user: 'admin' })
    await pick('Portal 2')
    await screen.findByRole('region', { name: 'WR announcements' })
    const season = catalog().find((g) => g.kind === 'season')!
    await pick(season.name)
    await waitFor(() =>
      expect(asked).toEqual(['/admin/games/1/webhook', `/admin/games/${season.id}/webhook`]),
    )
  })
})
