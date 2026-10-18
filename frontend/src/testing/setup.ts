import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

// jsdom has no layout: scroll restoration calls these.
window.scrollTo = () => {}
Element.prototype.scrollTo = () => {}

// Any request without a handler fails the test, so nothing reaches a real server.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterAll(() => server.close())
