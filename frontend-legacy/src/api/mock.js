// Deterministic sample data used when the API server is unreachable (or when
// REACT_APP_USE_MOCK=true). Everything is generated from a fixed seed so the
// pages look the same on every load. Player names are invented.
import { allMaps, melMaps, chaptersFor, getMap, mapsForMode, p2ChapterByDbId } from "../data/maps";

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Chellbound", "AtlasPrime", "PBodyGoesFast", "Wheatley", "CaveJ", "Caroline", "Rattmann",
  "MoonRocks", "Repulsor", "Propulsor", "TurretWhisper", "CompanionCube", "Aperturist",
  "ConversionGel", "LongFallBoots", "AerialFaith", "FrankenTurret", "EdgelessCube", "LaserRelay",
  "HardLightRun", "TractorBeam", "PortalSurfer", "Neurotoxin", "TestSubject9", "BlueOrange",
  "Momentum", "FlingKing", "CakeIsALie", "EnrichmentCtr", "SpaceCore", "FactCore",
  "AdventureCore", "BridgeBuilder", "Catapult", "Excursion", "ThermalDisc", "PneumaticDiv",
  "VitalApparatus", "OldAperture", "Panels", "ScienceTeam", "Mel", "Virgil", "Ravioli",
  "Bendy", "Animatronic", "Paradox", "BoxButton",
];
const COUNTRIES = ["gb", "us", "se", "hu", "no", "fi", "de", "pl", "nl", "ca", "au", "fr", "cz", "br"];
const PALETTE = ["#3c6e71", "#7b4b94", "#a23e48", "#3a5a40", "#b5651d", "#355c7d", "#6c5b7b", "#2a9d8f", "#8d5524", "#5e548e"];

