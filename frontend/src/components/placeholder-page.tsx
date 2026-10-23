import { siteBackground } from './layouts/backgrounds'
import { Page } from './layouts/page'
import { MoreIcon } from './icons'
import { Panel } from './panel'
import { EmptyState } from './status'

const TITLES: Record<string, string> = {
  discord: 'Discord',
  donators: 'Donators',
  'wall-of-shame': 'Wall Of Shame',
  about: 'About',
  settings: 'Settings',
}

/** The "More" pages without a design yet, and every unknown address (legacy Placeholder). */
export function PlaceholderPage({ page }: { page?: string }) {
  const title = page ? TITLES[page] : undefined
  return (
    <Page background={siteBackground} tint="mono" narrow>
      <Panel icon={MoreIcon} title={title ?? 'Page not found'}>
        <EmptyState>{title ? 'This page hasn’t been designed yet.' : 'There’s nothing here.'}</EmptyState>
      </Panel>
    </Page>
  )
}

/** A route whose feature isn't built yet in the rewrite (temporary; see REWRITE_PROGRESS.md). */
export function NotBuiltYet({ title }: { title: string }) {
  return (
    <Page background={siteBackground} narrow>
      <Panel title={title}>
        <EmptyState>Not built yet in the new site.</EmptyState>
      </Panel>
    </Page>
  )
}
