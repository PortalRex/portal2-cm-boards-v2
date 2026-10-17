// Data access for the boards. Everything comes from the v2 Rust web server
// (REACT_APP_API_URL), which hosts both Portal 2 and Portal Stories: Mel; Mel
// requests carry `game_id`. If the server can't be reached, or
// REACT_APP_USE_MOCK=true, the deterministic sample data in ./mock is used so the
// UI can be developed without a database.
import { GAMES, findMap, gameForMode, getMap, isMultiplayerMode, mapsForGame, mapsForMode, p2ChapterByDbId } from "../data/maps";
import { countryById } from "../data/countries";
import { API_BASE, GAME_IDS } from "./config";
import { getJson as get, withFallback } from "./http";
import * as mock from "./mock";
import { formatSegments } from "./autorender";
import { parseTimestamp } from "../lib/format";

export { API_BASE };

const getJson = (path, params) => get(API_BASE, path, params);
const gameParam = (game) => (game && game !== "portal2" && GAME_IDS[game] ? { game_id: GAME_IDS[game] } : {});
const sample = (live, fallback) => withFallback("api", live, fallback);

// Map ids are Steam leaderboard ids for Portal 2 and board ids (1-44) for Mel.
const lookupMap = (id, game) => getMap(String(id), game) || findMap(id);

// --- adapters ----------------------------------------------------------------

const player = (profileNumber, name, avatar) => ({ profileNumber, name: name || "Unknown", avatar: avatar || null });

// Unpaired co-op runs are bundled with a filler user ("N/A") in the database; they show an
// "Unknown partner" with a default picture (no profile to link to).
const FILLER = "N/A";
const unknownPartner = () => ({ profileNumber: null, name: "Unknown partner", avatar: `${process.env.PUBLIC_URL || ""}/unknown-partner.svg`, unknown: true });
const realPlayers = (players) => players.map((p) => (p.profileNumber === FILLER || p.name === FILLER ? unknownPartner() : p));

function adaptChangelog(row, game) {
  const isCoop = row.coop_id != null && (row.blue_name || row.orange_name);
  // Co-op players come blue (host) first, orange second.
  const players = isCoop
    ? realPlayers([
        player(row.blue_profile_number ?? null, row.blue_name, row.blue_avatar),
        player(row.orange_profile_number ?? null, row.orange_name, row.orange_avatar),
      ])
    : [player(row.profile_number, row.user_name, row.avatar)];
  // Older servers don't send the co-op profile numbers; the submitter is one of the two players.
  players.forEach((p) => {
    if (!p.profileNumber && p.name === row.user_name) p.profileNumber = row.profile_number;
  });
  const map = lookupMap(row.map_id, game) || { id: row.map_id, title: row.map_name, chapter: "", mode: isCoop ? "coop" : "sp", game };
  return {
    id: row.id,
    game: map.game || game,
    timestamp: row.timestamp,
    map,
    score: row.score,
    preRank: row.pre_rank,
    postRank: row.post_rank,
    scoreDelta: row.score_delta,
    // Points on the map after the run minus before (pending and banned runs give none).
    pointsDelta:
      row.post_rank != null && row.verified !== false && !row.banned
        ? Math.round(mock.pointsForRank(row.post_rank) - (row.pre_rank != null ? mock.pointsForRank(row.pre_rank) : 0))
        : null,
    players,
    // Whose half of the run this row is (for co-op, the player who set a PB with it).
    submitter: row.profile_number,
    youtubeId: row.youtube_id,
    autorenderId: row.autorender_id ?? null,
    demoId: row.demo_id,
    portals: row.portals ?? null,
    note: row.note,
    verified: row.verified !== false,
    banned: !!row.banned,
    coopId: isCoop ? row.coop_id : null,
    reactionsUp: row.reactions_up ?? 0,
    reactionsDown: row.reactions_down ?? 0,
    rolesKnown: isCoop ? row.coop_roles_known !== false : null,
    sarVersion: row.sar_version ?? null,
    // The old board had no date: estimated from the runs around it.
    dateEstimated: Boolean(row.date_estimated),
    segments: null,
  };
}

function adaptSpRanked(row) {
  const d = row.map_data;
  return {
    changelogId: d.cl_id ?? null,
    rank: row.rank,
    score: d.score,
    points: row.points,
    timestamp: d.timestamp,
    youtubeId: d.youtube_id,
    autorenderId: d.autorender_id ?? null,
    demoId: d.demo_id,
    note: d.note,
    portals: d.portals ?? null,
    sarVersion: d.sar_version ?? null,
    players: [player(d.profile_number, d.user_name, d.avatar)],
  };
}

function adaptCoopRanked(row) {
  const d = row.map_data;
  return {
    changelogId: d.cl_id1 ?? d.cl_id2 ?? null,
    changelogIds: [d.cl_id1, d.cl_id2],
    coopId: d.coop_id ?? null,
    rolesKnown: d.p1_is_host != null,
    rank: row.rank,
    score: d.score,
    points: row.points,
    timestamp: d.timestamp,
    youtubeId: d.youtube_id1 || d.youtube_id2,
    autorenderId: d.autorender_id1 || d.autorender_id2 || null,
    demoId: d.demo_id1 || d.demo_id2,
    note: d.note1 || d.note2,
    // Each half's own are shown once the halves load (RunDetails); these cover the moment before.
    portals: d.portals1 ?? d.portals2 ?? null,
    sarVersion: d.sar_version1 || d.sar_version2 || null,
    players: realPlayers(hostFirst(d, [player(d.profile_number1, d.user_name1, d.avatar1), player(d.profile_number2, d.user_name2, d.avatar2)])),
  };
}

