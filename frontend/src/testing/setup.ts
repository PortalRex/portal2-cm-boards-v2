import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetUnsavedStorage } from '@/lib/storage'
import { server } from './mocks/server'

// jsdom has no layout: scroll restoration calls these.
window.scrollTo = () => {}
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}

// Any request without a handler fails the test, so nothing reaches a real server.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
  resetUnsavedStorage()
  delete document.documentElement.dataset.theme
})
afterAll(() => server.close())
