import {
  chapterDbId,
  chaptersFor,
  currentSeason,
  gameBoardsPath,
  isLive,
  modeLabel,
  seasonsOf,
  withSeason,
  type Catalog,
} from '@/lib/catalog'

// What the top bar's menus list (legacy TopBar.jsx): pure, from the catalog, so it's tested
// without rendering.

export type MenuIconName = 'bars' | 'person' | 'people' | 'trophy' | 'star'

export interface MenuEntry {
  label: string
  to: string
  icon?: MenuIconName
  /** Chapter number shown instead of an icon. */
  number?: number
  /** Shown in the accent colour, upper case (the running season). */
  highlight?: boolean
  /** Entries under this one (a board's chapters, the seasons). */
  chapters?: MenuEntry[]
  /** The flyout lists only `chapters`, without a "Total" row. */
  noTotal?: boolean
}

const chapterItems = (c: Catalog, mode: string): MenuEntry[] =>
  chaptersFor(c, mode).map((ch) => ({
    number: ch.number,
    label: ch.name,
    to: `/leaderboard/chapter/${chapterDbId(ch)}`,
  }))

/** A game's season entries: the running one highlighted, then the list of all of them. */
function seasonBoards(c: Catalog, base: string, overallPath: string, now: number): MenuEntry[] {
  const seasons = seasonsOf(c, base).filter((g) => !g.hidden)
  if (!seasons.length) return []
  const live = currentSeason(c, base, now)
  return [
    ...(live && isLive(live, now)
      ? [
          {
            label: 'Current season',
            icon: 'trophy' as const,
            highlight: true,
            to: withSeason(overallPath, live.id),
          },
        ]
      : []),
    {
      label: 'Seasons',
      icon: 'trophy',
      to: withSeason(overallPath, seasons[0]!.id),
      noTotal: true,
      chapters: seasons.map((g) => ({
        label: g.label,
        icon: 'trophy' as const,
        to: withSeason(overallPath, g.id),
      })),
    },
  ]
}

/**
 * The Aggregate menu for a game: its boards (Overall, then each mode; Portal 2's single player
 * and co-op boards list their chapters), then its seasons.
 */
export function aggregateMenu(c: Catalog, game: string, now = Date.now()): MenuEntry[] {
  if (game === 'mel') {
    return [
      { label: 'Overall', icon: 'bars', to: '/leaderboard/mel/overall' },
      { label: 'Story Mode', icon: 'person', to: '/leaderboard/mel/story' },
      { label: 'Advanced Mode', icon: 'person', to: '/leaderboard/mel/advanced' },
      ...seasonBoards(c, 'mel', '/leaderboard/mel/overall', now),
    ]
  }
  const g = game !== 'portal2' ? c.games[game] : undefined
  if (g && g.kind === 'game' && !g.hidden) {
    const base = `/leaderboard/game/${g.id}`
    return [
      { label: 'Overall', icon: 'bars', to: `${base}/overall` },
      ...g.modes.map((m) => ({ label: modeLabel(c, m), icon: 'bars' as const, to: `${base}/${m}` })),
      ...seasonBoards(c, g.id, `${base}/overall`, now),
    ]
  }
  return [
    { label: 'Overall', icon: 'bars', to: '/leaderboard/overall' },
    { label: 'Single Player', icon: 'person', to: '/leaderboard/sp', chapters: chapterItems(c, 'sp') },
    { label: 'Cooperative', icon: 'people', to: '/leaderboard/coop', chapters: chapterItems(c, 'coop') },
    ...seasonBoards(c, 'portal2', '/leaderboard/overall', now),
  ]
}

/**
 * Whether a menu entry is the page you're on: the same path and season (a board without
 * ?season= is its all-time board). `also`: entries under it (a board's chapters).
 */
export function isHere(
  to: string | undefined,
  pathname: string,
  search: string,
  also: string[] = [],
): boolean {
  const season = new URLSearchParams(search).get('season')
  return [to, ...also].some((t) => {
    if (!t) return false
    const url = new URL(t, 'http://site')
    return url.pathname === pathname && url.searchParams.get('season') === season
  })
}

// Where switching game goes from the page you're on: a board or map of the old game opens the
// new game's boards or map list; other pages stay, without the old game's filters.
const GAME_PARAMS = ['game', 'season', 'mode', 'map', 'board', 'page']

export function pathForGame(game: string, pathname: string, search: string): string {
  if (pathname.startsWith('/leaderboard')) return gameBoardsPath(game)
  if (pathname.startsWith('/map/')) return '/maps'
  const params = new URLSearchParams(search)
  for (const k of GAME_PARAMS) params.delete(k)
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}

export interface NavItem {
  to: string
  label: string
  icon: 'history' | 'pin' | 'bars' | 'stats' | 'more'
  /** Active only on exactly this path (Score Updates). */
  end?: boolean
  /** Path prefixes that make it active. */
  match?: string[]
  menu?: 'aggregate' | 'more'
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Score Updates', icon: 'history', end: true },
  { to: '/maps', label: 'Leaderboard', icon: 'pin', match: ['/maps', '/map/'] },
  {
    to: '/leaderboard/overall',
    label: 'Aggregate',
    icon: 'bars',
    menu: 'aggregate',
    match: ['/leaderboard'],
  },
  { to: '/stats', label: 'Stats', icon: 'stats', match: ['/stats'] },
  { to: '/more/about', label: 'More', icon: 'more', menu: 'more', match: ['/more'] },
]

export const isNavActive = (item: NavItem, pathname: string): boolean =>
  item.end ? pathname === item.to : (item.match ?? [item.to]).some((m) => pathname.startsWith(m))

export interface MoreEntry {
  label: string
  icon: 'discord' | 'github' | 'donate' | 'gavel' | 'info'
  href?: string
  to?: string
}

export const MORE_MENU: MoreEntry[] = [
  { href: 'https://discord.gg/hRwE4Zr', label: 'Discord', icon: 'discord' },
  { href: 'https://github.com/p2sr/portal2-cm-boards-v2', label: 'GitHub', icon: 'github' },
  { to: '/more/donators', label: 'Donators', icon: 'donate' },
  { to: '/more/wall-of-shame', label: 'Wall Of Shame', icon: 'gavel' },
  { to: '/more/about', label: 'About', icon: 'info' },
]
