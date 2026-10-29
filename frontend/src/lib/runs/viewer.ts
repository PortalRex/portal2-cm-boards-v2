import { z } from 'zod'

/**
 * The demo viewer (served at /viewer/ where it's built in: env.VITE_VIEWER) replays runs from their
 * demos, which it downloads from /demos/{id}/file by these ids: a run shown (its demo and a co-op
 * partner's), others raced against it, and others as a swarm of dots.
 */
export interface ReplayRuns {
  /** The run shown: its demo first, then a co-op partner's. */
  open: number[]
  race?: number[]
  swarm?: number[]
}

/** What the replay page shows besides one run: a board's top, its WR history, its swarm or picked runs. */
export const REPLAY_WHATS = ['top', 'wr', 'swarm', 'picked'] as const
export type ReplayWhat = (typeof REPLAY_WHATS)[number]

const ids = (list: readonly (number | null | undefined)[]) => [
  ...new Set(list.filter((id): id is number => Boolean(id))),
]

/** A run's replay from its demos (a co-op run's both, the host's first); null without one. */
export function replayOf(demoIds: readonly (number | null | undefined)[]): ReplayRuns | null {
  const open = ids(demoIds)
  return open.length ? { open } : null
}

/** The viewer's address for some runs, embedded in a full page or compact (a run's details). */
export function viewerFrameSrc(runs: ReplayRuns, embed: 'full' | 'compact'): string {
  const [first, ...partners] = runs.open
  const q = [`board=${first}`]
  if (partners.length) q.push(`with=${partners.join(',')}`)
  if (runs.race?.length) q.push(`race=${runs.race.join(',')}`)
  if (runs.swarm?.length) q.push(`swarm=${runs.swarm.join(',')}`)
  return `/viewer/?embed=${embed}#${q.join('&')}`
}

// The replay page's search params: the runs as comma lists, the run (changelog id) or map it's
// for, and what it shows.
const idList = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .optional()
  .catch(undefined)
export const replaySearchSchema = z.object({
  demo: z.coerce.number().int().positive().optional().catch(undefined),
  with: idList,
  race: idList,
  swarm: idList,
  run: z.coerce.number().int().positive().optional().catch(undefined),
  map: z.string().optional().catch(undefined),
  what: z.enum(REPLAY_WHATS).optional().catch(undefined),
})
export type ReplaySearch = z.infer<typeof replaySearchSchema>

const list = (ids?: number[]) => (ids?.length ? ids.join(',') : undefined)
const numbers = (s?: string) => (s ? s.split(',').map(Number) : [])

/** The replay page's search for some runs. */
export function replaySearch(
  runs: ReplayRuns,
  about: { run?: number | null; map?: string; what?: ReplayWhat } = {},
): ReplaySearch {
  const [demo, ...partners] = runs.open
  return {
    demo,
    with: list(partners),
    race: list(runs.race),
    swarm: list(runs.swarm),
    run: about.run ?? undefined,
    map: about.map,
    what: about.what,
  }
}

/** The runs a replay page's search names; null without a run to show. */
export function replayRunsOf(search: ReplaySearch): ReplayRuns | null {
  if (!search.demo) return null
  return {
    open: [search.demo, ...numbers(search.with)],
    race: numbers(search.race),
    swarm: numbers(search.swarm),
  }
}
