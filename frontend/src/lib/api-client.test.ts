import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/testing/mocks/server'
import { api, ApiError, apiUrl, request } from './api-client'

const base = 'http://localhost:3000/api/v1'

describe('api client', () => {
  it('builds URLs under the API base and leaves out empty params', async () => {
    let seen: URL | undefined
    server.use(
      http.get(`${base}/changelog`, ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json([])
      }),
    )
    await api.get('/changelog', { params: { limit: 50, nick_name: '', chamber: null, sp: undefined, wr_gain: true } })
    expect(seen?.pathname).toBe('/api/v1/changelog')
    expect(Object.fromEntries(seen!.searchParams)).toEqual({ limit: '50', wr_gain: 'true' })
  })

  it('sends cookies and JSON bodies', async () => {
    // MSW's copy of the request doesn't keep `credentials`, so check what the client passed.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    let body: unknown
    let type: string | null = null
    server.use(
      http.put(`${base}/admin/runs/5/banned`, async ({ request }) => {
        type = request.headers.get('content-type')
        body = await request.json()
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const result = await api.put('/admin/runs/5/banned', { body: { banned: true, reason: 'spliced' } })
    expect(result).toBeNull()
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', method: 'PUT' })
    fetchSpy.mockRestore()
    expect(type).toBe('application/json')
    expect(body).toEqual({ banned: true, reason: 'spliced' })
  })

  it.each([
    ['a JSON error', HttpResponse.json({ error: 'Not found.' }, { status: 404 }), 404, 'Not found.'],
    ['a plain-text reason', new HttpResponse('This profile is frozen.', { status: 403 }), 403, 'This profile is frozen.'],
    ['an empty 401', new HttpResponse(null, { status: 401 }), 401, 'Sign in required.'],
    ['a proxy timeout page', new HttpResponse('<html>524</html>', { status: 524 }), 524, 'The server took too long to answer.'],
    ['an empty 500', new HttpResponse(null, { status: 500 }), 500, 'Request failed (500)'],
  ])('turns %s into an ApiError', async (_name, response, status, message) => {
    server.use(http.get(`${base}/x`, () => response))
    const error = await api.get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, message })
  })

  it('returns the status with request() (the inbox long poll tells 200 from 204)', async () => {
    server.use(http.get(`${base}/admin/inbox/wait`, () => new HttpResponse(null, { status: 204 })))
    expect(await request('GET', '/admin/inbox/wait', { params: { after: 3 } })).toEqual({ status: 204, data: null })
  })

  it('makes absolute URLs for links', () => {
    expect(apiUrl('/demos/12/file')).toBe(`${base}/demos/12/file`)
    expect(apiUrl('/auth/steam/login', { return: '/profile/1' })).toBe(
      `${base}/auth/steam/login?return=%2Fprofile%2F1`,
    )
  })
})
