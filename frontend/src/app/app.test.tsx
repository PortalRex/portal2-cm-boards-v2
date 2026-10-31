import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/testing/test-utils'

describe('app shell', () => {
  it('renders the home route', async () => {
    await renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })

  it('opens every page with the saved glass look', async () => {
    localStorage.setItem('p2cm.glass', '1')
    await renderRoute('/')
    await screen.findByRole('heading', { name: 'Score Updates' })
    expect(document.documentElement.dataset.glass).toBe('on')
  })
})
