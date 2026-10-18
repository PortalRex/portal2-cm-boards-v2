import { createFileRoute } from '@tanstack/react-router'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'

// Placeholder until Score Updates (5.1).
export const Route = createFileRoute('/')({
  component: () => (
    <Page background={siteBackground}>
      <h1 className="p-4 text-2xl font-semibold">Score Updates</h1>
    </Page>
  ),
})
