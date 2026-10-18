import {
  BUILTIN_CATALOG,
  isMultiplayerMode,
  mapsForGame,
  mapsForMode,
  p2ChapterByDbId,
  type MapInfo,
} from '@/lib/catalog'
import { countryIdByCode } from '@/lib/data/countries'
import { pointsForRank } from '@/lib/points'
import type { MeRaw } from '@/lib/auth'
import type { ChangelogRaw, CoopPreviewRaw, CoopRankedRaw, SpPreviewRaw, SpRankedRaw } from '@/types/runs'

// Deterministic sample data in the API's own JSON shapes (ported from the legacy
// frontend-legacy/src/api/mock.js, which produced already-adapted objects). It feeds the MSW
// handlers behind VITE_USE_MOCK=true and the tests. Everything comes from fixed seeds, so the
// pages look the same on every load. Player names are invented.

export function mulberry32(seed: number) {
  return function next() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = [
  'Chellbound', 'AtlasPrime', 'PBodyGoesFast', 'Wheatley', 'CaveJ', 'Caroline', 'Rattmann',
  'MoonRocks', 'Repulsor', 'Propulsor', 'TurretWhisper', 'CompanionCube', 'Aperturist',
  'ConversionGel', 'LongFallBoots', 'AerialFaith', 'FrankenTurret', 'EdgelessCube', 'LaserRelay',
  'HardLightRun', 'TractorBeam', 'PortalSurfer', 'Neurotoxin', 'TestSubject9', 'BlueOrange',
  'Momentum', 'FlingKing', 'CakeIsALie', 'EnrichmentCtr', 'SpaceCore', 'FactCore',
  'AdventureCore', 'BridgeBuilder', 'Catapult', 'Excursion', 'ThermalDisc', 'PneumaticDiv',
  'VitalApparatus', 'OldAperture', 'Panels', 'ScienceTeam', 'Mel', 'Virgil', 'Ravioli',
  'Bendy', 'Animatronic', 'Paradox', 'BoxButton',
] // prettier-ignore
const COUNTRIES = ['gb', 'us', 'se', 'hu', 'no', 'fi', 'de', 'pl', 'nl', 'ca', 'au', 'fr', 'cz', 'br']
const PALETTE = [
  '#3c6e71',
  '#7b4b94',
  '#a23e48',
  '#3a5a40',
  '#b5651d',
  '#355c7d',
  '#6c5b7b',
  '#2a9d8f',
  '#8d5524',
  '#5e548e',
]

function avatarFor(name: string, i: number) {
  const bg = PALETTE[i % PALETTE.length]
  const initials = name.replace(/[^A-Z0-9]/g, '').slice(0, 2) || name.slice(0, 2).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="41" font-family="Barlow Semi Condensed,Arial,sans-serif" font-size="26" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export interface SamplePlayer {
  profileNumber: string
  name: string
  avatar: string
  country: string
}

export const SAMPLE_PLAYERS: SamplePlayer[] = NAMES.map((name, i) => ({
  profileNumber: `765611980000${String(10000 + i * 37).padStart(5, '0')}`,
  name,
  avatar: avatarFor(name, i),
  country: COUNTRIES[i % COUNTRIES.length]!,
}))

/** GET /wall_of_shame: the last three sample players, as legacy's sample data. */
export const sampleWallOfShame = () =>
  SAMPLE_PLAYERS.slice(-3).map((p) => ({
    profile_number: p.profileNumber,
    user_name: p.name,
    avatar: p.avatar,
  }))

/** The stand-in signed-in user shown with sample data (never staff). */
export const SAMPLE_ME: MeRaw = {
  profile_number: SAMPLE_PLAYERS[0]!.profileNumber,
  user_name: SAMPLE_PLAYERS[0]!.name,
  avatar: SAMPLE_PLAYERS[0]!.avatar,
  admin: 0,
  role: null,
  banned: false,
}

const DAY = 24 * 3600 * 1000
// Fixed "now", so sample dates don't drift between loads and tests.
export const SAMPLE_NOW = Date.parse('2026-10-17T12:00:00Z')
const iso = (t: number) => new Date(t).toISOString().slice(0, 19)

// --- per-map boards -------------------------------------------------------------------

interface BoardEntry {
  rank: number
  score: number
  points: number
  timestamp: string
  demoId: number | null
  note: string | null
  players: SamplePlayer[]
}

function buildBoard(map: MapInfo): BoardEntry[] {
  const local = mulberry32(Number(map.id) + (map.game === 'mel' ? 90000 : 0))
  const coop = isMultiplayerMode(BUILTIN_CATALOG, map.mode)
  const wr = coop ? 900 + Math.floor(local() * 3000) : 700 + Math.floor(local() * 4000)
  const order = [...SAMPLE_PLAYERS].sort(() => local() - 0.5)
  // Every sample player has a score on every map so aggregated times line up.
  let score = wr
  const entries: BoardEntry[] = []
  for (let i = 0; i < order.length; i++) {
    if (i > 0) score += Math.floor(local() * (i < 5 ? 8 : 25))
    const player = order[i]!
    const partner = coop ? order[(i + 7) % order.length]! : null
    const previous = entries[i - 1]
    entries.push({
      rank: i === 0 ? 1 : previous!.score === score ? previous!.rank : i + 1,
      score,
      points: pointsForRank(i + 1),
      timestamp: iso(SAMPLE_NOW - Math.floor(local() * 900) * DAY),
      demoId: local() < 0.7 ? 1000 + i : null,
      note: local() < 0.2 ? 'gg' : null,
      players: partner ? [player, partner] : [player],
    })
  }
  return entries
}

const boards = new Map<string, BoardEntry[]>()
function board(map: MapInfo) {
  const key = `${map.game}:${map.id}`
  if (!boards.has(key)) boards.set(key, buildBoard(map))
  return boards.get(key)!
}

const findSampleMap = (mapId: string, game: string) =>
  BUILTIN_CATALOG.maps.get(`${game}:${mapId}`) ??
  mapsForGame(BUILTIN_CATALOG, 'portal2').find((m) => m.id === mapId)

/** GET /map/sp/{id}: a single player board. */
export function sampleSpBoard(mapId: string, game = 'portal2'): SpRankedRaw[] {
  const map = findSampleMap(mapId, game)
  if (!map) return []
  return board(map).map((e, i) => ({
    rank: e.rank,
    points: e.points,
    map_data: {
      cl_id: (game === 'mel' ? 700000 : 800000) + Number(map.id) * 100 + i,
      timestamp: e.timestamp,
      profile_number: e.players[0]!.profileNumber,
      score: e.score,
      demo_id: e.demoId,
      // Sample data has no real videos or renders; the UI shows its empty states.
      youtube_id: null,
      submission: 0,
      note: e.note,
      category_id: 1,
      user_name: e.players[0]!.name,
      avatar: e.players[0]!.avatar,
      autorender_id: null,
      portals: null,
      sar_version: null,
    },
  }))
}

/** GET /map/coop/{id}: a co-op board. */
export function sampleCoopBoard(mapId: string): CoopRankedRaw[] {
  const map = findSampleMap(mapId, 'portal2')
  if (!map) return []
  return board(map).map((e, i) => {
    const [a, b] = e.players as [SamplePlayer, SamplePlayer]
    const cl = 900000 + Number(map.id) * 100 + i * 2
    return {
      rank: e.rank,
      points: e.points,
      map_data: {
        coop_id: 60000 + Number(map.id) * 100 + i,
        cl_id1: cl,
        cl_id2: cl + 1,
        timestamp: e.timestamp,
        profile_number1: a.profileNumber,
        profile_number2: b.profileNumber,
        score: e.score,
        p1_is_host: i % 3 === 0 ? null : true,
        demo_id1: e.demoId,
        demo_id2: null,
        youtube_id1: null,
        youtube_id2: null,
        submission1: 0,
        submission2: 0,
        note1: e.note,
        note2: null,
        category_id: 1,
        user_name1: a.name,
        user_name2: b.name,
        avatar1: a.avatar,
        avatar2: b.avatar,
        autorender_id1: null,
        autorender_id2: null,
        portals1: null,
        portals2: null,
        sar_version1: null,
        sar_version2: null,
      },
    }
  })
}

/** GET /sp or /coop (with game_id): the top 7 of every map of the game, one group per map. */
export function samplePreviews(game: string, coop: boolean): (SpPreviewRaw[] | CoopPreviewRaw[])[] {
  const maps = mapsForGame(BUILTIN_CATALOG, game).filter(
    (m) => isMultiplayerMode(BUILTIN_CATALOG, m.mode) === coop,
  )
  return maps.map((map) =>
    coop
      ? board(map)
          .slice(0, 7)
          .map((e): CoopPreviewRaw => ({
            profile_number1: e.players[0]!.profileNumber,
            profile_number2: e.players[1]!.profileNumber,
            score: e.score,
            youtube_id1: null,
            youtube_id2: null,
            category_id: 1,
            user_name1: e.players[0]!.name,
            user_name2: e.players[1]!.name,
            map_id: map.id,
            autorender_id: null,
          }))
      : board(map)
          .slice(0, 7)
          .map((e): SpPreviewRaw => ({
            profile_number: e.players[0]!.profileNumber,
            score: e.score,
            youtube_id: null,
            category_id: 1,
            user_name: e.players[0]!.name,
            map_id: map.id,
            autorender_id: null,
          })),
  )
}

// --- aggregated boards ----------------------------------------------------------------

function boardMaps(game: string, board: string): MapInfo[] {
  const chapterId = /^chapter-(\d+)$/.exec(board)?.[1]
  if (chapterId) return p2ChapterByDbId(BUILTIN_CATALOG, chapterId)?.maps ?? []
  if (board === 'overall') return mapsForGame(BUILTIN_CATALOG, game)
  return mapsForMode(BUILTIN_CATALOG, board)
}

/** GET /points/game/{game_id}/{board}: every sample player's points and time over the board's maps. */
export function samplePoints(game: string, boardKey: string) {
  const totals = new Map<string, { player: SamplePlayer; points: number; score: number; maps: Set<string> }>()
  for (const map of boardMaps(game, boardKey)) {
    for (const entry of board(map)) {
      for (const player of entry.players) {
        const t = totals.get(player.profileNumber) ?? { player, points: 0, score: 0, maps: new Set() }
        totals.set(player.profileNumber, t)
        if (t.maps.has(map.id)) continue
        t.maps.add(map.id)
        t.points += entry.points
        t.score += entry.score
      }
    }
  }
  return {
    id: null,
    points: [...totals.values()]
      .sort((a, b) => b.points - a.points)
      .map(({ player, points, score, maps }) => [
        player.profileNumber,
        {
          points,
          score,
          num_scores: maps.size,
          total_rank_sum: 0,
          worst: [0, 'Multiple'],
          best: [0, 'Multiple'],
          user_name: player.name,
          avatar: player.avatar,
          country_id: countryIdByCode(player.country),
        },
      ]),
  }
}

// --- profiles -------------------------------------------------------------------------

const samplePlayer = (profileNumber: string) =>
  SAMPLE_PLAYERS.find((p) => p.profileNumber === profileNumber) ?? SAMPLE_PLAYERS[0]!

/** The player's place on each map of a game's sample boards. */
function placesOf(profileNumber: string, game: string) {
  return mapsForGame(BUILTIN_CATALOG, game).flatMap((map) => {
    const entries = board(map)
    const i = entries.findIndex((e) => e.players.some((p) => p.profileNumber === profileNumber))
    return i < 0 ? [] : [{ map, entry: entries[i]!, next: entries[i - 1], wr: entries[0]! }]
  })
}

/** GET /user/{id}: a sample player (titles and links made up, as legacy's sample profile). */
export function sampleUser(profileNumber: string) {
  const p = samplePlayer(profileNumber)
  return {
    profile_number: p.profileNumber,
    board_name: p.name,
    steam_name: p.name,
    banned: false,
    registered: 1,
    avatar: p.avatar,
    twitch: p.name.toLowerCase(),
    youtube: `@${p.name}`,
    title: 'Professional, Developer',
    admin: 0,
    country_id: countryIdByCode(p.country),
    frozen: false,
    frozen_reason: null,
    role: null,
    name_locked: false,
    avatar_locked: false,
    avatar_custom: false,
    legends_at: null,
  }
}

/** GET /profile/{id}: points and places from the sample aggregated boards, ranks from the maps. */
export function sampleProfilePage(profileNumber: string) {
  const p = samplePlayer(profileNumber)
  const local = mulberry32(Number(p.profileNumber.slice(-6)))
  const entry = (id: number, boardKey: string) => {
    const rows = samplePoints('portal2', boardKey).points
    const i = rows.findIndex(([pn]) => pn === p.profileNumber)
    return {
      id,
      points: rows[i]?.[1] ?? null,
      place: i < 0 ? null : i + 1,
      country_place: 1 + Math.floor(local() * 4),
    }
  }
  const places = placesOf(p.profileNumber, 'portal2')
  const dated = (mode: string) =>
    places
      .filter((x) => x.map.mode === mode)
      .sort((a, b) => a.entry.timestamp.localeCompare(b.entry.timestamp))
  const brief = (x: (typeof places)[number] | undefined) =>
    x ? { map: x.map.id, map_name: x.map.title, score: x.entry.score, timestamp: x.entry.timestamp } : null
  return {
    points: [entry(-1, 'sp'), entry(-2, 'coop'), entry(-3, 'overall')],
    data: {
      oldest_sp: brief(dated('sp')[0]),
      newest_sp: brief(dated('sp').at(-1)),
      oldest_coop: brief(dated('coop')[0]),
      newest_coop: brief(dated('coop').at(-1)),
    },
    ranks: Object.fromEntries(places.map((x) => [x.map.id, x.entry.rank])),
  }
}

/** GET /profile/scores/{id}: the player's time on every map, with the gaps to the next and the WR. */
export const sampleProfileScores = (profileNumber: string) =>
  placesOf(samplePlayer(profileNumber).profileNumber, 'portal2').map(({ map, entry, next, wr }) => ({
    map_id: map.id,
    score: entry.score,
    timestamp: entry.timestamp,
    changelog_id: null,
    is_multiplayer: map.mode === 'coop',
    rank: entry.rank,
    delta_to_wr: entry.score - wr.score,
    delta_to_next: next ? entry.score - next.score : null,
  }))

/** GET /ranks/game/{game_id}/{id}: the player's rank on each of the game's maps. */
export const sampleGameRanks = (game: string, profileNumber: string) =>
  Object.fromEntries(
    placesOf(samplePlayer(profileNumber).profileNumber, game).map(({ map, entry }) => [map.id, entry.rank]),
  )

// --- changelog ------------------------------------------------------------------------

function buildChangelog(game: string): ChangelogRaw[] {
  const maps = mapsForGame(BUILTIN_CATALOG, game)
  const local = mulberry32(game === 'mel' ? 4242 : 42)
  const out: ChangelogRaw[] = []
  for (let i = 0; i < 160; i++) {
    const map = maps[Math.floor(local() * maps.length)]!
    const idx = Math.floor(local() * 30)
    const entry = board(map)[idx]!
    const preRank = local() < 0.15 ? null : idx + 1 + 1 + Math.floor(local() * 20)
    const coop = entry.players.length > 1
    const [blue, orange] = entry.players
    out.push({
      id: (game === 'mel' ? 9000 : 50000) - i,
      timestamp: iso(SAMPLE_NOW - Math.floor(i * i * 0.8 + local() * 30) * 60 * 1000),
      profile_number: blue!.profileNumber,
      score: entry.score,
      map_id: map.id,
      demo_id: entry.demoId,
      banned: false,
      youtube_id: null,
      previous_id: null,
      coop_id: coop ? 70000 + i : null,
      post_rank: idx + 1,
      pre_rank: preRank,
      submission: 0,
      note: local() < 0.3 ? 'Finally got the cube boost' : null,
      category_id: 1,
      score_delta: preRank == null ? null : -(5 + Math.floor(local() * 60)),
      verified: local() > 0.12,
      admin_note: null,
      autorender_id: null,
      map_name: map.title,
      user_name: blue!.name,
      avatar: blue!.avatar,
      blue_name: coop ? blue!.name : null,
      orange_name: coop ? orange!.name : null,
      blue_avatar: coop ? blue!.avatar : null,
      orange_avatar: coop ? orange!.avatar : null,
      blue_profile_number: coop ? blue!.profileNumber : null,
      orange_profile_number: coop ? orange!.profileNumber : null,
      coop_roles_known: coop ? true : null,
      wr_hidden: false,
      portals: null,
      sar_version: '1.12.8',
      date_estimated: false,
      reactions_up: 0,
      reactions_down: 0,
    })
  }
  return out
}

const changelogs = new Map<string, ChangelogRaw[]>()

export interface SampleChangelogQuery {
  game?: string
  nick_name?: string | null
  profile_number?: string | null
  chamber?: string | null
  sp?: string | null
  coop?: string | null
  wr_gain?: string | null
  yt?: string | null
  has_demo?: string | null
  banned?: string | null
  verified?: string | null
  limit?: string | null
}

/** GET /changelog with its filters (the ones the sample rows can answer). */
export function sampleChangelog(q: SampleChangelogQuery = {}): ChangelogRaw[] {
  const game = q.game ?? 'portal2'
  if (!changelogs.has(game)) changelogs.set(game, buildChangelog(game))
  const search = (q.nick_name ?? '').trim().toLowerCase()
  const rows = changelogs.get(game)!.filter((r) => {
    const names = [r.user_name, r.orange_name ?? ''].map((n) => n.toLowerCase())
    if (
      q.profile_number &&
      r.profile_number !== q.profile_number &&
      r.orange_profile_number !== q.profile_number
    )
      return false
    if (q.chamber && r.map_id !== q.chamber) return false
    if (q.sp === 'false' && r.coop_id == null) return false
    if (q.coop === 'false' && r.coop_id != null) return false
    if (q.wr_gain === 'true' && r.post_rank !== 1) return false
    if (q.yt === 'true' && !r.youtube_id) return false
    if (q.has_demo === 'true' && !r.demo_id) return false
    if (q.banned === 'true') return false
    if (q.verified === 'false' && r.verified !== false) return false
    if (!search) return true
    return r.map_name.toLowerCase().includes(search) || names.some((n) => n.includes(search))
  })
  return rows.slice(0, Number(q.limit ?? 200))
}

/** GET /graph: runs per day over the last two years. */
export function sampleActivity(): { date: string; count: number }[] {
  const local = mulberry32(99)
  const days = []
  for (let d = 730; d >= 0; d--) {
    days.push({
      date: new Date(SAMPLE_NOW - d * DAY).toISOString().slice(0, 10),
      count: 2 + Math.floor(local() * 18),
    })
  }
  return days
}

/** GET /recap/weekly: the week's top 5 (here: the best-ranked sample runs). */
export function sampleWeeklyRecap(game = 'portal2', week = '2026-10-12') {
  const start = new Date(`${week}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(start.getTime() + 7 * DAY)
  const runs = [...sampleChangelog({ game })]
    .sort((a, b) => (a.post_rank ?? 999) - (b.post_rank ?? 999))
    .slice(0, 5)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), runs }
}

/** GET /daily: one map per board with a few of its sample runs. */
export function sampleDaily(game = 'portal2', date = '2026-10-17') {
  const seed = Number(date.replaceAll('-', ''))
  const chambers = (BUILTIN_CATALOG.games[game]?.modes ?? []).map((mode, i) => {
    const maps = mapsForGame(BUILTIN_CATALOG, game).filter((m) => m.mode === mode)
    const map = maps[(seed + i * 7) % maps.length]!
    const runs = sampleChangelog({ game, limit: '200' })
      .filter((r) => r.map_id === map.id)
      .slice(0, 4)
    return {
      map: {
        steam_id: map.id,
        name: map.title,
        game_mode: mode,
        is_coop: isMultiplayerMode(BUILTIN_CATALOG, mode),
      },
      runs,
    }
  })
  return { date, chambers }
}
