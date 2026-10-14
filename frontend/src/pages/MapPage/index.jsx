import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Panel, Select, Pagination, SearchBox, Avatar, PlayerLink, OutlineButton, Loading, EmptyState, RankNumber } from "../../components/ui";
import { PinIcon, TrophyIcon, HistoryIcon, WikiIcon } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, RunVideo, useRenderedSet, DemoLink, CommentButton } from "../../components/RunMedia";
import RunDetails from "../../components/RunDetails";
import { toggleOnRowClick } from "../../lib/rows";
import { coopRoles, tintFor, useRoleOverrides } from "../../lib/coopRoles";
import { fetchBoard, fetchWrHistory, fetchMapChangelog } from "../../api/boards";
import { fetchProfileScores, fetchWrHistoryForStaff, setRunWrHidden } from "../../api/client";
import useCurrentUser, { isStaff } from "../../hooks/useCurrentUser";
import { bumpDataVersion } from "../../lib/dataVersion";
import { findMap, getMap, gameForMode, isMultiplayerMode, mapPath } from "../../data/maps";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import { formatScore, timeAgo, formatDate, formatDateTime, parseTimestamp } from "../../lib/format";
import { TimeButton } from "../../components/RunHistory";
import useWheelZoom from "../../hooks/useWheelZoom";
import { BANNED_OPTIONS, RANK_OPTIONS, RUN_LIMITS, RUN_TOGGLES, TIME_OPTIONS } from "../../lib/runFilters";
import "./MapPage.css";

// Runs per page on the board and in Chamber History.
const PAGE_SIZE = 40;
const CATEGORIES = [{ value: "main", label: "Main Challenge Mode" }];
const MEL_CATEGORIES = [{ value: "main", label: "Challenge Mode" }];

export default function MapPage() {
  const { mode, levelId } = useParams();
  const map = getMap(levelId, gameForMode(mode)) || findMap(levelId);
  if (!map) return <Navigate to="/maps" replace />;
  if (map.mode !== mode) return <Navigate to={mapPath(map)} replace />;
  return <MapPageContent key={`${map.game}-${map.id}`} map={map} />;
}

