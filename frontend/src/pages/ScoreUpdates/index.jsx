import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Panel, Pagination, SearchBox, Select, Avatar, PlayerLink, Loading, EmptyState, RankNumber } from "../../components/ui";
import { HistoryIcon, TriangleLeft, TriangleRight } from "../../components/Icons";
import { useRenderedSet } from "../../components/RunMedia";
import { fetchActivity, fetchMyReactions } from "../../api/client";
import useCurrentUser from "../../hooks/useCurrentUser";
import { fetchChangelogFor, fetchFollowingFeed } from "../../api/boards";
import { GAMES, MODE_LABELS, mapPath, mapsForMode } from "../../data/maps";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import useDebounced from "../../hooks/useDebounced";
import useFollows from "../../hooks/useFollows";
import { timeAgo, formatDate } from "../../lib/format";
import { ACTIVITY_VIEWS, activityWindow } from "../../lib/activity";
import background from "../../scenes/global/img/Background.png";
import ScoreRow from "./ScoreRow";
import "./ScoreUpdates.css";

const PAGE_SIZE = 20;
const GAME_OPTIONS = Object.values(GAMES).map((g) => ({ value: g.id, label: g.label }));
const LIMITS = ["100", "200", "500"];
const DEFAULTS = { game: "portal2", mode: "", map: "", q: "", limit: "200", banned: "hide", page: "0" };
const TOGGLES = [
  ["wr", "World records"],
  ["video", "Has video"],
  ["demo", "Has demo"],
];
const BANNED_OPTIONS = [
  { value: "hide", label: "Hide banned" },
  { value: "show", label: "Include banned" },
  { value: "only", label: "Only banned" },
];

// Filters live in the URL so a filtered feed can be shared or bookmarked.
function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) ?? DEFAULTS[k] ?? "";
  const set = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries({ page: undefined, ...changes }).forEach(([k, v]) => {
          if (v == null || v === "" || v === false || v === DEFAULTS[k]) next.delete(k);
          else next.set(k, v === true ? "1" : v);
        });
        return next;
      },
      { replace: true },
    );
  return [get, set];
}

export default function ScoreUpdates() {
  const [get, set] = useFilters();
  const game = GAMES[get("game")] ? get("game") : "portal2";
  const mode = GAMES[game].modes.includes(get("mode")) ? get("mode") : "";
  const filters = {
    game,
    mode,
    mapId: get("map") || undefined,
    limit: LIMITS.includes(get("limit")) ? get("limit") : DEFAULTS.limit,
    wr: get("wr") === "1",
    video: get("video") === "1",
    demo: get("demo") === "1",
    banned: BANNED_OPTIONS.some((o) => o.value === get("banned")) ? get("banned") : DEFAULTS.banned,
  };
  const page = Math.max(0, Number(get("page")) || 0);
  const query = useDebounced(get("q"), 250);
  const key = JSON.stringify({ ...filters, query });
  const version = useDataVersion();
  const changelog = useApi(() => fetchChangelogFor(game, { ...filters, search: query }), [key, version]);
  const activity = useApi(() => fetchActivity(), []);

  const mapOptions = useMemo(() => {
    const maps = (mode ? [mode] : GAMES[game].modes).flatMap((m) => mapsForMode(m));
    return [{ value: "", label: "All chambers" }, ...maps.map((m) => ({ value: m.id, label: m.title }))];
  }, [game, mode]);

  const entries = changelog.data || [];
  const pageCount = Math.ceil(entries.length / PAGE_SIZE);
  const visible = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rendered = useRenderedSet(visible, game);
  // Which of the visible runs the signed-in player reacted to (one request per page).
  const me = useCurrentUser();
  const signedIn = Boolean(me) && !me.sample;
  const visibleIds = visible.map((e) => e.id).join(",");
  const mine = useApi(() => (signedIn && visibleIds ? fetchMyReactions(visible.map((e) => e.id)).catch(() => ({})) : Promise.resolve({})), [visibleIds, signedIn, version]);
  const setPage = (p) => set({ page: String(p) });
  const filtered = Boolean(filters.mapId || mode || filters.wr || filters.video || filters.demo || filters.banned !== "hide" || query);

  return (
    <Layout background={background} tint="mono">
      <div className="su-top">
        <Panel icon={HistoryIcon} title="Following" className="su-following" bodyClassName="su-following-body">
          <Following />
        </Panel>
        <ActivityPanel data={activity.data} loading={activity.loading} />
      </div>

      <Panel icon={HistoryIcon} title="Score Updates" bodyClassName="su-body">
        <div className="su-toolbar">
          <SearchBox value={get("q")} onChange={(v) => set({ q: v })} placeholder="Search players" showFilter={false} />
          <Select value={game} onChange={(g) => set({ game: g, mode: "", map: "" })} options={GAME_OPTIONS} label="Game" className="su-game" />
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>

        <div className="su-filters" role="group" aria-label="Filters">
          <div className="segmented su-modes">
            {["", ...GAMES[game].modes].map((m) => (
              <button key={m || "all"} type="button" className={mode === m ? "is-active" : ""} onClick={() => set({ mode: m, map: "" })}>
                {m ? MODE_LABELS[m] : "All"}
              </button>
            ))}
          </div>
          <Select value={filters.mapId || ""} onChange={(v) => set({ map: v })} options={mapOptions} label="Chamber" className="su-filter-select su-chamber" />
          {TOGGLES.map(([k, label]) => (
            <button key={k} type="button" className={`su-chip${filters[k] ? " is-active" : ""}`} aria-pressed={filters[k]} onClick={() => set({ [k]: !filters[k] })}>
              {label}
            </button>
          ))}
          <Select value={filters.banned} onChange={(v) => set({ banned: v })} options={BANNED_OPTIONS} label="Banned runs" className="su-filter-select" />
          <Select
            value={filters.limit}
            onChange={(v) => set({ limit: v })}
            options={LIMITS.map((l) => ({ value: l, label: `Latest ${l}` }))}
            label="Number of runs"
            className="su-filter-select su-limit"
          />
          {filtered && (
            <button type="button" className="su-clear" onClick={() => set({ mode: "", map: "", q: "", wr: false, video: false, demo: false, banned: "hide" })}>
              Clear filters
            </button>
          )}
        </div>

        <div className="score-table" role="table" aria-label="Score updates">
          <div className="score-head" role="row">
            <span>Previous</span>
            <span>New</span>
            <span>Map</span>
            <span>Player(s)</span>
            <span className="end">Time</span>
            <span className="end">ΔTime</span>
            <span className="end">ΔPoints</span>
            <span className="end">Date</span>
          </div>
          {changelog.loading && !entries.length ? (
            <Loading />
          ) : visible.length ? (
            visible.map((entry) => <ScoreRow key={`${entry.game}-${entry.id}`} entry={entry} rendered={rendered} myReaction={mine.data?.[entry.id]} />)
          ) : (
            <EmptyState>{filtered ? "No score updates match these filters." : "No score updates yet."}</EmptyState>
          )}
        </div>

        {pageCount > 1 && (
          <div className="su-toolbar su-toolbar-bottom">
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        )}
      </Panel>
    </Layout>
  );
}