// Co-op players are shown blue (host) first, orange second. p1_is_host is false when the
// second player hosted; when it's unknown the stored order is kept.
const hostFirst = (row, [first, second]) => (row.p1_is_host === false ? [second, first] : [first, second]);

function adaptPreview(row) {
  const coop = "user_name1" in row;
  return {
    score: row.score,
    youtubeId: coop ? row.youtube_id1 || row.youtube_id2 : row.youtube_id,
    autorenderId: row.autorender_id ?? null,
    demoId: null,
    players: coop
      ? realPlayers([player(row.profile_number1, row.user_name1), player(row.profile_number2, row.user_name2)])
      : [player(row.profile_number, row.user_name)],
  };
}

function adaptPoints(wrapper, mapCount) {
  const rows = (wrapper?.points || []).map(([profileNumber, p]) => ({
    player: { ...player(profileNumber, p.user_name, p.avatar), country: countryById(p.country_id)?.code || null },
    points: p.points,
    score: p.score,
    numScores: p.num_scores,
  }));
  const points = [...rows].sort((a, b) => b.points - a.points);
  const times = rows.filter((r) => r.numScores >= mapCount).sort((a, b) => a.score - b.score);
  return { points, times, mapCount };
}

// --- public API ----------------------------------------------------------------

// Feed filters (all optional):
//   mode    "sp" | "coop" on the server for Portal 2; "story" | "advanced" are filtered here (Mel)
//   wr      only runs that took the world record
//   video   only runs with a YouTube video;  demo  only runs with a demo
//   pending only runs waiting for verification
//   banned  "hide" (default) | "show" | "only"
const toggle = (on) => (on ? true : undefined);

export function fetchChangelog({ search, profileNumber, mapId, limit = 200, game = "portal2", mode, wr, video, demo, pending, banned = "hide", rank, days } = {}) {
  const filters = { mode, wr, video, demo, pending, banned };
  const multiplayer = mode ? isMultiplayerMode(mode) : undefined;
  const byMode = (entries) => (mode && mode !== "sp" && mode !== "coop" ? entries.filter((e) => e.map.mode === mode) : entries);
  return sample(
    async () => {
      const rows = await getJson("/changelog", {
        limit,
        nick_name: search || undefined,
        profile_number: profileNumber,
        chamber: mapId,
        sp: multiplayer ? false : undefined,
        coop: multiplayer === false ? false : multiplayer ? true : undefined,
        wr_gain: toggle(wr),
        yt: toggle(video),
        has_demo: toggle(demo),
        verified: pending ? false : undefined,
        banned: banned === "only" ? true : banned === "show" ? undefined : false,
        max_rank: rank || undefined,
        since_days: days || undefined,
        ...gameParam(game),
      });
      return byMode(rows.map((r) => adaptChangelog(r, game)));
    },
    () => byMode(mock.mockChangelog({ search, profileNumber, mapId, game, ...filters })),
  );
}

// --- Steam sign-in ---------------------------------------------------------------
// The API is served from the site's own origin (/api), so the session cookie goes along
// with these requests automatically.

const apiUrl = (path) => new URL(API_BASE + path, window.location.origin).toString();

// Where the Sign in button goes; Steam sends the browser back to `returnTo` afterwards.
export const steamLoginUrl = (returnTo) => `${apiUrl("/auth/steam/login")}?return=${encodeURIComponent(returnTo)}`;

// Countries: your own (by hand, or from your public Steam profile), anyone's for staff, and
// per-country stats from a Portal 2 points board ("overall", "sp" or "coop").
export const fetchUser = (profileNumber) => getJson(`/user/${profileNumber}`);
export const setMyCountry = (countryId) => sendJson("PUT", "/user/country", { country_id: countryId });
export const setMyCountryFromSteam = () => sendJson("POST", "/user/country/steam");
export const adminSetCountry = (profileNumber, countryId, reason) => sendJson("PUT", `/admin/users/${profileNumber}/country`, { country_id: countryId, reason });
export const fetchCountryStats = (board = "overall") =>
  getJson("/countries/stats", { board }).then((rows) =>
    rows.map((c) => ({
      country: countryById(c.country_id),
      players: c.players,
      points: c.points,
      top: c.top.map((t) => ({ player: player(t.profile_number, t.user_name, t.avatar), points: t.points })),
    })),
  );

// About the site: { private } (staff-only mode).
export const fetchSite = () => getJson("/site");

// The signed-in user, or null.
export async function fetchMe() {
  const me = await getJson("/auth/me");
  return me && { profileNumber: me.profile_number, name: me.user_name, avatar: me.avatar, admin: me.admin, role: me.role || null, banned: me.banned };
}

export async function logout() {
  await fetch(apiUrl("/auth/logout"), { method: "POST" });
}

async function send(method, path, body) {
  const res = await fetch(apiUrl(path), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) throw new Error("Sign in required.");
  if (res.status === 403) throw new Error((await res.text()) || "Not allowed.");
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
}

// Banned players for the Wall of Shame, sorted by name.
export function fetchWallOfShame() {
  return sample(
    async () =>
      (await getJson("/wall_of_shame"))
        .map((u) => player(u.profile_number, u.user_name, u.avatar))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    () => mock.PLAYERS.slice(-3).map((p) => ({ ...p })),
  );
}

