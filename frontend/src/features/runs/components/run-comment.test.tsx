import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { RunComment as Comment } from '../api/comment'
import { RunComment } from './run-comment'

/** Serves the run's comment and records what's sent; PUT answers `answer` (or an error). */
function serve(comment: Comment, answer?: { status: number; body: string }) {
  const sent: unknown[] = []
  let current = comment
  server.use(
    http.get(`${API}/runs/7/comment`, () => HttpResponse.json(current)),
    http.put(`${API}/runs/7/comment`, async ({ request }) => {
      const body = (await request.json()) as { note: string | null }
      sent.push(body)
      if (answer) return new HttpResponse(answer.body, { status: answer.status })
      current = { ...current, note: body.note }
      return HttpResponse.json(current)
    }),
  )
  return sent
}

const show = () =>
  renderWithProviders(
    <dl>
      <RunComment changelogId={7} note="first try" />
    </dl>,
  )

describe('RunComment', () => {
  it('shows the comment, without a way to change it for anyone else', async () => {
    serve({ note: 'first try', locked: false, editable: false })
    await show()
    expect(await screen.findByText('first try')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it("lets the run's player edit their comment, and remove it", async () => {
    const sent = serve({ note: 'first try', locked: false, editable: true })
    await show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('textbox', { name: 'Comment' })
    await userEvent.clear(box)
    await userEvent.type(box, '  pb after 3 hours ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('pb after 3 hours')).toBeInTheDocument()
    expect(sent).toEqual([{ note: 'pb after 3 hours' }])

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No comment')).toBeInTheDocument()
    expect(sent).toEqual([{ note: 'pb after 3 hours' }, { note: null }])
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument()
  })

  it('marks a comment staff set, which its player can no longer change', async () => {
    serve({ note: 'Removed: spam', locked: true, editable: false })
    await show()
    expect(await screen.findByText('(set by staff)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit|Add comment/ })).toBeNull()
  })

  it('says why when the server refuses', async () => {
    serve(
      { note: null, locked: false, editable: true },
      { status: 403, body: 'Staff set this comment, so it can’t be changed here.' },
    )
    await show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add comment' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment' }), 'hi')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Staff set this comment, so it can’t be changed here.'),
    ).toBeInTheDocument()
  })
})
