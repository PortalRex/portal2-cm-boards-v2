import { http, HttpResponse } from 'msw'
import site from '@/testing/fixtures/stats-site.json'
import wr from '@/testing/fixtures/stats-wr.json'
import { API } from './handlers'
import { server } from './server'

/** Serves the /stats/site and /stats/wr fixtures (captured from the local API, trimmed); records the queries. */
export function serveStats() {
  const asked: string[] = []
  const note = (request: Request) => {
    const url = new URL(request.url)
    asked.push(url.pathname.replace('/api/v1', '') + url.search)
  }
  server.use(
    http.get(`${API}/stats/site`, ({ request }) => (note(request), HttpResponse.json(site))),
    http.get(`${API}/stats/wr`, ({ request }) => (note(request), HttpResponse.json(wr))),
  )
  return asked
}
