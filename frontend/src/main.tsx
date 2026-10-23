import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import './index.css'

async function main() {
  // Sample data only when asked for (D1 in FRONTEND_REWRITE.md: the live site never shows fake
  // scores). Vite replaces the check at build time, so normal builds leave the mock code out.
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { startSampleData } = await import('@/testing/mocks/browser')
    await startSampleData()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void main()