function avatarFor(name, i) {
  const bg = PALETTE[i % PALETTE.length];
  const initials = name.replace(/[^A-Z0-9]/g, "").slice(0, 2) || name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="41" font-family="Barlow Semi Condensed,Arial,sans-serif" font-size="26" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const rand = mulberry32(2011);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

export const PLAYERS = NAMES.map((name, i) => ({
  profileNumber: `765611980000${String(10000 + i * 37).padStart(5, "0")}`,
  name,
  avatar: avatarFor(name, i),
  country: COUNTRIES[i % COUNTRIES.length],
}));

const playerByProfile = Object.fromEntries(PLAYERS.map((p) => [p.profileNumber, p]));
export const getMockPlayer = (profileNumber) => playerByProfile[profileNumber] || PLAYERS[0];

const NOW = Date.now();
const DAY = 24 * 3600 * 1000;

export function pointsForRank(rank) {
  if (rank > 200) return 0;
  return Math.max(1, Math.round(((200 - (rank - 1)) ** 2 / 200) * 10) / 10);
}

// --- per-map boards -------------------------------------------------------

function buildBoard(map) {
  const local = mulberry32(Number(map.id) + (map.game === "mel" ? 90000 : 0));
  const wr = map.mode === "coop" ? 900 + Math.floor(local() * 3000) : 700 + Math.floor(local() * 4000);
  const order = [...PLAYERS].sort(() => local() - 0.5);
  // Every sample player has a score on every map so aggregated times line up.
  const size = PLAYERS.length;
  let score = wr;
  const entries = [];
  for (let i = 0; i < size; i++) {
    if (i > 0) score += Math.floor(local() * (i < 5 ? 8 : 25));
    const player = order[i % order.length];
    const partner = map.mode === "coop" ? order[(i + 7) % order.length] : null;
    entries.push({
      changelogId: null,
      rank: i === 0 ? 1 : entries[i - 1].score === score ? entries[i - 1].rank : i + 1,
      score,
      points: pointsForRank(i + 1),
      timestamp: new Date(NOW - Math.floor(local() * 900) * DAY).toISOString(),
      // Sample data has no real videos or renders; the UI shows its empty states.
      youtubeId: null,
      autorenderId: null,
      demoId: local() < 0.7 ? 1000 + i : null,
      note: local() < 0.2 ? "gg" : null,
      players: partner ? [player, partner] : [player],
    });
  }
  return entries;
}

const boardCache = {};
export function mockBoard(mapId, game = "portal2") {
  const map = getMap(mapId, game);
  if (!map) return [];
  const key = `${game}:${mapId}`;
  if (!boardCache[key]) boardCache[key] = buildBoard(map);
  return boardCache[key];
}

export function mockPreviews(mode) {
  const out = {};
  for (const chapter of chaptersFor(mode)) {
    for (const map of chapter.maps) out[map.id] = mockBoard(map.id, map.game).slice(0, 7);
  }
  return out;
}

export function mockWrHistory(mapId, game = "portal2") {
  const board = mockBoard(mapId, game);
  const wr = board[0]?.score ?? 1000;
  const local = mulberry32(Number(mapId) + 7);
  const points = [];
  let score = wr + 200 + Math.floor(local() * 300);
  let t = new Date(game === "mel" ? "2016-01-01" : "2014-06-01").getTime();
  while (score > wr) {
    points.push({ timestamp: new Date(t).toISOString(), score, player: pick(PLAYERS).name });
    score -= 5 + Math.floor(local() * 60);
    t += (40 + local() * 220) * DAY;
  }
  points.push({ timestamp: new Date(Math.min(t, NOW - 20 * DAY)).toISOString(), score: wr, player: board[0].players[0].name });
  return points;
}

// --- changelog --------------------------------------------------------------

const SEGMENT_NAMES = ["Door Trigger", "Button", "Cube Grab", "Portal Placed", "Fling", "Exit"];

function sampleSegments(score) {
  const ticks = Math.round((score / 100) * 60);
  const each = Math.floor(ticks / SEGMENT_NAMES.length);
  let totalTicks = 0;
  return SEGMENT_NAMES.map((name, s) => {
    const segTicks = s === SEGMENT_NAMES.length - 1 ? ticks - each * s : each;
    totalTicks += segTicks;
    return { name, ticks: segTicks, seconds: segTicks / 60, totalTicks, total: totalTicks / 60, splits: [] };
  });
}

function buildChangelog(game) {
  const maps = game === "mel" ? melMaps : allMaps;
  const local = mulberry32(game === "mel" ? 4242 : 42);
  const out = [];
  for (let i = 0; i < 160; i++) {
    const map = maps[Math.floor(local() * maps.length)];
    const board = mockBoard(map.id, game);
    const idx = Math.floor(local() * 30);
    const entry = board[idx];
    const preRank = local() < 0.15 ? null : idx + 1 + 1 + Math.floor(local() * 20);
    out.push({
      id: (game === "mel" ? 9000 : 50000) - i,
      game,
      timestamp: new Date(NOW - Math.floor(i * i * 0.8 + local() * 30) * 60 * 1000).toISOString(),
      map,
      score: entry.score,
      preRank,
      postRank: idx + 1,
      scoreDelta: preRank == null ? null : -(5 + Math.floor(local() * 60)),
      pointsDelta: preRank == null ? Math.round(pointsForRank(idx + 1)) : Math.round(pointsForRank(idx + 1) - pointsForRank(preRank)),
      players: entry.players,
      youtubeId: null,
      autorenderId: null,
      demoId: entry.demoId,
      note: local() < 0.3 ? "Finally got the cube boost" : null,
      verified: local() > 0.12,
      sarVersion: "1.12.8",
      segments: sampleSegments(entry.score),
    });
  }
  return out;
}

const changelogCache = {};
export function mockChangelog({ search = "", profileNumber, mapId, game = "portal2", mode, wr, video, demo, banned = "hide" } = {}) {
  if (!changelogCache[game]) changelogCache[game] = buildChangelog(game);
  const q = (search || "").trim().toLowerCase();
  return changelogCache[game].filter((e) => {
    if (profileNumber && !e.players.some((p) => p.profileNumber === profileNumber)) return false;
    if (mapId && e.map.id !== String(mapId)) return false;
    if ((mode === "sp" || mode === "coop") && e.map.mode !== mode) return false;
    if (wr && e.postRank !== 1) return false;
    if (video && !e.youtubeId) return false;
    if (demo && !e.demoId) return false;
    if (banned === "only") return false;
    if (!q) return true;
    return e.map.title.toLowerCase().includes(q) || e.players.some((p) => p.name.toLowerCase().includes(q));
  });
}

export function mockActivity() {
  const local = mulberry32(99);
  const days = [];
  for (let d = 730; d >= 0; d--) {
    days.push({ date: new Date(NOW - d * DAY).toISOString().slice(0, 10), count: 2 + Math.floor(local() * 18) });
  }
  return days;
}

// --- aggregated --------------------------------------------------------------

const KIND_MAPS = {
  sp: () => mapsForMode("sp"),
  coop: () => mapsForMode("coop"),
  overall: () => allMaps,
  story: () => mapsForMode("story"),
  advanced: () => mapsForMode("advanced"),
  "mel-overall": () => melMaps,
};

export function mockAggregated(kind) {
  const chapterId = /^chapter-(\d+)$/.exec(kind)?.[1];
  const maps = chapterId ? p2ChapterByDbId(chapterId)?.maps || [] : KIND_MAPS[kind]();
  const totals = {};
  for (const map of maps) {
    for (const entry of mockBoard(map.id, map.game)) {
      for (const player of entry.players) {
        const t = (totals[player.profileNumber] ||= { player, points: 0, score: 0, numScores: 0 });
        if (t.seen?.[map.id]) continue;
        (t.seen ||= {})[map.id] = true;
        t.points += entry.points;
        t.score += entry.score;
        t.numScores += 1;
      }
    }
  }
  const rows = Object.values(totals).map(({ seen, ...r }) => r);
  const byPoints = [...rows].sort((a, b) => b.points - a.points);
  const byTime = rows.filter((r) => r.numScores >= maps.length).sort((a, b) => a.score - b.score);
  return { points: byPoints, times: byTime, mapCount: maps.length };
}

// --- profile -----------------------------------------------------------------

// Per-map results for one player: { [mapId]: { map, rank, score, ... } }.
export function mockScores(profileNumber, game = "portal2") {
  const scores = {};
  for (const map of game === "mel" ? melMaps : allMaps) {
    const board = mockBoard(map.id, game);
    const idx = board.findIndex((e) => e.players.some((p) => p.profileNumber === profileNumber));
    if (idx === -1) continue;
    const entry = board[idx];
    const next = board[idx - 1];
    scores[map.id] = {
      map,
      rank: entry.rank,
      score: entry.score,
      timestamp: entry.timestamp,
      deltaNext: next ? entry.score - next.score : null,
      deltaWr: entry.score - board[0].score,
      points: entry.points,
      youtubeId: entry.youtubeId,
      autorenderId: entry.autorenderId,
      changelogId: entry.changelogId,
      demoId: entry.demoId,
      partner: entry.players.find((p) => p.profileNumber !== profileNumber) || null,
    };
  }
  return scores;
}

export function mockMelProfile(profileNumber) {
  const player = getMockPlayer(profileNumber);
  return { scores: mockScores(player.profileNumber, "mel"), history: mockChangelog({ profileNumber: player.profileNumber, game: "mel" }) };
}

export function mockProfile(profileNumber) {
  const player = getMockPlayer(profileNumber);
  const local = mulberry32(Number(player.profileNumber.slice(-6)));
  const scores = mockScores(player.profileNumber);
  const rankIn = (list) => list.findIndex((r) => r.player.profileNumber === player.profileNumber) + 1;
  const pointsIn = (list) => list.find((r) => r.player.profileNumber === player.profileNumber)?.points ?? 0;
  const sp = mockAggregated("sp");
  const coop = mockAggregated("coop");
  const overall = mockAggregated("overall");
  const values = Object.values(scores);
  const avg = (mode) => {
    const list = values.filter((s) => mode === "overall" || s.map.mode === mode);
    return list.length ? list.reduce((a, s) => a + s.rank, 0) / list.length : null;
  };
  const sorted = [...values].sort((a, b) => a.rank - b.rank);
  const byDate = [...values].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return {
    player: {
      ...player,
      badges: [
        { label: "Professional", tone: "teal" },
        { label: "Developer", tone: "red" },
      ],
      twitch: player.name.toLowerCase(),
      youtube: player.name,
      steam: player.profileNumber,
    },
    points: { sp: pointsIn(sp.points), coop: pointsIn(coop.points), overall: pointsIn(overall.points) },
    globalRank: { sp: rankIn(sp.points), coop: rankIn(coop.points), overall: rankIn(overall.points), country: 1 + Math.floor(local() * 4) },
    averagePlace: { sp: avg("sp"), coop: avg("coop"), overall: avg("overall") },
    worldRecords: {
      sp: values.filter((s) => s.map.mode === "sp" && s.rank === 1).length,
      coop: values.filter((s) => s.map.mode === "coop" && s.rank === 1).length,
    },
    newest: byDate[byDate.length - 1] || null,
    oldest: byDate[0] || null,
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null,
    scores,
    history: mockChangelog({ profileNumber: player.profileNumber }),
  };
}
