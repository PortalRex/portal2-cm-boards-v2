import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Avatar } from '@/components/avatar'
import { DonateIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { donatorsQueryOptions } from '../api/donators'

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** Everyone who has donated to the boards, biggest total first. */
export function DonatorsPage() {
  const donators = useQuery(donatorsQueryOptions())
  const list = donators.data ?? []
  const total = list.reduce((sum, d) => sum + d.amount, 0)

  return (
    <Page background={siteBackground} tint="mono">
      <Panel
        icon={DonateIcon}
        title="Donators"
        bodyClassName="px-8 pt-6 pb-8 max-[760px]:px-3 max-[760px]:pt-4 max-[760px]:pb-5"
      >
        <p className="mt-0 mb-5 text-base">
          Thank you to everyone who has donated to keep the boards running.
          {list.length > 0 && (
            <span className="text-text-muted">
              {' '}
              {list.length} donators · {money(total)} in total
            </span>
          )}
        </p>
        {donators.isPending ? (
          <Loading />
        ) : donators.isError ? (
          <ErrorState error={donators.error} onRetry={() => void donators.refetch()} />
        ) : !list.length ? (
          <EmptyState>No donations yet.</EmptyState>
        ) : (
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-3 gap-y-2 p-0 max-[760px]:grid-cols-[minmax(0,1fr)]">
            {list.map((d, i) => (
              <li key={d.profileNumber}>
                <Link
                  to="/profile/$profileId"
                  params={{ profileId: d.profileNumber! }}
                  className="grid grid-cols-[28px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-row py-2 pr-3.5 pl-2 hover:bg-seg-hover"
                >
                  <span className="num text-center text-sm text-text-muted">{i + 1}</span>
                  <Avatar src={d.avatar} name={d.name} size={40} className="rounded-md" />
                  <span className="truncate text-lg">{d.name}</span>
                  <span className="num text-lg font-semibold text-green">{money(d.amount)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </Page>
  )
}