function MapPageContent({ map }) {
  const user = useCurrentUser();
  const version = useDataVersion();
  // ?at=: the board as it stood then (picked on the WR history chart).
  const [params, setParams] = useSearchParams();
  const at = params.get("at");
  const board = useApi(() => fetchBoard(map, at), [map.id, version, at]);
  const history = useApi(() => fetchWrHistory(map), [map.id, version]);
  const [view, setView] = useState("board");
  const pickMoment = (t) => {
    setParams(t ? { at: new Date(t).toISOString().slice(0, 19) } : {}, { replace: true });
    setView("board");
  };
  const wr = board.data?.[0];
  const wrRendered = useRenderedSet(wr ? [wr] : [], map.game);

  return (
    <Layout background={map.image} blur narrow>
      <Panel icon={PinIcon} title="Map Info" className="mp-panel" bodyClassName="mp-body">
        <div className="mp-info">
          <div className="mp-info-left">
            <h1 className="mp-title">{map.title}</h1>
            <p className="mp-chapter">{map.chapter}</p>
            <WrHistoryChart points={history.data} loading={history.loading} at={at} onPick={pickMoment} />
            <Select value="main" onChange={() => {}} options={map.game === "mel" ? MEL_CATEGORIES : CATEGORIES} label="Category" className="mp-select" />
          </div>
          <div className="mp-info-right">
            {wr ? (
              <RunVideo run={wr} game={map.game} rendered={wrRendered} title={`${map.title} world record`} />
            ) : (
              <div className="yt-embed yt-empty">No video</div>
            )}
            <div className="mp-buttons">
              {map.game === "portal2" && (
                <OutlineButton as="a" href={`https://wiki.portal2.sr/${encodeURIComponent(map.title.replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">
                  P2SR Wiki Article <WikiIcon />
                </OutlineButton>
              )}
              <OutlineButton type="button" onClick={() => setView((v) => (v === "history" ? "board" : "history"))} aria-pressed={view === "history"}>
                {view === "history" ? "Leaderboard" : "Chamber History"} <HistoryIcon />
              </OutlineButton>
              {isStaff(user) && (
                <OutlineButton type="button" className="mp-staff-button" onClick={() => setView((v) => (v === "wr" ? "board" : "wr"))} aria-pressed={view === "wr"}>
                  {view === "wr" ? "Leaderboard" : "Edit WR history"} <TrophyIcon />
                </OutlineButton>
              )}
            </div>
          </div>
        </div>

        <div className="mp-lower">
          {view === "board" ? <Leaderboard map={map} board={board} at={at} onClearAt={() => pickMoment(null)} /> : view === "wr" ? <WrHistoryEditor map={map} /> : <ChamberHistory map={map} />}
        </div>
      </Panel>
    </Layout>
  );
}

// Range buttons over the WR history: the whole history, or the last N years (only ranges shorter
// than the history are offered).
const WR_RANGES = [
  { value: "all", label: "All", years: null },
  { value: "10y", label: "10Y", years: 10 },
  { value: "5y", label: "5Y", years: 5 },
  { value: "2y", label: "2Y", years: 2 },
  { value: "1y", label: "1Y", years: 1 },
];
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAY_MS = 24 * 3600 * 1000;

// Axis ticks for [from, to] and their labels: years, quarters, months, or days as the span
// shrinks, thinned to at most `max` so labels never overlap.
function timeTicks(from, to, max = 7) {
  const span = to - from;
  if (span < 75 * DAY_MS) {
    const n = 4;
    const ticks = Array.from({ length: n }, (_, i) => from + (span * (i + 0.5)) / n);
    return { ticks, label: (t) => `${MONTHS_SHORT[new Date(t).getMonth()]} ${new Date(t).getDate()}` };
  }
  const months = span < 0.75 * YEAR_MS ? 1 : span < 2.5 * YEAR_MS ? 3 : 12;
  const ticks = [];
  const d = new Date(from);
  let cur = new Date(d.getFullYear(), Math.floor(d.getMonth() / months) * months + months, 1);
  while (cur.getTime() <= to) {
    ticks.push(cur.getTime());
    cur = new Date(cur.getFullYear(), cur.getMonth() + months, 1);
  }
  const step = Math.max(1, Math.ceil(ticks.length / max));
  const label = months === 12 ? (t) => new Date(t).getFullYear() : (t) => `${MONTHS_SHORT[new Date(t).getMonth()]} ${new Date(t).getFullYear()}`;
  return { ticks: ticks.filter((_, i) => i % step === 0), label };
}

function WrTooltip({ active, payload }) {
  const p = active && payload?.[0]?.payload;
  if (!p || p.now || p.carried) return null;
  return (
    <div className="mp-chart-tip">
      <span className="muted">{formatDate(p.t)}</span>
      <strong className="num">{formatScore(p.score)}</strong>
      <span>{p.player}</span>
      {p.gain != null && <span className="num green">−{formatScore(p.gain)}</span>}
    </div>
  );
}

// Scroll over the chart to zoom; click a point to see the board as it stood then.
function WrHistoryChart({ points, loading, at, onPick }) {
  // Records oldest first, each with how much it took off the previous one.
  const records = useMemo(() => {
    const list = (points || []).map((p) => ({ ...p, t: parseTimestamp(p.timestamp).getTime() })).sort((a, b) => a.t - b.t);
    return list.map((p, i) => ({ ...p, gain: i > 0 && list[i - 1].score > p.score ? list[i - 1].score - p.score : null }));
  }, [points]);
  const [range, setRange] = useState("all");
  const now = useMemo(() => Date.now(), [records]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = records[0]?.t ?? now;
  const span = now - first;
  const ranges = WR_RANGES.filter((r) => !r.years || r.years * YEAR_MS < span);
  const years = ranges.find((r) => r.value === range)?.years;
  const rangeFrom = years ? now - years * YEAR_MS : first;
  const [zoom, zoomRef, resetZoom] = useWheelZoom([rangeFrom, now], { left: 56, right: 12, minSpan: 7 * DAY_MS });
  useEffect(() => setRange("all"), [records]);
  if (loading && !records.length)
    return (
      <div className="mp-chart">
        <Loading />
      </div>
    );
  if (!records.length) return <div className="mp-chart mp-chart-empty muted">No world record history</div>;

  const [from, to] = zoom || [rangeFrom, now];
  // What's in view: the record standing at the start, the ones set in view, and the one standing
  // at the end carried on to it (today, unless zoomed in).
  const before = records.filter((r) => r.t < from);
  const inRange = records.filter((r) => r.t >= from && r.t <= to);
  const standing = [...before, ...inRange];
  const data = [
    ...(before.length ? [{ ...before[before.length - 1], t: from, carried: true }] : []),
    ...inRange,
    ...(standing.length ? [{ ...standing[standing.length - 1], t: to, now: to >= now, carried: to < now, gain: null }] : []),
  ];
  const scores = data.map((d) => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const pad = Math.max(1, Math.round((max - min) * 0.08));
  const { ticks, label } = timeTicks(from, to);
  const atMs = at ? parseTimestamp(at).getTime() : null;
  const pick = (state) => {
    const p = state?.activePayload?.[0]?.payload;
    if (p) onPick?.(p.now ? null : p.t);
  };

  return (
    <div className="mp-chart">
      <div className="mp-chart-head">
        <span className="muted mp-chart-count">
          {records.length} world record{records.length === 1 ? "" : "s"}
          {years || zoom ? ` · ${inRange.length} in view` : ""}
        </span>
        {zoom && (
          <button type="button" className="mp-chart-reset" onClick={resetZoom}>
            Reset zoom
          </button>
        )}
        {ranges.length > 1 && (
          <div className="segmented mp-chart-ranges" role="group" aria-label="Range">
            {ranges.map((r) => (
              <button
                key={r.value}
                type="button"
                className={range === r.value && !zoom ? "is-active" : ""}
                onClick={() => {
                  setRange(r.value);
                  resetZoom();
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <TrophyIcon className="mp-chart-trophy" />
      </div>
      <div ref={zoomRef} className="mp-chart-plot" title="Scroll to zoom · click to see the board as it stood then">
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} onClick={pick}>
          <defs>
            <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9d5fd0" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#9d5fd0" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[from, to]}
            allowDataOverflow
            ticks={ticks}
            tickFormatter={label}
            tick={{ fill: "var(--text-2)", fontSize: 13 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            ticks={min === max ? [min] : [min, Math.round((min + max) / 2), max]}
            allowDataOverflow
            tickFormatter={formatScore}
            tick={{ fill: "var(--text-muted)", fontSize: 13 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip isAnimationActive={false} content={<WrTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
          {atMs != null && atMs >= from && atMs <= to && <ReferenceLine x={atMs} stroke="var(--accent)" strokeDasharray="4 3" />}
          <Area
            type="stepAfter"
            dataKey="score"
            stroke="#b17ee0"
            strokeWidth={2}
            fill="url(#wrFill)"
            dot={false}
            activeDot={{ r: 5, fill: "#c48ef0", stroke: "var(--panel)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function Leaderboard({ map, board, at, onClearAt }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const coop = isMultiplayerMode(map.mode);
  const q = search.trim().toLowerCase();
  const rows = (board.data || []).filter((e) => !q || e.players.some((p) => p.name.toLowerCase().includes(q)));
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rendered = useRenderedSet(visible, map.game);
  const [openKey, setOpenKey] = useState(null);
  const roleOverrides = useRoleOverrides();
  const rowKey = (e) => e.changelogId ?? `${e.rank}-${e.players.map((p) => p.profileNumber).join("-")}`;

  // Jump to a board entry: clear the search, go to its page and open its details.
  const showEntry = (entry) => {
    const index = (board.data || []).indexOf(entry);
    if (index < 0) return;
    setSearch("");
    setPage(Math.floor(index / PAGE_SIZE));
    setOpenKey(rowKey(entry));
    setTimeout(() => document.querySelector(".mp-entry.is-open")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };

  return (
    <>
      {at ? (
        <div className="mp-asof">
          <span>
            Leaderboard as it stood on <strong className="num">{formatDateTime(at)}</strong>
          </span>
          <button type="button" className="mp-asof-clear" onClick={onClearAt}>
            Back to the current board
          </button>
        </div>
      ) : (
        <YourBest map={map} board={board.data} onShow={showEntry} />
      )}
      <div className="mp-toolbar">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search players"
        />
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      <div className={`mp-table${coop ? " is-coop" : ""}`} role="table">
        <div className="mp-row mp-row-head" role="row">
          <span className="mp-rank">#</span>
          <span>{coop ? "Blue" : "Player"}</span>
          {coop && <span>Orange</span>}
          <span />
          <span className="end">Time</span>
          <span />
        </div>
        {board.loading && !board.data ? (
          <Loading />
        ) : visible.length ? (
          visible.map((e) => {
            const key = rowKey(e);
            const open = openKey === key;
            const { players, rolesKnown } = coopRoles(e, roleOverrides);
            // Unpaired co-op runs have no partner on record; keep the cell so columns line up.
            const cells = coop && players.length < 2 ? [...players, null] : players;
            return (
              <div className={`mp-entry${open ? " is-open" : ""}`} key={key}>
                <div className="mp-row is-expandable" role="row" aria-expanded={open} onClick={toggleOnRowClick(() => setOpenKey(open ? null : key))}>
                  <span className="mp-rank num">
                    <RankNumber rank={e.rank} colored />
                  </span>
                  {cells.map((p, j) =>
                    p ? (
                      <span
                        key={j}
                        className={`mp-player${coop ? ` ${tintFor(rolesKnown && players.length > 1, j)}` : ""}`}
                        title={coop && !rolesKnown ? "Unknown which player was blue" : undefined}
                      >
                        <Avatar src={p.avatar} name={p.name} size={30} />
                        <PlayerLink player={p} />
                      </span>
                    ) : (
                      <span key={j} className="mp-player mp-player-none muted" title="No partner on record">
                        —
                      </span>
                    ),
                  )}
                  <span className="mp-ago muted" title={formatDateTime(e.timestamp)}>{timeAgo(e.timestamp)}</span>
                  <span className="mp-time num end">
                    <TimeButton score={e.score} players={players} map={map} />
                  </span>
                  <span className="mp-icons">
                    <CommentButton note={e.note} />
                    <AutorenderLink run={e} game={map.game} rendered={rendered} />
                    <YouTubeLink id={e.youtubeId} />
                    <DemoLink demoId={e.demoId} />
                  </span>
                </div>
                {open && <RunDetails run={e} map={map} game={map.game} rendered={rendered} />}
              </div>
            );
          })
        ) : (
          <EmptyState>No scores found.</EmptyState>
        )}
      </div>
    </>
  );
}

// The signed-in player's best on this map, pinned above the board.
function YourBest({ map, board, onShow }) {
  const user = useCurrentUser();
  const me = user && !user.sample ? user.profileNumber : null;
  const entry = me ? (board || []).find((e) => e.players.some((p) => p.profileNumber === me)) : null;
  // Off the loaded board: fall back to the player's recorded PB (Portal 2 only).
  const pbs = useApi(() => (me && board && !entry && map.game === "portal2" ? fetchProfileScores(me) : Promise.resolve(null)), [me, map.id, Boolean(board), Boolean(entry)]);
  if (!me || !board) return null;
  const pb = entry ? null : (pbs.data || []).find((p) => p.map_id === map.id);
  if (!entry && !pb) {
    return <div className="mp-yourbest is-empty">You don’t have a time on this map yet.</div>;
  }
  const score = entry ? entry.score : pb.score;
  const rank = entry ? entry.rank : pb.rank;
  const when = entry ? entry.timestamp : pb.timestamp;
  const partner = entry?.players.find((p) => p.profileNumber !== me);
  const body = (
    <>
      <span className="mp-yourbest-label">Your best</span>
      <span className="mp-yourbest-rank num">
        <RankNumber rank={rank} colored />
      </span>
      <span className="mp-yourbest-time num">{formatScore(score)}</span>
      {partner && <span className="muted">with {partner.name}</span>}
      <span className="muted" title={formatDateTime(when)}>{timeAgo(when)}</span>
      {entry ? <span className="mp-yourbest-go">Show on board ›</span> : <span className="muted">outside the top {board.length}</span>}
    </>
  );
  return entry ? (
    <button type="button" className="mp-yourbest" onClick={() => onShow(entry)}>
      {body}
    </button>
  ) : (
    <div className="mp-yourbest">{body}</div>
  );
}

// Staff: every world record on the map, with removal from (and return to) the WR history.
function WrHistoryEditor({ map }) {
  const version = useDataVersion();
  const wrs = useApi(() => fetchWrHistoryForStaff(map), [map.id, version]);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: null, error: null });
  const toggle = async (entry) => {
    setState({ busy: entry.id, error: null });
    try {
      await setRunWrHidden(entry.id, !entry.wrHidden, reason.trim() || undefined);
      setState({ busy: null, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: null, error: e.message });
    }
  };
  if (wrs.loading && !wrs.data) return <Loading />;
  const rows = [...(wrs.data || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return (
    <div className="mp-wr-editor">
      <div className="mp-wr-editor-head">
        <p className="muted">Removing a run from the WR history only takes it off the chart; the run and its place on the board are unchanged. Changes are recorded in the audit log.</p>
        <input className="mp-wr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit log)" maxLength={500} />
      </div>
      {state.error && <p className="mp-wr-error">{state.error}</p>}
      {!rows.length ? (
        <EmptyState>No world records recorded for {map.title}.</EmptyState>
      ) : (
        <div className="mp-table mp-wr-table" role="table">
          <div className="mp-row mp-row-head" role="row">
            <span>Date</span>
            <span>Player(s)</span>
            <span className="end">Time</span>
            <span />
          </div>
          {rows.map((e) => (
            <div className={`mp-row${e.wrHidden ? " is-wr-hidden" : ""}`} role="row" key={e.id}>
              <span className="muted num" title={formatDateTime(e.timestamp)}>{formatDate(e.timestamp)}</span>
              <span className="mp-player">
                {e.players.map((p, j) => (
                  <PlayerLink key={j} player={p} />
                ))}
                {e.wrHidden && <span className="mp-wr-badge">Removed from history</span>}
                {e.banned && <span className="mp-wr-badge">Hidden from boards</span>}
              </span>
              <span className="end num">{formatScore(e.score)}</span>
              <span className="end">
                <button type="button" className={`mp-wr-toggle${e.wrHidden ? " is-restore" : ""}`} disabled={state.busy === e.id} onClick={() => toggle(e)}>
                  {e.wrHidden ? "Restore" : "Remove"}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const HISTORY_DEFAULTS = { q: "", wr: false, video: false, demo: false, pending: false, rank: "", days: "", banned: "hide", limit: "200" };

function ChamberHistory({ map }) {
  const version = useDataVersion();
  const [f, setF] = useState(HISTORY_DEFAULTS);
  const [page, setPage] = useState(0);
  const query = useDebounced(f.q, 250);
  const set = (changes) => {
    setF((old) => ({ ...old, ...changes }));
    setPage(0);
  };
  const key = JSON.stringify({ ...f, q: query });
  const history = useApi(() => fetchMapChangelog(map, { ...f, search: query || undefined }), [map.id, version, key]);
  const rows = history.data || [];
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filtered = JSON.stringify(f) !== JSON.stringify(HISTORY_DEFAULTS);

  return (
    <>
      <div className="mp-hfilters" role="group" aria-label="Filters">
        <SearchBox value={f.q} onChange={(v) => set({ q: v })} placeholder="Search players" showFilter={false} />
        <div className="mp-hfilters-row">
          {RUN_TOGGLES.map(([k, label]) => (
            <button key={k} type="button" className={`mp-chip${f[k] ? " is-active" : ""}`} aria-pressed={f[k]} onClick={() => set({ [k]: !f[k] })}>
              {label}
            </button>
          ))}
          <Select value={f.rank} onChange={(v) => set({ rank: v })} options={RANK_OPTIONS} label="Rank" className="mp-hselect" />
          <Select value={f.days} onChange={(v) => set({ days: v })} options={TIME_OPTIONS} label="Time" className="mp-hselect" />
          <Select value={f.banned} onChange={(v) => set({ banned: v })} options={BANNED_OPTIONS} label="Banned runs" className="mp-hselect" />
          <Select value={f.limit} onChange={(v) => set({ limit: v })} options={RUN_LIMITS.map((l) => ({ value: l, label: `Latest ${l}` }))} label="Number of runs" className="mp-hselect" />
          {filtered && (
            <button type="button" className="mp-hclear" onClick={() => set(HISTORY_DEFAULTS)}>
              Clear filters
            </button>
          )}
        </div>
        <div className="mp-hfilters-foot">
          <span className="muted">{history.loading && !history.data ? "" : `${rows.length} run${rows.length === 1 ? "" : "s"}`}</span>
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onChange={setPage} />}
        </div>
      </div>
      {history.loading && !history.data ? (
        <Loading />
      ) : !rows.length ? (
        <EmptyState>{filtered ? "No runs match these filters." : `No submissions recorded for ${map.title}.`}</EmptyState>
      ) : (
        <ChamberHistoryTable rows={visible} stale={history.loading} map={map} />
      )}
    </>
  );
}

function ChamberHistoryTable({ rows, stale, map }) {
  return (
    <div className={`mp-table mp-history${stale ? " is-stale" : ""}`} role="table">
      <div className="mp-row mp-row-head" role="row">
        <span>Date</span>
        <span>Player(s)</span>
        <span className="end">Rank</span>
        <span className="end">Time</span>
        <span className="end">Δ</span>
      </div>
      {rows.map((e) => (
        <div className="mp-row" role="row" key={e.id}>
          <span className="muted" title={formatDateTime(e.timestamp)}>{formatDate(e.timestamp)}</span>
          <span className="mp-player">
            {e.players.map((p, j) => (
              <PlayerLink key={j} player={p} />
            ))}
          </span>
          <span className="end num">
            <span className="rank-pair">
              <RankNumber rank={e.preRank} colored /> → <RankNumber rank={e.postRank} colored />
            </span>
          </span>
          <span className="end num">
            <TimeButton score={e.score} players={e.players} map={map} />
          </span>
          <span className="end num muted">{e.scoreDelta != null ? formatScore(e.scoreDelta) : ""}</span>
        </div>
      ))}
    </div>
  );
}

// A value that only changes once it has stopped changing for `ms` (for search-as-you-type).
function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