// Everyone who has donated to the boards, biggest total first: { ...player, amount } (dollars).
export function fetchDonators() {
  return sample(
    async () =>
      (await getJson("/donators"))
        .map((u) => ({ ...player(u.profile_number, u.board_name || u.steam_name, u.avatar), amount: Number.parseFloat(u.donation_amount) || 0 }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    () => mock.PLAYERS.slice(0, 5).map((p, i) => ({ ...p, amount: 50 - i * 10 })),
  );
}

// A player's Portal 2 personal bests ({ map_id, score, rank, timestamp, ... }), or [] when
// the server doesn't have the endpoint.
export const fetchProfileScores = (profileNumber) => getJson(`/profile/scores/${profileNumber}`).catch(() => []);

// Admin: record which player of a co-op run hosted (played blue); `host` null = unknown.
export const setCoopHost = (coopId, host) => send("PUT", `/coop/${coopId}/host`, { host });

// --- Admin actions (each one is written to the audit log) ---------------------------
export const setRunBanned = (changelogId, banned, reason) => send("PUT", `/admin/runs/${changelogId}/banned`, { banned, reason });
export const deleteRun = (changelogId, reason) => send("DELETE", `/admin/runs/${changelogId}`, { reason });
export const removeRunDemo = (changelogId, reason) => send("DELETE", `/admin/runs/${changelogId}/demo`, { reason });
export const setRunPartner = (changelogId, steamId, reason) => send("PUT", `/admin/runs/${changelogId}/partner`, { steam_id: steamId, reason });
// Staff: override the name / picture shown for a profile. name: string, or null for the Steam
// name (omit to leave it); avatar: "default", "steam" or an https address (omit to leave it).
export const setProfileDisplay = (profileNumber, changes, reason) => send("PUT", `/admin/users/${profileNumber}/display`, { ...changes, reason });
export const setProfileBanned = (profileNumber, banned, reason) => send("PUT", `/admin/users/${profileNumber}/banned`, { banned, reason });
export const setProfileFrozen = (profileNumber, frozen, reason) => send("PUT", `/admin/users/${profileNumber}/freeze`, { frozen, reason });
export const setProfileRole = (profileNumber, role, reason) => send("PUT", `/admin/users/${profileNumber}/role`, { role, reason });
export const setRunVerified = (changelogId, verified, reason) => send("PUT", `/admin/runs/${changelogId}/verified`, { verified, reason });
export const setRunWrHidden = (changelogId, hidden, reason) => send("PUT", `/admin/runs/${changelogId}/wr_history`, { hidden, reason });

// Staff: every WR on a map, including runs removed from the history, newest first.
export async function fetchWrHistoryForStaff(map) {
  const rows = await getJson("/changelog", { chamber: map.id, wr_gain: true, include_hidden_wr: true, ...gameParam(map.game) });
  return rows.map((r) => ({ ...adaptChangelog(r, map.game), wrHidden: !!r.wr_hidden }));
}

// The audit log, newest first: [{ id, admin_name, via_service, action, target_type, target_id, reason, details, created_at }].
export const fetchAudit = (params) => getJson("/admin/audit", params);
// Admins: the background jobs (Steam sync, old-board pull, demo parsing) with their schedule and
// last run, and running one now (`key` is the job's endpoint; `query` e.g. "dry_run=true").
export const fetchJobs = () => getJson("/admin/jobs");
export const runJob = (key, query = "") => sendJson("POST", `/admin/${key}?${query ? `${query}&` : ""}background=true`);
// Staff inbox: { unread, seen_id, items } (items as in the audit log); mark read up to an entry.
export const fetchStaffInbox = () => getJson("/admin/inbox");
export const markStaffInboxSeen = (id) => send("PUT", "/admin/inbox/seen", { id });
// Live staff inbox: resolves true once there's something new after entry `after` (or the inbox
// was read elsewhere), false after about 25 s of nothing; then ask again.
export const waitStaffInbox = async (after, seen, signal) => {
  const params = new URLSearchParams({ after: String(after || 0) });
  if (seen != null) params.set("seen", String(seen));
  const res = await fetch(`${API_BASE}/admin/inbox/wait?${params}`, { credentials: "include", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 200;
};

// Both players' halves of a co-op run, blue (host) first when known. A half without a run
// of its own has changelogId null.
export async function fetchCoopHalves(coopId) {
  const halves = await getJson(`/coop/${coopId}/halves`);
  return halves.map((h) => ({
    player: h.profile_number ? player(h.profile_number, h.user_name, h.avatar) : null,
    isHost: h.is_host,
    changelogId: h.changelog_id,
    score: h.score,
    timestamp: h.timestamp,
    note: h.note,
    youtubeId: h.youtube_id,
    autorenderId: h.autorender_id,
    demoId: h.demo_id,
    hasSegments: h.has_segments,
    portals: h.portals ?? null,
    sarVersion: h.sar_version ?? null,
  }));
}

// Staff: who reacted to a run now ({ current }) and the latest changes ({ history }); each
// entry { profile_number, user_name, avatar, reaction (1, -1, null = cleared), created_at }.
export const fetchReactionRecord = (changelogId) => getJson(`/admin/runs/${changelogId}/reactions`);

// Staff-only notes on a run, oldest first: [{ id, author, author_name, avatar, body, created_at }].
export const fetchStaffNotes = (changelogId) => getJson(`/admin/runs/${changelogId}/notes`);
export const addStaffNote = (changelogId, body) => sendJson("POST", `/admin/runs/${changelogId}/notes`, { body });
export const deleteStaffNote = (noteId) => sendJson("DELETE", `/admin/runs/notes/${noteId}`);

// The signed-in viewer's reactions on several runs: { [changelogId]: 1 | -1 }.
export const fetchMyReactions = (ids) => (ids.length ? getJson("/runs/reactions/mine", { ids: ids.join(",") }) : Promise.resolve({}));

// Thumbs up / down on a run: { up, down, mine } with mine 1, -1 or null.
export const fetchReactions = (changelogId) => getJson(`/runs/${changelogId}/reactions`);

export async function setReaction(changelogId, reaction) {
  const res = await fetch(apiUrl(`/runs/${changelogId}/reaction`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction }),
  });
  if (res.status === 401) throw new Error("Sign in to react.");
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res.json();
}

// A run's mtrigger segments, formatted for display (null when it has none). A co-op run
// has a changelog entry per player; autorender rendered one of them.
export async function fetchSegments(run) {
  if (run.segments) return run.segments; // sample data ships its own
  const ids = (run.changelogIds || [run.changelogId ?? run.id]).filter((id) => id != null);
  for (const id of ids) {
    const segments = await getJson(`/changelog/${id}/segments`);
    if (segments?.length) return formatSegments(segments, run.map.title);
  }
  return null;
}

// Runs per day, counted in the viewer's own days.
export function fetchActivity() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return sample(
    async () =>
      (await getJson("/graph", tz ? { tz } : {}))
        .filter((g) => g.date)
        .map((g) => ({ date: g.date.slice(0, 10), count: g.count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    () => mock.mockActivity(),
  );
}

// Top 7 per map, from /coop for co-op boards and /sp for the rest.
export function fetchMapPreviews(mode) {
  return sample(
    async () => {
      const groups = await getJson(isMultiplayerMode(mode) ? "/coop" : "/sp", gameParam(gameForMode(mode)));
      const wanted = new Set(mapsForMode(mode).map((m) => m.id));
      const out = {};
      groups.forEach((group) => {
        if (group.length && wanted.has(String(group[0].map_id))) out[group[0].map_id] = group.slice(0, 7).map(adaptPreview);
      });
      return out;
    },
    () => mock.mockPreviews(mode),
  );
}

// A map's board, or as it stood at `at` (a UTC time, "2021-04-06T12:00:00", or a day).
export function fetchMapBoard(map, at = null) {
  return sample(
    async () => {
      const coop = isMultiplayerMode(map.mode);
      const rows = await getJson(`/map/${coop ? "coop" : "sp"}/${map.id}`, { ...gameParam(map.game), ...(at ? { at } : {}) });
      return rows.map(coop ? adaptCoopRanked : adaptSpRanked);
    },
    () => mock.mockBoard(map.id, map.game),
  );
}

export function fetchWrHistory(map) {
  return sample(
    async () => {
      const rows = await getJson("/changelog", { chamber: map.id, wr_gain: true, ...gameParam(map.game) });
      return rows
        .filter((r) => !r.banned)
        .map((r) => ({ timestamp: r.timestamp, score: r.score, player: r.user_name }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },
    () => mock.mockWrHistory(map.id, map.game),
  );
}

// kind: overall | sp | coop (Portal 2), story | advanced | mel-overall (Mel), chapter-<id>.
const POINTS = {
  overall: ["portal2", "overall", 108],
  sp: ["portal2", "sp", 60],
  coop: ["portal2", "coop", 48],
  story: ["mel", "story", 22],
  advanced: ["mel", "advanced", 18],
  "mel-overall": ["mel", "overall", 40],
};

// "chapter-<id>" is one Portal 2 chapter (database chapter id, see chapterDbId);
// "game:<game>:<board>" is any game's board ("overall" or one of its modes).
function pointsBoard(kind) {
  const generic = /^game:([^:]+):(.+)$/.exec(kind);
  if (generic) {
    const [, game, board] = generic;
    const maps = board === "overall" ? mapsForGame(game) : mapsForMode(board);
    // The server keys boards by the chapters' game_mode; built-in games use the mode itself.
    const serverBoard = board === "overall" ? "overall" : board.startsWith(`${game}-`) ? board.slice(game.length + 1) : board;
    return [game, serverBoard, maps.length];
  }
  const chapterId = /^chapter-(\d+)$/.exec(kind)?.[1];
  if (!chapterId) return POINTS[kind];
  return ["portal2", `chapter-${chapterId}`, p2ChapterByDbId(chapterId)?.maps.length ?? 0];
}

// Boards come from the server's points cache (computed from the changelog, refreshed when runs change).
export function fetchAggregated(kind) {
  const [game, board, mapCount] = pointsBoard(kind);
  return sample(
    async () => adaptPoints(await getJson(`/points/game/${GAME_IDS[game]}/${board}`), mapCount),
    () => mock.mockAggregated(kind),
  );
}

export async function fetchProfile(profileNumber) {
  const profile = await sample(
    async () => {
      const [page, user, history, pbs] = await Promise.all([
        getJson(`/profile/${profileNumber}`),
        getJson(`/user/${profileNumber}`),
        getJson("/changelog", { profile_number: profileNumber, limit: 5000 }),
        // Older servers don't have this endpoint; times and deltas are then left blank.
        getJson(`/profile/scores/${profileNumber}`).catch(() => []),
      ]);
      return adaptProfile(profileNumber, page, user, history.map((r) => adaptChangelog(r, "portal2")), pbs);
    },
    () => mock.mockProfile(profileNumber),
  );
  return profile;
}

// A player's peak points per board ({ sp, coop, overall: { points, date } }), or {} when unknown.
export const fetchPointsPeak = (profileNumber) => getJson(`/profile/points_peak/${profileNumber}`).catch(() => ({}));

// Where a player stood on a past day (YYYY-MM-DD): { points, places, maps: [...] } from the server.
export const fetchProfileAt = (profileNumber, at) => getJson(`/profile/at/${profileNumber}`, { at });

// The profile as it was on a past day: points, places and best times then (from fetchProfileAt).
// Runs after that day are left out of its history.
export function profileAsOf(profile, past, at) {
  const me = profile.player.profileNumber;
  const end = `${at}T23:59:59Z`;
  const history = profile.history.filter((h) => !h.timestamp || parseTimestamp(h.timestamp) <= new Date(end));
  const byId = Object.fromEntries(profile.history.map((h) => [h.id, h]));
  const scores = {};
  (past.maps || []).forEach((m) => {
    const map = getMap(m.map_id);
    if (!map) return;
    const h = byId[m.changelog_id];
    scores[m.map_id] = {
      map,
      rank: m.rank,
      score: m.score,
      timestamp: m.timestamp,
      points: m.points,
      deltaNext: null,
      deltaWr: null,
      youtubeId: h?.youtubeId ?? null,
      changelogId: m.changelog_id,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      partner: h?.players.find((p) => p.profileNumber !== me) || null,
    };
  });
  const values = Object.values(scores);
  const avg = (mode) => {
    const list = values.filter((s) => mode === "overall" || s.map.mode === mode);
    return list.length ? list.reduce((a, s) => a + s.rank, 0) / list.length : null;
  };
  const sorted = [...values].sort((a, b) => a.rank - b.rank);
  const dated = history.filter((h) => h.timestamp && !h.banned).sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));
  const brief = (h) => h && { map: h.map, score: h.score, timestamp: h.timestamp };
  return {
    ...profile,
    asOf: at,
    points: { sp: past.points?.sp ?? 0, coop: past.points?.coop ?? 0, overall: past.points?.overall ?? 0 },
    globalRank: { sp: past.places?.sp ?? null, coop: past.places?.coop ?? null, overall: past.places?.overall ?? null, country: past.country_place ?? null },
    averagePlace: { sp: avg("sp"), coop: avg("coop"), overall: avg("overall") },
    worldRecords: {
      sp: values.filter((s) => s.map.mode === "sp" && s.rank === 1).length,
      coop: values.filter((s) => s.map.mode === "coop" && s.rank === 1).length,
    },
    newest: brief(dated[dated.length - 1]) || null,
    oldest: brief(dated[0]) || null,
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null,
    scores,
    history,
  };
}

// A player's real points over time (ranks recomputed against everyone's bests at each date),
// from the server; falls back to the rough client-side rebuild below on sample data.
export function fetchPointsHistory(profileNumber, fallbackHistory) {
  return sample(
    async () =>
      (await getJson(`/profile/points_history/${profileNumber}`)).map((p) => ({
        date: p.date,
        sp: Math.round(p.sp ?? 0),
        coop: Math.round(p.coop ?? 0),
        overall: Math.round(p.overall ?? 0),
      })),
    () => pointsHistory(fallbackHistory),
  );
}

// Points over time rebuilt from the player's own submissions: each run sets the
// player's rank on that map to the run's rank at the time (later displacement by
// other players isn't recorded, so this is an approximation). One point per day.
export function pointsHistory(history) {
  const current = {};
  const byDay = new Map();
  [...(history || [])]
    .filter((h) => h.timestamp && !h.banned && h.verified && (h.map.mode === "sp" || h.map.mode === "coop"))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((h) => {
      current[h.map.id] = { mode: h.map.mode, points: h.postRank ? mock.pointsForRank(h.postRank) : 0 };
      const totals = { sp: 0, coop: 0 };
      Object.values(current).forEach((c) => {
        totals[c.mode] += c.points;
      });
      const day = String(h.timestamp).slice(0, 10);
      byDay.set(day, { date: day, sp: Math.round(totals.sp), coop: Math.round(totals.coop), overall: Math.round(totals.sp + totals.coop) });
    });
  return [...byDay.values()];
}

// A player's results in a game other than Portal 2 (Mel, seasons) for its profile tab:
// { scores, history }.
export function fetchGameProfile(profileNumber, game) {
  return sample(
    async () => {
      const [ranks, history] = await Promise.all([
        getJson(`/ranks/game/${GAME_IDS[game] ?? GAMES[game]?.dbId}/${profileNumber}`),
        getJson("/changelog", { profile_number: profileNumber, limit: 500, ...gameParam(game) }),
      ]);
      const entries = history.map((r) => adaptChangelog(r, game));
      return { scores: scoresFromRanks(profileNumber, ranks, entries, game), history: entries };
    },
    () => (game === "mel" ? mock.mockMelProfile(profileNumber) : { scores: {}, history: [] }),
  );
}

export const fetchMelProfile = (profileNumber) => fetchGameProfile(profileNumber, "mel");

// Combines ProfilePage.ranks ({ map_id: rank }) with the player's latest run per map.
function scoresFromRanks(profileNumber, ranks, history, game) {
  const latest = {};
  history.forEach((h) => {
    if (!latest[h.map.id] || new Date(h.timestamp) > new Date(latest[h.map.id].timestamp)) latest[h.map.id] = h;
  });
  const scores = {};
  Object.entries(ranks || {}).forEach(([mapId, rank]) => {
    const map = getMap(mapId, game);
    if (!map) return;
    const h = latest[mapId];
    scores[mapId] = {
      map,
      rank,
      score: h?.score ?? null,
      timestamp: h?.timestamp ?? null,
      deltaNext: null,
      deltaWr: null,
      points: mock.pointsForRank(rank),
      youtubeId: h?.youtubeId ?? null,
      changelogId: h?.id ?? null,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      partner: h?.players.find((p) => p.profileNumber !== profileNumber) || null,
    };
  });
  return scores;
}

// Personal bests from /profile/scores fill in times and deltas; maps where the player
// is outside the ranked results get an entry without a rank.
function mergePbs(scores, pbs, history, me) {
  const byId = Object.fromEntries(history.map((h) => [h.id, h]));
  (pbs || []).forEach((pb) => {
    const map = getMap(pb.map_id);
    if (!map) return;
    const h = byId[pb.changelog_id];
    const s = scores[pb.map_id] || {
      map,
      rank: pb.rank ?? null,
      points: pb.rank ? mock.pointsForRank(pb.rank) : null,
      youtubeId: h?.youtubeId ?? null,
      changelogId: pb.changelog_id,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      portals: h?.portals ?? null,
      sarVersion: h?.sarVersion ?? null,
      partner: null,
    };
    // The run's own details come from the best run itself, not the latest run on the map (a
    // later, slower or banned run would otherwise lend it its partner, demo and video).
    const run = h
      ? {
          changelogId: h.id,
          youtubeId: h.youtubeId ?? null,
          autorenderId: h.autorenderId ?? null,
          demoId: h.demoId ?? null,
          note: h.note ?? null,
          portals: h.portals ?? null,
          sarVersion: h.sarVersion ?? null,
          dateEstimated: h.dateEstimated,
          partner: h.players.find((p) => p.profileNumber !== me) || null,
        }
      : { changelogId: pb.changelog_id };
    scores[pb.map_id] = { ...s, ...run, score: pb.score, timestamp: pb.timestamp, deltaWr: pb.delta_to_wr ?? null, deltaNext: pb.delta_to_next ?? null };
  });
  return scores;
}

const ROLE_BADGES = { verifier: "Verifier", moderator: "Moderator", admin: "Admin" };

// The old boards kept a player's titles in one field ("Original Developer, Donator").
const splitTitles = (title) =>
  (title || "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

// ProfilePage.points holds one entry per points id: -1 sp, -2 coop, -3 overall, chapter ids otherwise.
function adaptProfile(profileNumber, page, user, history, pbs) {
  const byId = Object.fromEntries((page.points || []).map((p) => [p.id, p.points]));
  const placeById = Object.fromEntries((page.points || []).map((p) => [p.id, p.place ?? null]));
  const scores = mergePbs(scoresFromRanks(profileNumber, page.ranks, history, "portal2"), pbs, history, profileNumber);
  const values = Object.values(scores).filter((s) => s.rank != null);
  const avg = (mode) => {
    const list = values.filter((s) => mode === "overall" || s.map.mode === mode);
    return list.length ? list.reduce((a, s) => a + s.rank, 0) / list.length : null;
  };
  const sorted = [...values].sort((a, b) => a.rank - b.rank);
  const fromDate = (d) => d && { map: getMap(d.map) || { title: d.map_name }, score: d.score, timestamp: d.timestamp };
  const newest = [page.data?.newest_sp, page.data?.newest_coop].filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  const oldest = [page.data?.oldest_sp, page.data?.oldest_coop].filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  const country = countryById(user.country_id);
  return {
    player: {
      profileNumber,
      name: user.board_name || user.steam_name,
      avatar: user.avatar,
      country: country?.code,
      badges: [
        ...splitTitles(user.title).map((label) => ({ label, tone: "teal" })),
        user.role && { label: ROLE_BADGES[user.role], tone: user.role === "admin" ? "red" : "staff" },
      ].filter(Boolean),
      titles: splitTitles(user.title),
      role: user.role || null,
      twitch: user.twitch,
      youtube: user.youtube,
      banned: !!user.banned,
      steamName: user.steam_name || null,
      nameLocked: !!user.name_locked,
      avatarLocked: !!user.avatar_locked,
      // When their peak points reached Legends (a role kept for good), if they have.
      legendsAt: user.legends_at || null,
      frozen: !!user.frozen,
      frozenReason: user.frozen_reason || null,
      steam: profileNumber,
    },
    points: { sp: byId[-1]?.points ?? 0, coop: byId[-2]?.points ?? 0, overall: byId[-3]?.points ?? 0 },
    globalRank: { sp: placeById[-1], coop: placeById[-2], overall: placeById[-3], country: (page.points || []).find((p) => p.id === -3)?.country_place ?? null },
    averagePlace: { sp: avg("sp"), coop: avg("coop"), overall: avg("overall") },
    worldRecords: {
      sp: values.filter((s) => s.map.mode === "sp" && s.rank === 1).length,
      coop: values.filter((s) => s.map.mode === "coop" && s.rank === 1).length,
    },
    newest: fromDate(newest),
    oldest: fromDate(oldest),
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null,
    scores,
    history,
  };
}

// --- profile stats ----------------------------------------------------------------------

// A player's stats in a game: activity, co-op partners and portal counts from demos.
export async function fetchProfileStats(profileNumber, game = "portal2") {
  const s = await getJson(`/profile/stats/${profileNumber}`, gameParam(game));
  return {
    summary: s.summary,
    uniquePartners: s.unique_partners,
    partners: s.partners.map((p) => ({ player: player(p.profile_number, p.user_name, p.avatar), maps: p.maps, runs: p.runs })),
    fewestPortals: s.fewest_portals.map((f) => ({ map: lookupMap(f.map_id, game), mapName: f.map_name, score: f.score, portals: f.portals })),
  };
}

// Site-wide runner stats for the Stats page (see the server's /stats/site).
export async function fetchSiteStats(game = "portal2") {
  const s = await getJson("/stats/site", gameParam(game));
  const entry = (r) => ({ player: player(r.profile_number, r.user_name, r.avatar), value: r.value });
  return {
    totals: {
      runners: s.totals.runners,
      runs: s.totals.runs,
      worldRecords: s.totals.world_records,
      demos: s.totals.demos,
      rendered: s.totals.rendered,
      maps: s.totals.maps,
      countries: s.totals.countries,
      runsYear: s.totals.runs_year,
      runnersYear: s.totals.runners_year,
    },
    leaders: Object.fromEntries(Object.entries(s.leaders).map(([k, rows]) => [k, rows.map(entry)])),
    longestWrs: s.longest_wrs.map((w) => ({
      mapId: w.map_id,
      map: lookupMap(w.map_id, game),
      mapName: w.map_name,
      isCoop: w.is_coop,
      score: w.score,
      since: w.since,
      players: [player(w.profile_number, w.user_name, w.avatar), w.partner_number ? player(w.partner_number, w.partner_name, w.partner_avatar) : null].filter(Boolean),
    })),
    peaks: Object.fromEntries(
      Object.entries(s.peaks).map(([k, rows]) => [k, rows.map((r) => ({ player: player(r.profile_number, r.user_name, r.avatar), points: r.points, date: r.date, current: r.current }))]),
    ),
  };
}

// World record stats for the Stats page (see the server's /stats/wr).
export async function fetchWrStats(game = "portal2") {
  const s = await getJson("/stats/wr", gameParam(game));
  const pl = (p) => player(p.profile_number, p.user_name, p.avatar);
  const teams = (ts) => (ts || []).map((t) => ({ players: t.players.map(pl), since: t.since }));
  const where = (r) => ({ mapId: r.map_id, map: lookupMap(r.map_id, game), mapName: r.map_name, isCoop: r.is_coop });
  return {
    records: s.records.map((r) => ({ ...where(r), mode: r.mode, score: r.score, since: r.since, days: r.days, teams: teams(r.teams), records: r.records })),
    totalTime: s.total_time,
    holders: s.holders.map((h) => ({ player: pl(h.player), held: h.held, days: h.days, set: h.set })),
    longest: s.longest.map((r) => ({ ...where(r), score: r.score, start: r.start, end: r.end, days: r.days, teams: teams(r.teams), beatenBy: teams(r.beaten_by), beatenWith: r.beaten_with })),
    domination: s.domination.map((r) => ({ ...where(r), player: pl(r.player), start: r.start, end: r.end, days: r.days, records: r.records, fromScore: r.from_score, toScore: r.to_score })),
    improvements: s.improvements.map((r) => ({ ...where(r), fromScore: r.from_score, toScore: r.to_score, delta: r.delta, date: r.date, teams: teams(r.teams), previous: teams(r.previous), previousDays: r.previous_days })),
    race: Object.fromEntries(Object.entries(s.race).map(([k, r]) => [k, { frames: r.frames.map((f) => ({ date: f.date, top: f.top.map(([pn, n]) => ({ profileNumber: pn, held: n })) })) }])),
    racePlayers: Object.fromEntries(Object.entries(s.race_players).map(([k, p]) => [k, pl(p)])),
    endings: s.endings,
    flagged: {
      runs: (s.flagged?.runs || []).map((r) => ({ id: r.id, mapId: r.map_id, map: lookupMap(r.map_id, game), mapName: r.map_name, score: r.score, timestamp: r.timestamp, player: pl(r), postRank: r.post_rank, demoId: r.demo_id, demoScore: r.demo_score, kind: r.kind })),
      counts: s.flagged?.counts || {},
      low49: s.flagged?.low_4_9 || 0,
    },
  };
}

// --- weekly recap ---------------------------------------------------------------

// The top 5 runs of the week containing `day` (a Date; weeks start Monday, UTC).
export async function fetchWeeklyRecap(game, day) {
  const week = day.toISOString().slice(0, 10);
  const data = await getJson("/recap/weekly", { week, ...gameParam(game) });
  return { start: data.start, end: data.end, runs: data.runs.map((r) => adaptChangelog(r, game)) };
}

// The daily chambers (one map per board) for `day` (a Date, UTC) and the runs set on them that day.
export async function fetchDailyChambers(game, day) {
  const date = day.toISOString().slice(0, 10);
  const data = await getJson("/daily", { date, ...gameParam(game) });
  return {
    date: data.date,
    chambers: data.chambers.map((c) => ({
      mode: c.map.game_mode,
      map: lookupMap(c.map.steam_id, game),
      runs: c.runs.map((r) => adaptChangelog(r, game)),
    })),
  };
}

// Download address of a run's demo (by demo id).
export const demoUrl = (demoId) => apiUrl(`/demos/${demoId}/file`);

// --- run submissions ---------------------------------------------------------

async function postForm(path, form) {
  const res = await fetch(apiUrl(path), { method: "POST", body: form });
  if (res.status === 401) throw new Error("Sign in required.");
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res.json();
}

// What a demo contains (map, scoreboard time, players), read by the server.
export function previewDemo(file) {
  const form = new FormData();
  form.append("demo", file);
  return postForm("/submissions/preview", form);
}

// Adds the demo for a pending run; the server checks it matches and verifies the run. Resolves
// to whether the run is verified now (a new co-op run waits for both players' demos).
export async function addRunDemo(changelogId, file) {
  const form = new FormData();
  form.append("demo", file);
  const res = await fetch(apiUrl(`/runs/${changelogId}/demo`), { method: "POST", body: form });
  if (res.status === 401) throw new Error("Sign in required.");
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  const body = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  return body?.verified ?? true;
}

// Submits a run. `fields` holds youtube, comment, mel_mode and the admin-only map_id, time,
// profile_number and partner; empty values are left out.
export function submitRun(file, fields) {
  const form = new FormData();
  if (file) form.append("demo", file);
  Object.entries(fields).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "") form.append(k, String(v).trim());
  });
  return postForm("/submissions", form);
}

// --- game catalog (admin editor) -------------------------------------------------------

async function sendJson(method, path, body) {
  const res = await fetch(apiUrl(path), { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) throw new Error("Sign in required.");
  if (!res.ok) {
    // A proxy's error page (HTML) isn't a message to show.
    const text = await res.text();
    throw new Error(text && !text.trimStart().startsWith("<") ? text : res.status === 524 || res.status === 504 ? "The server took too long to answer." : `Request failed (${res.status})`);
  }
  return res.headers.get("content-type")?.includes("application/json") ? res.json() : null;
}

export const fetchCatalog = () => getJson("/catalog");
export const adminCreateGame = (game) => sendJson("POST", "/admin/games", game);
export const adminUpdateGame = (id, changes) => sendJson("PUT", `/admin/games/${id}`, changes);
export const adminDeleteGame = (id) => sendJson("DELETE", `/admin/games/${id}`);
export const adminSaveLayout = (id, chapters) => sendJson("PUT", `/admin/games/${id}/layout`, { chapters });
export const adminCreateChapter = (gameId, chapter) => sendJson("POST", `/admin/games/${gameId}/chapters`, chapter);
export const adminUpdateChapter = (id, changes) => sendJson("PUT", `/admin/chapters/${id}`, changes);
export const adminDeleteChapter = (id) => sendJson("DELETE", `/admin/chapters/${id}`);
export const adminCreateMap = (chapterId, map) => sendJson("POST", `/admin/chapters/${chapterId}/maps`, map);
export const adminUpdateMap = (steamId, changes) => sendJson("PUT", `/admin/maps/${encodeURIComponent(steamId)}`, changes);
export const adminDeleteMap = (steamId) => sendJson("DELETE", `/admin/maps/${encodeURIComponent(steamId)}`);
// A map's own image (PNG, JPEG or WebP, up to 5 MB), replacing the built-in one; or back to it.
export function adminSetMapImage(steamId, file) {
  const form = new FormData();
  form.append("image", file);
  return postForm(`/admin/maps/${encodeURIComponent(steamId)}/image`, form);
}
export const adminRemoveMapImage = (steamId) => sendJson("DELETE", `/admin/maps/${encodeURIComponent(steamId)}/image`);
export const mapImageUrl = (steamId, version) => apiUrl(`/maps/${encodeURIComponent(steamId)}/image?v=${version}`);
export const adminCreateCategory = (steamId, name) => sendJson("POST", `/admin/maps/${encodeURIComponent(steamId)}/categories`, { name });
export const adminUpdateCategory = (id, name) => sendJson("PUT", `/admin/categories/${id}`, { name });
export const adminDeleteCategory = (id) => sendJson("DELETE", `/admin/categories/${id}`);
export const adminLinkMap = (steamId, other) => sendJson("POST", `/admin/maps/${encodeURIComponent(steamId)}/links`, { map: other });
export const adminUnlinkMap = (steamId, other) => sendJson("DELETE", `/admin/maps/${encodeURIComponent(steamId)}/links/${encodeURIComponent(other)}`);
export const adminLinkGames = (id, other) => sendJson("POST", `/admin/games/${id}/links`, { game_id: other });
export const adminUnlinkGames = (id, other) => sendJson("DELETE", `/admin/games/${id}/links/${other}`);

// --- profile comparison -----------------------------------------------------------------

export async function searchUsers(q) {
  if (q.trim().length < 2) return [];
  const rows = await getJson("/users/search", { q: q.trim() });
  return rows.map((u) => ({ ...player(u.profile_number, u.user_name, u.avatar), runs: u.runs }));
}

// One side of a comparison: the player and their best time and rank per map in a game.
export async function fetchCompareSide(profileNumber, game = "portal2") {
  const [user, scores] = await Promise.all([
    getJson(`/user/${profileNumber}`),
    game === "portal2"
      ? getJson(`/profile/scores/${profileNumber}`).then((rows) => Object.fromEntries(rows.map((r) => [r.map_id, { score: r.score, rank: r.rank }])))
      : fetchGameProfile(profileNumber, game).then((p) =>
          Object.fromEntries(Object.entries(p.scores).filter(([, s]) => s.score != null).map(([id, s]) => [id, { score: s.score, rank: s.rank }])),
        ),
  ]);
  return { player: player(profileNumber, user?.board_name || user?.steam_name, user?.avatar), scores };
}

// --- run reports ------------------------------------------------------------------------

export const REPORT_REASONS = [
  { value: "cheating", label: "Cheating or an illegitimate run" },
  { value: "wrong_time", label: "Wrong time" },
  { value: "wrong_player", label: "Wrong player or partner" },
  { value: "bad_proof", label: "Demo or video doesn't match" },
  { value: "other", label: "Something else" },
];

// Reports a run anonymously.
export const reportRun = (changelogId, reason, details) => sendJson("POST", `/runs/${changelogId}/report`, { reason, details: details || null });
export const fetchReports = (status = "open", before) => getJson("/admin/reports", { status, before });
export const fetchReportCount = () => getJson("/admin/reports/count").then((r) => r.open);
export const setReportStatus = (id, status, note, allOnRun) => sendJson("PUT", `/admin/reports/${id}`, { status, note: note || null, all_on_run: Boolean(allOnRun) });
