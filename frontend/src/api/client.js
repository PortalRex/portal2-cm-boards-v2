// Data access for the boards. Everything comes from the v2 Rust web server
// (REACT_APP_API_URL), which hosts both Portal 2 and Portal Stories: Mel; Mel
// requests carry `game_id`. If the server can't be reached, or
// REACT_APP_USE_MOCK=true, the deterministic sample data in ./mock is used so the
// UI can be developed without a database.
import { getMap, mapsForMode, p2ChapterByDbId } from "../data/maps";
import { countryById } from "../data/countries";
import { API_BASE, GAME_IDS } from "./config";
import { getJson as get, withFallback } from "./http";
import * as mock from "./mock";
import { formatSegments } from "./autorender";

export { API_BASE };

const getJson = (path, params) => get(API_BASE, path, params);
const gameParam = (game) => (game === "mel" ? { game_id: GAME_IDS.mel } : {});
const sample = (live, fallback) => withFallback("api", live, fallback);

// Map ids are Steam leaderboard ids for Portal 2 and board ids (1-44) for Mel.
const lookupMap = (id, game) => getMap(String(id), game) || getMap(String(id), game === "mel" ? "portal2" : "mel");

// --- adapters ----------------------------------------------------------------

const player = (profileNumber, name, avatar) => ({ profileNumber, name: name || "Unknown", avatar: avatar || null });

// Unpaired co-op runs are bundled with a filler user ("N/A") in the database.
const FILLER = "N/A";
const realPlayers = (players) => players.filter((p) => p.profileNumber !== FILLER && p.name !== FILLER);

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
    pointsDelta: null,
    players,
    youtubeId: row.youtube_id,
    autorenderId: row.autorender_id ?? null,
    demoId: row.demo_id,
    note: row.note,
    verified: row.verified !== false,
    banned: !!row.banned,
    coopId: isCoop ? row.coop_id : null,
    reactionsUp: row.reactions_up ?? 0,
    reactionsDown: row.reactions_down ?? 0,
    rolesKnown: isCoop ? row.coop_roles_known !== false : null,
    sarVersion: null,
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
    player: player(profileNumber, p.user_name, p.avatar),
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

export function fetchChangelog({ search, profileNumber, mapId, limit = 200, game = "portal2", mode, wr, video, demo, pending, banned = "hide" } = {}) {
  const filters = { mode, wr, video, demo, pending, banned };
  const byMode = (entries) => (mode === "story" || mode === "advanced" ? entries.filter((e) => e.map.mode === mode) : entries);
  return sample(
    async () => {
      const rows = await getJson("/changelog", {
        limit,
        nick_name: search || undefined,
        profile_number: profileNumber,
        chamber: mapId,
        sp: mode === "coop" ? false : undefined,
        coop: mode === "sp" ? false : mode === "coop" ? true : undefined,
        wr_gain: toggle(wr),
        yt: toggle(video),
        has_demo: toggle(demo),
        verified: pending ? false : undefined,
        banned: banned === "only" ? true : banned === "show" ? undefined : false,
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
  }));
}

// Staff: who reacted to a run now ({ current }) and the latest changes ({ history }); each
// entry { profile_number, user_name, avatar, reaction (1, -1, null = cleared), created_at }.
export const fetchReactionRecord = (changelogId) => getJson(`/admin/runs/${changelogId}/reactions`);

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

export function fetchActivity() {
  return sample(
    async () =>
      (await getJson("/graph"))
        .filter((g) => g.date)
        .map((g) => ({ date: g.date.slice(0, 10), count: g.count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    () => mock.mockActivity(),
  );
}

// Top 7 per map. Mel is single player only, so both of its modes use /sp.
export function fetchMapPreviews(mode) {
  const mel = mode === "story" || mode === "advanced";
  return sample(
    async () => {
      const groups = await getJson(mode === "coop" ? "/coop" : "/sp", gameParam(mel ? "mel" : "portal2"));
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

export function fetchMapBoard(map) {
  return sample(
    async () => {
      const rows = await getJson(`/map/${map.mode === "coop" ? "coop" : "sp"}/${map.id}`, gameParam(map.game));
      return rows.map(map.mode === "coop" ? adaptCoopRanked : adaptSpRanked);
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

// "chapter-<id>" is one Portal 2 chapter (database chapter id, see chapterDbId).
function pointsBoard(kind) {
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
  return { ...profile, pointsHistory: pointsHistory(profile.history) };
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

// Mel results for the profile's Mel tab: { scores, history }.
export function fetchMelProfile(profileNumber) {
  return sample(
    async () => {
      const [ranks, history] = await Promise.all([
        getJson(`/ranks/game/${GAME_IDS.mel}/${profileNumber}`),
        getJson("/changelog", { profile_number: profileNumber, limit: 500, ...gameParam("mel") }),
      ]);
      const entries = history.map((r) => adaptChangelog(r, "mel"));
      return { scores: scoresFromRanks(profileNumber, ranks, entries, "mel"), history: entries };
    },
    () => mock.mockMelProfile(profileNumber),
  );
}

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
      partner: h?.players.find((p) => p.profileNumber !== profileNumber) || null,
    };
  });
  return scores;
}

// Personal bests from /profile/scores fill in times and deltas; maps where the player
// is outside the ranked results get an entry without a rank.
function mergePbs(scores, pbs, history) {
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
      partner: null,
    };
    scores[pb.map_id] = { ...s, score: pb.score, timestamp: pb.timestamp, deltaWr: pb.delta_to_wr ?? null, deltaNext: pb.delta_to_next ?? null };
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
  const scores = mergePbs(scoresFromRanks(profileNumber, page.ranks, history, "portal2"), pbs, history);
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
      frozen: !!user.frozen,
      frozenReason: user.frozen_reason || null,
      steam: profileNumber,
    },
    points: { sp: byId[-1]?.points ?? 0, coop: byId[-2]?.points ?? 0, overall: byId[-3]?.points ?? 0 },
    globalRank: { sp: placeById[-1], coop: placeById[-2], overall: placeById[-3] },
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

// Adds the demo for a pending run; the server checks it matches and verifies the run.
export async function addRunDemo(changelogId, file) {
  const form = new FormData();
  form.append("demo", file);
  const res = await fetch(apiUrl(`/runs/${changelogId}/demo`), { method: "POST", body: form });
  if (res.status === 401) throw new Error("Sign in required.");
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
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
