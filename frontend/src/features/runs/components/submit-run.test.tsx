// @vitest-environment happy-dom
// Multipart uploads need happy-dom (see lib/api-client.upload.test.ts).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { DemoPreview, SubmitResult } from '../api/submissions'
import type { CoopHalf } from '@/types/runs'
import { PartnerDemo, PendingProof } from './pending-proof'
import { SubmitRun } from './submit-run'

const me = users.player.profile_number
const portalGun = {
  steam_id: '47458',
  name: 'Portal Gun',
  game_id: 1,
  game_mode: 'sp',
  is_coop: false,
  default_cat_id: 1,
}
const preview = (over: Partial<DemoPreview> = {}): DemoPreview => ({
  mapName: 'sp_a1_intro3',
  clientName: 'Player',
  timeScore: 2243,
  portalScore: 2,
  players: [{ steamId: me, name: 'Player' }],
  maps: [portalGun],
  ...over,
})
const result = (over: Partial<SubmitResult> = {}): SubmitResult => ({
  changelog_id: 500,
  map_id: '47458',
  map_name: 'Portal Gun',
  score: 2243,
  partner: null,
  boards: ['Portal 2'],
  waiting_for_partner: false,
  ...over,
})

/** Answers the preview and the submission, recording each submitted form as an object. */
function serveSubmissions(demo: DemoPreview | null = preview(), done: SubmitResult = result()) {
  const previews: string[] = []
  const sent: Record<string, string>[] = []
  server.use(
    http.post(`${API}/submissions/preview`, async ({ request }) => {
      const file = (await request.formData()).get('demo')
      previews.push(file instanceof File ? file.name : '')
      return demo
        ? HttpResponse.json(demo)
        : new HttpResponse("That file couldn't be read as a Portal 2 demo.", { status: 400 })
    }),
    http.post(`${API}/submissions`, async ({ request }) => {
      const form = await request.formData()
      sent.push(
        Object.fromEntries(
          [...form.entries()].map(([k, v]) => [k, v instanceof File ? `file:${v.name}` : v]),
        ),
      )
      return HttpResponse.json(done)
    }),
  )
  return { previews, sent }
}

const demoFile = (name = 'run.dem') => new File(['demo'], name)
const chooseDemo = (name?: string) =>
  userEvent.upload(screen.getByLabelText('Demo file'), demoFile(name), { applyAccept: false })

