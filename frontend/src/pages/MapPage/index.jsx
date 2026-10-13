import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Panel, Select, Pagination, SearchBox, Avatar, PlayerLink, OutlineButton, Loading, EmptyState, RankNumber } from "../../components/ui";
import { PinIcon, TrophyIcon, CommentIcon, DownloadIcon, HistoryIcon, WikiIcon } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, RunVideo, useRenderedSet } from "../../components/RunMedia";
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
import { formatScore, timeAgo, formatDate, parseTimestamp } from "../../lib/format";
import "./MapPage.css";

const PAGE_SIZE = 25;
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
  const board = useApi(() => fetchBoard(map), [map.id, version]);
  const history = useApi(() => fetchWrHistory(map), [map.id, version]);
  const [view, setView] = useState("board");
  const wr = board.data?.[0];
  const wrRendered = useRenderedSet(wr ? [wr] : [], map.game);

  return (
    <Layout background={map.image} blur narrow>
      <Panel icon={PinIcon} title="Map Info" className="mp-panel" bodyClassName="mp-body">
        <div className="mp-info">
          <div className="mp-info-left">
            <h1 className="mp-title">{map.title}</h1>
            <p className="mp-chapter">{map.chapter}</p>
            <WrHistoryChart points={history.data} loading={history.loading} />
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
          {view === "board" ? <Leaderboard map={map} board={board} /> : view === "wr" ? <WrHistoryEditor map={map} /> : <ChamberHistory map={map} />}
        </div>
      </Panel>
    </Layout>
  );
}

// Maps with more world records than this get a range slider under the chart.
const WR_SLIDER_MIN = 12;

function WrHistoryChart({ points, loading }) {
  const data = useMemo(
    () =>
      (points || []).map((p) => ({
        ...p,
        t: parseTimestamp(p.timestamp).getTime(),
      })),
    [points],
  );
  const [range, setRange] = useState(null);
  useEffect(() => setRange(null), [data]);
  if (loading && !data.length)
    return (
      <div className="mp-chart">
        <Loading />
      </div>
    );
  if (!data.length) return <div className="mp-chart mp-chart-empty muted">No world record history</div>;
  const slider = data.length > WR_SLIDER_MIN;
  const start = range?.startIndex ?? 0;
  const end = range?.endIndex ?? data.length - 1;
  // The time axis follows the slider; scale the times to what's in view too.
  const scores = data.slice(start, end + 1).map((d) => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return (
    <div className={`mp-chart${slider ? " has-slider" : ""}`}>
      <TrophyIcon className="mp-chart-trophy" />
      <ResponsiveContainer width="100%" height={slider ? 190 : 150}>
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).getFullYear()}
            tick={{ fill: "var(--text-2)", fontSize: 14 }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            domain={[min, max]}
            ticks={[min, Math.round((min + max) / 2), max]}
            allowDataOverflow
            tickFormatter={formatScore}
            tick={{ fill: "var(--text-muted)", fontSize: 14 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: "var(--menu)",
              border: "1px solid var(--border)",
              borderRadius: 4,
            }}
            labelFormatter={(t) => formatDate(t)}
            formatter={(v, _n, item) => [formatScore(v), item.payload.player]}
          />
          <Line
            type="linear"
            dataKey="score"
            stroke="#9d5fd0"
            strokeWidth={2}
            dot={{
              r: 4,
              stroke: "#c48ef0",
              strokeWidth: 2,
              fill: "var(--panel)",
            }}
            isAnimationActive={false}
          />
          {slider && (
            <Brush
              dataKey="t"
              height={22}
              travellerWidth={8}
              startIndex={start}
              endIndex={end}
              onChange={(r) => setRange({ startIndex: r.startIndex, endIndex: r.endIndex })}
              tickFormatter={(t) => new Date(t).getFullYear()}
              stroke="#9d5fd0"
              fill="var(--panel)"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Leaderboard({ map, board }) {
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
      <YourBest map={map} board={board.data} onShow={showEntry} />
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
                  <span className="mp-ago muted">{timeAgo(e.timestamp)}</span>
                  <span className="mp-time num end">{formatScore(e.score)}</span>
                  <span className="mp-icons">
                    <CommentIcon className={e.note ? "" : "is-off"} titleAccess={e.note || "No comment"} />
                    <AutorenderLink run={e} game={map.game} rendered={rendered} />
                    <YouTubeLink id={e.youtubeId} />
                    <DownloadIcon className={e.demoId ? "" : "is-off"} titleAccess={e.demoId ? "Demo available" : "No demo"} />
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
      <span className="muted">{timeAgo(when)}</span>
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
              <span className="muted num">{formatDate(e.timestamp)}</span>
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

function ChamberHistory({ map }) {
  const version = useDataVersion();
  const history = useApi(() => fetchMapChangelog(map), [map.id, version]);
  if (history.loading && !history.data) return <Loading />;
  const rows = history.data || [];
  if (!rows.length) return <EmptyState>No submissions recorded for {map.title}.</EmptyState>;
  return (
    <div className="mp-table mp-history" role="table">
      <div className="mp-row mp-row-head" role="row">
        <span>Date</span>
        <span>Player(s)</span>
        <span className="end">Rank</span>
        <span className="end">Time</span>
        <span className="end">Δ</span>
      </div>
      {rows.map((e) => (
        <div className="mp-row" role="row" key={e.id}>
          <span className="muted">{formatDate(e.timestamp)}</span>
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
          <span className="end num">{formatScore(e.score)}</span>
          <span className="end num muted">{e.scoreDelta != null ? formatScore(e.scoreDelta) : ""}</span>
        </div>
      ))}
    </div>
  );
}
