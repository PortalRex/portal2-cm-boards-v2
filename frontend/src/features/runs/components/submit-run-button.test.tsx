import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/testing/test-utils'

// The whole app under jsdom (the upload tests next door run under happy-dom).
describe('the Submit Run button', () => {
  it('opens the dialog for signed-in players, and Escape closes it', async () => {
    await renderRoute('/', { user: 'player' })
    await userEvent.click(await screen.findByRole('button', { name: /submit run/i }))
    expect(await screen.findByRole('dialog', { name: 'Submit run' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('isn’t there for visitors', async () => {
    await renderRoute('/')
    await screen.findByRole('link', { name: /sign in/i })
    expect(screen.queryByRole('button', { name: /submit run/i })).toBeNull()
  })
})
