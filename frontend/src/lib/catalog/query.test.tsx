import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { createTestQueryClient } from '@/testing/test-utils'
import { BUILTIN_CATALOG } from './build'
import { useCatalog } from './query'

function setup() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCatalog(), { wrapper })
}

describe('useCatalog', () => {
  it('gives the built-in lists until the server catalog arrives, then that', async () => {
    const { result } = setup()
    expect(result.current).toBe(BUILTIN_CATALOG)
    await waitFor(() => expect(result.current.fromServer).toBe(true))
    expect(Object.keys(result.current.games)).toContain('portal-2-season-1')
  })

  it('keeps the built-in lists when the catalog fails', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/catalog`, () => {
        calls++
        return HttpResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 })
      }),
    )
    const { result } = setup()
    await waitFor(() => expect(calls).toBe(1))
    expect(result.current).toBe(BUILTIN_CATALOG)
  })

  it('keeps the built-in lists for an empty catalog', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/catalog`, () => {
        calls++
        return HttpResponse.json([])
      }),
    )
    const { result } = setup()
    await waitFor(() => expect(calls).toBe(1))
    expect(result.current).toBe(BUILTIN_CATALOG)
  })
})
