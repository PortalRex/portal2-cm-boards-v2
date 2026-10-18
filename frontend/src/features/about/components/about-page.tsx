import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { InfoIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { pointsForRank } from '@/lib/points'

const DISCORD = 'https://discord.gg/hRwE4Zr'
const EXAMPLES = [1, 2, 5, 10, 25, 50, 100, 150, 200]

const TEAM = [
  { role: 'Developers and admins', names: ['Jonese1234', 'Rex', 'Daniel'] },
  { role: 'Admins', names: ['Betsruner', 'Bexc'] },
]

const grid = 'grid grid-cols-2 gap-[18px] upto800:grid-cols-1'
const link = 'text-brand-light'
const list = 'm-0 pl-[18px] text-text-2 [&>li+li]:mt-1.5'
const code = 'rounded-[3px] bg-control px-[5px] py-px text-[15px]'

// Sizes are arbitrary values on purpose: Tailwind's named sizes set a line height, and legacy's
// card text inherits the card's 1.45.
function Card({
  as: Tag = 'article',
  title,
  children,
}: {
  as?: 'article' | 'section'
  title: string
  children: ReactNode
}) {
  return (
    <Tag className="rounded-md bg-row px-5 py-[18px] text-[17px] leading-[1.45]">
      <h2 className="mt-0 mb-2.5 text-[18px] font-semibold tracking-[0.03em] uppercase">{title}</h2>
      {children}
    </Tag>
  )
}

const External = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className={link}>
    {children}
  </a>
)

/** About the boards, based on the original board's About page (board.portal2.sr/about). */
export function AboutPage() {
  return (
    <Page background={siteBackground} tint="mono" narrow>
      <Panel
        icon={InfoIcon}
        title="About"
        bodyClassName="flex flex-col gap-[18px] px-8 pt-7 pb-[34px] upto800:px-3.5 upto800:pt-[18px] upto800:pb-6"
      >
        <section>
          <h1 className="mt-0 mb-2 text-[40px] leading-[1.1] font-bold upto800:text-[30px]">
            Portal 2 Challenge Mode Leaderboards
          </h1>
          <p className="m-0 max-w-[760px] text-[19px] text-text-2">
            The community leaderboards for Portal 2 and Portal Stories: Mel Challenge Mode: every single
            player chamber and co-op course, with demos, videos and history for each time.
          </p>
        </section>

        <section className={grid}>
          <Card title="Find your way around">
            <ul className={list}>
              <li>
                <Link to="/" className={link}>
                  Score Updates
                </Link>
                : the latest times, as they come in.
              </li>
              <li>
                <Link to="/maps" className={link}>
                  Leaderboard
                </Link>
                : every map's board, chapter by chapter.
              </li>
              <li>
                <Link to="/leaderboard/$kind" params={{ kind: 'overall' }} className={link}>
                  Aggregate
                </Link>
                : points and summed times across single player, co-op and each chapter.
              </li>
              <li>
                <Link to="/compare" className={link}>
                  Compare Players
                </Link>
                : two players' times side by side.
              </li>
            </ul>
          </Card>
          <Card title="Rules">
            <p className="m-0 text-text-2">
              Runs must follow the Challenge Mode rules and allowed console commands, listed at{' '}
              <External href="https://rules.portal2.sr/">rules.portal2.sr</External>. Times in the top 200
              need a demo; without one they stay pending and earn no points. Use the report button on any run
              that looks wrong.
            </p>
          </Card>
        </section>

        <Card as="section" title="How points work">
          <p className="m-0 text-text-2">
            Each map's board tracks the top 500 times, and the top 200 earn points:{' '}
            <strong>(201 − rank)² ÷ 200</strong>, at least 1. First place earns 200 points and points fall off
            faster near the top, so a few places there are worth more than many places lower down. Your total
            is the sum over every map; the Aggregate boards add them up for single player, co-op, both, and
            each chapter.
          </p>
          <div
            role="table"
            aria-label="Points by rank"
            className="mt-3.5 grid grid-cols-9 gap-2 upto800:grid-cols-3"
          >
            {EXAMPLES.map((r) => (
              <div
                key={r}
                role="row"
                className="flex flex-col items-center rounded-[4px] bg-control px-1 py-2"
              >
                <span role="cell" className="text-[14px] text-text-muted">
                  #{r}
                </span>
                <span role="cell" className="num text-[20px] font-semibold">
                  {Math.round(pointsForRank(r) * 10) / 10}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <section className={grid}>
          <Card title="Team">
            {TEAM.map((t) => (
              <div key={t.role} className="mb-2 flex flex-col text-text-2">
                <span className="text-[14px] text-text-muted uppercase">{t.role}</span>
                <span>{t.names.join(', ')}</span>
              </div>
            ))}
          </Card>
          <Card title="Community">
            <ul className={list}>
              <li>
                <External href={DISCORD}>Discord</External>: news, questions and run discussion.
              </li>
              <li>
                <External href="https://github.com/p2sr/portal2-cm-boards-v2">GitHub</External>: the boards'
                source code.
              </li>
              <li>
                <Link to="/more/donators" className={link}>
                  Donators
                </Link>{' '}
                and the{' '}
                <Link to="/more/wall-of-shame" className={link}>
                  Wall of Shame
                </Link>
                .
              </li>
            </ul>
          </Card>
        </section>

        <section className={grid}>
          <Card title="Data and API">
            <p className="m-0 text-text-2">
              Everything on the site comes from a JSON API under <code className={code}>/api/v1</code>, for
              example <code className={code}>/api/v1/changelog</code> for score updates or{' '}
              <code className={code}>/api/v1/map/sp/&lt;map id&gt;</code> for a map's board. Every submitted
              demo is kept with its run.
            </p>
          </Card>
          <Card title="Credits">
            <p className="m-0 text-text-2">
              The original board was developed and designed by ncla, improved by iVerb, and maintained by
              Jonese1234, mlugg and NeKz. Run videos are rendered by autorender, and demos are read with
              NeKz's sdp.
            </p>
          </Card>
        </section>
      </Panel>
    </Page>
  )
}