describe('Submit Run', () => {
  it('reads the demo, then submits it with the optional fields', async () => {
    const { previews, sent } = serveSubmissions()
    const onClose = vi.fn()
    await renderWithProviders(<SubmitRun onClose={onClose} />, { user: 'player' })
    const submit = screen.getByRole('button', { name: 'Submit' })
    expect(submit).toBeDisabled()
    await chooseDemo()
    expect(await screen.findByRole('link', { name: 'Portal Gun' })).toHaveAttribute('href', '/map/sp/47458')
    expect(screen.getByText('22.43')).toBeInTheDocument()
    expect(previews).toEqual(['run.dem'])
    await userEvent.type(
      screen.getByRole('textbox', { name: 'YouTube link (optional)' }),
      ' https://youtu.be/abc ',
    )
    await userEvent.click(submit)
    expect(await screen.findByText(/is on the boards\./)).toBeInTheDocument()
    // Blank fields are left out; players can't send the admin fields.
    expect(sent).toEqual([{ demo: 'file:run.dem', youtube: 'https://youtu.be/abc' }])
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('wants a .dem file, and shows why a demo couldn’t be read', async () => {
    const { previews } = serveSubmissions(null)
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo('notes.txt')
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a .dem file.')
    expect(previews).toEqual([])
    await chooseDemo()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That file couldn't be read as a Portal 2 demo.",
    )
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('says what is wrong with a demo it can’t submit', async () => {
    serveSubmissions(preview({ mapName: 'mp_custom', maps: [], timeScore: null }))
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo()
    expect(await screen.findByText("mp_custom isn't on the boards")).toBeInTheDocument()
    expect(screen.getByText('No finished run in this demo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('only lets players submit demos they are in', async () => {
    serveSubmissions(preview({ players: [{ steamId: '76561198000000099', name: 'Someone' }] }))
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo()
    expect(
      await screen.findByText("You aren't in this demo. You can only submit your own runs."),
    ).toBeInTheDocument()
    expect(screen.getByText('Someone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(screen.queryByText('Manual entry (admin)')).toBeNull()
  })

  it('names the co-op partner found in the demo, and says when a run waits for them', async () => {
    const coop = { ...portalGun, steam_id: '47741', name: 'Doors', game_mode: 'coop', is_coop: true }
    serveSubmissions(
      preview({
        maps: [coop],
        players: [
          { steamId: me, name: 'Player' },
          { steamId: '76561198000000099', name: 'Wheatley' },
        ],
      }),
      result({
        map_id: '47741',
        map_name: 'Doors',
        waiting_for_partner: true,
        boards: ['Portal 2', 'Season 1'],
      }),
    )
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo()
    expect(await screen.findByText('Wheatley')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText(/has been recorded\./)).toBeInTheDocument()
    expect(screen.getByText(/pending until your partner adds their demo too/)).toBeInTheDocument()
    expect(screen.getByText('Counted on: Portal 2, Season 1')).toBeInTheDocument()
    // Starts over with an empty form.
    await userEvent.click(screen.getByRole('button', { name: 'Submit another' }))
    expect(screen.getByText('Drop your demo here')).toBeInTheDocument()
  })

  it('asks which Mel board a demo is for, and sends the choice', async () => {
    const story = {
      steam_id: '5',
      name: 'Destroyed Garden',
      game_id: 2,
      game_mode: 'story',
      is_coop: false,
      default_cat_id: 1,
    }
    const advanced = { ...story, steam_id: '27', game_mode: 'advanced' }
    const { sent } = serveSubmissions(preview({ maps: [story, advanced] }))
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo()
    const boards = await screen.findByRole('group', { name: 'Mel board' })
    expect(within(boards).getByRole('button', { name: 'Story Mode' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Mel · Story Mode')).toBeInTheDocument()
    await userEvent.click(within(boards).getByRole('button', { name: 'Advanced Mode' }))
    expect(screen.getByText('Mel · Advanced Mode')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Advanced Destroyed Garden' })).toHaveAttribute(
      'href',
      '/map/advanced/27',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText(/is on the boards\./)
    expect(sent[0]).toMatchObject({ mel_mode: 'advanced' })
  })

  it('shows the server’s reason when a submission is refused', async () => {
    serveSubmissions()
    server.use(
      http.post(
        `${API}/submissions`,
        () => new HttpResponse('You already have a better time on this map.', { status: 400 }),
      ),
    )
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'player' })
    await chooseDemo()
    await screen.findByRole('link', { name: 'Portal Gun' })
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a better time on this map.')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  })
})

describe('Submit Run for admins', () => {
  it('can submit a demo for another player', async () => {
    const { sent } = serveSubmissions(
      preview({ players: [{ steamId: '76561198000000099', name: 'Someone' }] }),
    )
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'admin' })
    await chooseDemo()
    expect(
      await screen.findByText(
        "You aren't in this demo. Enter the player's SteamID below to submit it for them.",
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByText('Manual entry (admin)'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Player SteamID' }), '76561198000000099')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText(/is on the boards\./)
    expect(sent).toEqual([{ demo: 'file:run.dem', profile_number: '76561198000000099' }])
  })

  it('can enter a run by hand, without a demo', async () => {
    const { sent } = serveSubmissions()
    await renderWithProviders(<SubmitRun onClose={() => {}} />, { user: 'admin' })
    await userEvent.click(screen.getByText('Manual entry (admin)'))
    const submit = screen.getByRole('button', { name: 'Submit' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Time' }), '22.43')
    // A time alone isn't enough: the map has to come from somewhere.
    expect(submit).toBeDisabled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Map' }), '47458')
    await userEvent.click(submit)
    await screen.findByText(/is on the boards\./)
    expect(sent).toEqual([{ map_id: '47458', time: '22.43' }])
  })
})

describe('adding the demo to a pending run', () => {
  const player = { profileNumber: me, name: 'Player', avatar: null }
  const other = { profileNumber: '76561198000000099', name: 'Someone', avatar: null }
  const pending = { changelogId: 100, players: [player], verified: false, demoId: null }

  function serveDemo(verified: boolean) {
    const files: string[] = []
    server.use(
      http.post(`${API}/runs/100/demo`, async ({ request }) => {
        const file = (await request.formData()).get('demo')
        files.push(file instanceof File ? file.name : '')
        return HttpResponse.json({ verified })
      }),
    )
    return files
  }

  it('lets the player add it, and the run is verified', async () => {
    const files = serveDemo(true)
    const { container } = await renderWithProviders(<PendingProof run={pending} />, { user: 'player' })
    expect(screen.getByText('This run is pending until its demo is added.')).toBeInTheDocument()
    await userEvent.upload(container.querySelector('input[type=file]')!, demoFile())
    expect(await screen.findByText('Demo added. The run is verified.')).toBeInTheDocument()
    expect(files).toEqual(['run.dem'])
    expect(screen.queryByText('Add demo')).toBeNull()
  })

  it('keeps a co-op run pending until the partner adds theirs', async () => {
    serveDemo(false)
    const { container } = await renderWithProviders(
      <PendingProof run={{ ...pending, players: [player, other], demoId: 7 }} />,
      { user: 'player' },
    )
    expect(
      screen.getByText('This run is pending until both players have added their demo.'),
    ).toBeInTheDocument()
    await userEvent.upload(container.querySelector('input[type=file]')!, demoFile())
    expect(
      await screen.findByText('Demo added. The run stays pending until your partner adds theirs.'),
    ).toBeInTheDocument()
  })

  it('is for the run’s players and staff only, on pending runs without a demo', async () => {
    const cases = [
      { run: pending, user: null, shown: false },
      { run: { ...pending, players: [other] }, user: 'player' as const, shown: false },
      { run: { ...pending, players: [other] }, user: 'verifier' as const, shown: true },
      { run: { ...pending, verified: true }, user: 'player' as const, shown: false },
      { run: { ...pending, banned: true }, user: 'player' as const, shown: false },
      { run: { ...pending, demoId: 7 }, user: 'player' as const, shown: false },
    ]
    for (const { run, user, shown } of cases) {
      const { unmount } = await renderWithProviders(<PendingProof run={run} />, { user })
      expect(screen.queryByText('Add demo') != null).toBe(shown)
      unmount()
    }
  })

  it('tells a co-op player who has added theirs that it waits for their partner', async () => {
    const halves = [coopHalf(player, 100, 7), coopHalf(other, 101, null)]
    await renderWithProviders(
      <PendingProof run={{ ...pending, players: [player, other], demoId: 7 }} halves={halves} />,
      {
        user: 'player',
      },
    )
    expect(screen.getByText('This run is pending until your partner adds their demo.')).toBeInTheDocument()
    expect(screen.queryByText('Add demo')).toBeNull()
  })
})

const coopHalf = (
  player: CoopHalf['player'],
  changelogId: number | null,
  demoId: number | null,
): CoopHalf => ({
  player,
  isHost: null,
  changelogId,
  score: null,
  timestamp: null,
  note: null,
  youtubeId: null,
  autorenderId: null,
  demoId,
  hasSegments: false,
  portals: null,
  sarVersion: null,
})

describe('a co-op partner the run wasn’t a personal best for', () => {
  const partner = { profileNumber: me, name: 'Player', avatar: null }
  const improver = { profileNumber: '76561198000000099', name: 'Someone', avatar: null }
  // The run's own entry is the other player's; the signed-in player has no run in it.
  const run = { changelogId: 100, coopId: 7, players: [improver, partner], verified: true, demoId: 55 }
  const halves = [coopHalf(improver, 100, 55), coopHalf(partner, null, null)]

  it('can add their demo to the run', async () => {
    const files: string[] = []
    server.use(
      http.post(`${API}/runs/100/demo`, async ({ request }) => {
        const file = (await request.formData()).get('demo')
        files.push(file instanceof File ? file.name : '')
        return HttpResponse.json({ verified: true })
      }),
    )
    const { container } = await renderWithProviders(<PartnerDemo run={run} halves={halves} />, {
      user: 'player',
    })
    expect(screen.getByText(/wasn’t a personal best for you, so it has no demo of yours/)).toBeInTheDocument()
    await userEvent.upload(container.querySelector('input[type=file]')!, demoFile('mine.dem'))
    expect(await screen.findByText('Your demo was added to the run.')).toBeInTheDocument()
    expect(files).toEqual(['mine.dem'])
    expect(screen.queryByText('Add your demo')).toBeNull()
  })

  it('shows what the server says when it refuses the demo', async () => {
    server.use(
      http.post(`${API}/runs/100/demo`, () =>
        HttpResponse.text('This is your partner’s demo of the run. Add the one you recorded.', {
          status: 400,
        }),
      ),
    )
    const { container } = await renderWithProviders(<PartnerDemo run={run} halves={halves} />, {
      user: 'player',
    })
    await userEvent.upload(container.querySelector('input[type=file]')!, demoFile())
    expect(await screen.findByText(/Add the one you recorded\./)).toBeInTheDocument()
    expect(screen.getByText('Add your demo')).toBeInTheDocument()
  })

  it('is only for that partner, until their demo is in, on runs that aren’t pending or banned', async () => {
    const cases = [
      { run, halves, user: 'player' as const, shown: true },
      { run, halves, user: null, shown: false },
      { run, halves, user: 'verifier' as const, shown: false },
      // Their demo is already on their half.
      { run, halves: [halves[0]!, coopHalf(partner, null, 61)], user: 'player' as const, shown: false },
      // A run of their own in it: a demo goes on their own half (Add demo while pending).
      { run, halves: [halves[0]!, coopHalf(partner, 101, null)], user: 'player' as const, shown: false },
      { run: { ...run, verified: false }, halves, user: 'player' as const, shown: false },
      { run: { ...run, banned: true }, halves, user: 'player' as const, shown: false },
      { run, halves: null, user: 'player' as const, shown: false },
    ]
    for (const c of cases) {
      const { unmount } = await renderWithProviders(<PartnerDemo run={c.run} halves={c.halves} />, {
        user: c.user,
      })
      expect(screen.queryByText('Add your demo') != null).toBe(c.shown)
      unmount()
    }
  })
})