function Following() {
  const { follows } = useFollows();
  const key = follows.map((p) => p.profileNumber).join(",");
  const feed = useApi(() => (follows.length ? fetchFollowingFeed(follows) : Promise.resolve([])), [key]);
  const entries = feed.data || [];
  if (!follows.length) return <EmptyState>Follow players from their profile to see their latest runs here.</EmptyState>;
  if (feed.loading && !entries.length) return <Loading />;
  if (!entries.length) return <EmptyState>The players you follow have no runs yet.</EmptyState>;
  return (
    <ul className="following">
      {entries.map((e) => {
        const followed = e.players.find((p) => follows.some((f) => f.profileNumber === p.profileNumber)) || e.players[0];
        return (
          <li key={`${e.game}-${e.id}`}>
            <Link to={mapPath(e.map)} className="following-map">
              {e.map.title}
            </Link>
            <span className="following-player">
              <Avatar src={followed.avatar} name={followed.name} size={22} />
              <PlayerLink player={followed} />
            </span>
            <span className="following-rank num">
              <RankNumber rank={e.postRank} />
            </span>
            <span className="green following-ago">{timeAgo(e.timestamp)}</span>
            <span className="muted num following-date">{formatDate(e.timestamp)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Submissions over time, paged month by month, year by year (weekly totals) or all time (monthly).
function ActivityPanel({ data, loading }) {
  const [view, setView] = useState("month");
  const [offset, setOffset] = useState(0);
  const win = useMemo(() => activityWindow(data || [], view, offset), [data, view, offset]);
  const title = ACTIVITY_VIEWS.find((v) => v.value === view).title;
  const actions = (
    <div className="su-activity-controls">
      <div className="segmented su-activity-views">
        {ACTIVITY_VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            className={view === v.value ? "is-active" : ""}
            onClick={() => {
              setView(v.value);
              setOffset(0);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view !== "all" && (
        <div className="su-activity-pager">
          <button type="button" onClick={() => setOffset((o) => o + 1)} disabled={!win.hasPrev} aria-label={`Previous ${view}`}>
            <TriangleLeft />
          </button>
          <span className="num">{win.label}</span>
          <button type="button" onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={!win.hasNext} aria-label={`Next ${view}`}>
            <TriangleRight />
          </button>
        </div>
      )}
    </div>
  );
  return (
    <Panel icon={HistoryIcon} title={title} actions={actions} className="su-activity" bodyClassName="su-activity-body">
      <ActivityChart points={win.points} loading={loading && !data} />
    </Panel>
  );
}

function ActivityChart({ points, loading }) {
  if (loading) return <Loading />;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "var(--menu)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "inherit" }}
          labelStyle={{ color: "var(--text-2)" }}
          formatter={(v) => [v, "Scores"]}
        />
        <Line
          type="linear"
          dataKey="count"
          stroke="var(--chart-line)"
          strokeWidth={2}
          dot={points.length <= 60 ? { r: 3, stroke: "var(--chart-line)", strokeWidth: 2, fill: "var(--panel)" } : false}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
