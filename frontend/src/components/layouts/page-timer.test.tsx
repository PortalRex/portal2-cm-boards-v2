import { screen, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

const line = /^This page was generated in \d+\.\d{3} seconds$/

describe('the page timer', () => {
  it('says how long the page took once its data has loaded', async () => {
    let answered = false
    server.use(
      http.get(`${API}/changelog`, async () => {
        await delay(300)
        answered = true
        return HttpResponse.json([])
      }),
    )
    await renderRoute('/')
    const text = await screen.findByText(line, {}, { timeout: 3000 })
    // Not before the page's own requests have answered.
    expect(answered).toBe(true)
    expect(Number(text.textContent!.match(/[\d.]+/)![0])).toBeGreaterThan(0.25)
  })

  it('starts over for the next page', async () => {
    const { router } = await renderRoute('/more/about')
    await screen.findByText(line, {}, { timeout: 3000 })
    server.use(
      http.get(`${API}/donators`, async () => {
        await delay(400)
        return HttpResponse.json([])
      }),
    )
    void router.navigate({ to: '/more/donators' })
    await waitFor(() => expect(screen.queryByText(line)).toBeNull())
    const text = await screen.findByText(line, {}, { timeout: 3000 })
    expect(Number(text.textContent!.match(/[\d.]+/)![0])).toBeGreaterThan(0.35)
  })
})
