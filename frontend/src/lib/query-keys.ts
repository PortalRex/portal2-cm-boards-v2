// Every query key on the site comes from here, so a change in one feature can invalidate another
// feature's queries without importing it (see lib/invalidate.ts). Keys start with their resource
// name, so `{ queryKey: ['map-board'] }` matches every board. The game key ("portal2", "mel", a
// slug) goes into every key whose data depends on it.

type Params = Record<string, unknown>

export const queryKeys = {
  catalog: () => ['catalog'] as const,
  site: () => ['site'] as const,
  me: () => ['auth', 'me'] as const,

  // Score updates, a map's chamber history, a profile's history: one list per set of filters.
  changelog: (game: string, params: Params) => ['changelog', game, params] as const,
  activity: (game: string) => ['activity', game] as const,
  recap: (game: string, week: string) => ['recap', game, week] as const,
  daily: (game: string, date: string) => ['daily', game, date] as const,
  followingFeed: (profileNumbers: string[]) => ['following-feed', profileNumbers] as const,

  mapPreviews: (mode: string) => ['map-previews', mode] as const,
  mapBoard: (game: string, mapId: string, at: string | null = null) =>
    ['map-board', game, mapId, at] as const,
  wrHistory: (game: string, mapId: string, staff = false) => ['wr-history', game, mapId, staff] as const,
  wrDemos: (game: string, mapId: string) => ['wr-demos', game, mapId] as const,
  wallOfShame: () => ['wall-of-shame'] as const,

  aggregated: (game: string, board: string) => ['aggregated', game, board] as const,

  profile: (profileNumber: string) => ['profile', profileNumber] as const,
  profileGame: (profileNumber: string, game: string) => ['profile', profileNumber, 'game', game] as const,
  profileStats: (profileNumber: string, game: string) => ['profile', profileNumber, 'stats', game] as const,
  profilePointsHistory: (profileNumber: string, game: string) =>
    ['profile', profileNumber, 'points-history', game] as const,
  profilePointsPeak: (profileNumber: string, game: string) =>
    ['profile', profileNumber, 'points-peak', game] as const,
  profileAt: (profileNumber: string, day: string) => ['profile', profileNumber, 'at', day] as const,
  profileAggregated: (profileNumber: string, day: string | null, game: string) =>
    ['profile', profileNumber, 'aggregated', game, day ?? 'now'] as const,
  user: (profileNumber: string) => ['user', profileNumber] as const,
  /** Whether you have a SAR auto-submit key (Settings). */
  submitKey: () => ['auth', 'submit-key'] as const,

  // A run (changelog entry) and what hangs off it.
  run: (changelogId: number) => ['run', changelogId] as const,
  runSegments: (changelogId: number) => ['run', changelogId, 'segments'] as const,
  runStaffNotes: (changelogId: number) => ['run', changelogId, 'staff-notes'] as const,
  coopHalves: (coopId: number) => ['coop-halves', coopId] as const,
  coopRoleOverrides: () => ['coop-role-overrides'] as const,

  siteStats: (game: string) => ['stats', 'site', game] as const,
  wrStats: (game: string) => ['stats', 'wr', game] as const,
  countryStats: (board: string) => ['countries', board] as const,
  compareSide: (profileNumber: string, game: string) => ['compare', profileNumber, game] as const,
  userSearch: (q: string) => ['user-search', q] as const,
  donators: () => ['donators'] as const,
  staff: () => ['staff'] as const,

  admin: {
    audit: (params: Params) => ['admin', 'audit', params] as const,
    jobs: () => ['admin', 'jobs'] as const,
    inbox: () => ['admin', 'inbox'] as const,
    reports: (status: string) => ['admin', 'reports', status] as const,
    reportCount: () => ['admin', 'reports', 'count'] as const,
    gameWebhook: (gameId: number) => ['admin', 'games', gameId, 'webhook'] as const,
  },
}
