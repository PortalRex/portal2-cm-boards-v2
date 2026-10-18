import { setupWorker } from 'msw/browser'
import { env } from '@/config/env'
import { sampleHandlers } from './sample-handlers'

/** Starts serving sample data in the browser (VITE_USE_MOCK=true only; see main.tsx). */
export async function startSampleData(): Promise<void> {
  const worker = setupWorker(...sampleHandlers(`${window.location.origin}${env.VITE_API_URL}`))
  // Images, fonts and other requests outside the API go to the network as usual.
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}
