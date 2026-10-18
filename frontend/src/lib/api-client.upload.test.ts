// @vitest-environment happy-dom
// Multipart uploads can't go through MSW under jsdom (Vitest's jsdom/Node fetch bridge sends a
// body that doesn't match its Content-Length), so tests that upload files use happy-dom.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/testing/mocks/server'
import { api } from './api-client'

const base = 'http://localhost:3000/api/v1'

describe('api client uploads', () => {
  it('sends FormData as multipart without a JSON content type', async () => {
    let type: string | null = null
    let file: FormDataEntryValue | null = null
    server.use(
      http.post(`${base}/submissions/preview`, async ({ request }) => {
        type = request.headers.get('content-type')
        file = (await request.formData()).get('demo')
        return HttpResponse.json({ map: 'sp_a1_intro1' })
      }),
    )
    const form = new FormData()
    form.append('demo', new File(['demo'], 'run.dem'))
    expect(await api.post('/submissions/preview', { body: form })).toEqual({ map: 'sp_a1_intro1' })
    expect(type).toMatch(/^multipart\/form-data/)
    expect(file).toMatchObject({ name: 'run.dem' })
  })
})
