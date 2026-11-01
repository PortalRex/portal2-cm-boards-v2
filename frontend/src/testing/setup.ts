import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetUnsavedStorage } from '@/lib/storage'
import { FakeIntersectionObserver, resetIntersection } from './intersection'
import { server } from './mocks/server'

// jsdom has no layout: scroll restoration calls these.
window.scrollTo = () => {}
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
// Nor what's in view: infinite lists watch their end with this stand-in (see ./intersection).
window.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver

// Any request without a handler fails the test, so nothing reaches a real server.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
  resetUnsavedStorage()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.glass
  delete document.documentElement.dataset.rankContrast
  delete document.documentElement.dataset.rankGlass
  resetIntersection()
})
afterAll(() => server.close())
