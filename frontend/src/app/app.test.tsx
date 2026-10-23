import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/testing/test-utils'

describe('app shell', () => {
  it('renders the home route', async () => {
    await renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })
})
