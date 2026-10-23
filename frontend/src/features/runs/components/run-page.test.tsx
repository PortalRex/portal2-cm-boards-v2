import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'

const run = (changelog as ChangelogRaw[])[0]!

describe('run page', () => {
  it('shows one run with its map, linking to the board, and the run details', async () => {
    server.use(
      http.get(`${API}/changelog/${run.id}`, () => HttpResponse.json(run)),
      http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])),
    )
    await renderRoute(`/run/${run.id}`)
    const title = await screen.findByRole('heading', { level: 1 })
    expect(title).toHaveTextContent(run.map_name)
    expect(screen.getByRole('link', { name: run.map_name })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/map\//),
    )
    expect(await screen.findByText('Comment:')).toBeInTheDocument()
  })

  it('says so for an unknown run', async () => {
    server.use(
      http.get(`${API}/changelog/999999999`, () => new HttpResponse('No such run.', { status: 404 })),
    )
    await renderRoute('/run/999999999')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('treats a non-number as an unknown page', async () => {
    await renderRoute('/run/abc')
    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })
})
