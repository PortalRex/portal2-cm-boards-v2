import type { RequestHandler } from 'msw'

// Default handlers shared by the tests and the sample-data browser worker. Tests add their own
// with server.use(...).
export const handlers: RequestHandler[] = []
