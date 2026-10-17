import { Link, NavLink, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Avatar, EmptyState, Loading, Panel, PlayerLink } from "../../components/ui";
import { StatsIcon } from "../../components/Icons";
import { ComparePanel } from "../Compare";
import { CountriesPanel } from "../Countries";
import { fetchSiteStats } from "../../api/client";
import { HistoryPanel, RacePanel, RecordsPanel, useWrStats } from "./WrPages";
import { GAMES, MODE_LABELS } from "../../data/maps";
import useApi from "../../hooks/useApi";
import useGame from "../../hooks/useGame";
import { formatDate, formatLongScore, formatPoints, formatScore, timeAgo } from "../../lib/format";
import background from "../../scenes/global/img/Background.png";
import "./Stats.css";

const TABS = [
  { path: "/stats", label: "Runners" },
  { path: "/stats/records", label: "Records" },
  { path: "/stats/history", label: "History" },
  { path: "/stats/race", label: "Race" },
  { path: "/stats/compare", label: "Compare" },
  { path: "/stats/countries", label: "Countries" },
];
const PANELS = { records: RecordsPanel, history: HistoryPanel, race: RacePanel, compare: ComparePanel, countries: CountriesPanel };

// The Stats section: site-wide runner stats, with Compare players and Countries as its other tabs.
export default function Stats({ tab = "runners" }) {
  return (
    <Layout background={background} tint="mono">
      <nav className="st-tabs" aria-label="Stats pages">
        {TABS.map((t) => (
          <NavLink key={t.path} to={t.path} end className={({ isActive }) => (isActive ? "is-active" : "")}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {(() => {
        const Tab = PANELS[tab] || RunnersPanel;
        return <Tab />;
      })()}
    </Layout>
  );
}

const number = (n) => Number(n).toLocaleString("en-US");

// The leader lists, in the order shown.
const LEADERS = [
  { key: "wr_held", title: "World records held", note: "current records, ties count", format: number },
  { key: "wr_set", title: "World records set", note: "runs that took the record", format: number },
  { key: "runs", title: "Most runs", note: "verified runs on the boards", format: number },
  { key: "runs_year", title: "Most active this year", note: "runs in the past 365 days", format: number },
  { key: "partners", title: "Most co-op partners", note: "different players run with", format: number },
  { key: "demos", title: "Most demos", note: "runs submitted with a demo", format: number },
  { key: "portals", title: "Most portals placed", note: "counted from demos", format: number },
  { key: "time_saved", title: "Most time saved", note: "taken off personal bests", format: (v) => formatLongScore(v) },
  { key: "record_days", title: "Most days holding records", note: "every map added together", format: (v) => number(Math.round(v)) },
];

function RunnersPanel() {
  const [params, setParams] = useSearchParams();
  // The game picked under the logo.
  const game = useGame();
  const boards = [...GAMES[game].modes, "overall"];
  const board = boards.includes(params.get("board")) ? params.get("board") : "overall";
  const set = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const stats = useApi(() => fetchSiteStats(game), [game]);
  const wr = useWrStats(game);
  const s = stats.data && { ...stats.data, leaders: { ...stats.data.leaders, record_days: (wr.data?.holders || []).slice(0, 10).map((h) => ({ player: h.player, value: h.days })) } };

  return (
    <Panel
      icon={StatsIcon}
      title="Runners"
      bodyClassName="st-body"
    >
      {stats.loading && !s ? (
        <Loading label="Working out the stats" />
      ) : !s ? (
        <EmptyState>Couldn’t load the stats.</EmptyState>
      ) : (
        <>
          <Totals totals={s.totals} />

          <div className="st-section-head">
            <h2 className="st-section-title">Peak points</h2>
            <div className="segmented st-boards" role="group" aria-label="Board">
              {boards.map((b) => (
                <button key={b} type="button" className={b === board ? "is-active" : ""} onClick={() => set({ board: b === "overall" ? "" : b })}>
                  {b === "overall" ? "Overall" : MODE_LABELS[b] || b}
                </button>
              ))}
            </div>
          </div>
          <p className="muted st-intro">
            The most points each player has ever had on the board, with the day they reached it and where they stand now. Points fall as
            others pass them, so a peak is a high-water mark.
          </p>
          <PeakTable rows={s.peaks[board] || []} board={board} />

          <h2 className="st-section-title">Leaders</h2>
          <div className="st-cards">
            {LEADERS.map((l) => (
              <LeaderCard key={l.key} title={l.title} note={l.note} rows={s.leaders[l.key] || []} format={l.format} />
            ))}
          </div>

          <h2 className="st-section-title">Longest-standing world records</h2>
          <p className="muted st-intro">Current records, oldest first: the time, who holds it and since when.</p>
          <LongestTable rows={s.longestWrs} game={game} />
        </>
      )}
    </Panel>
  );
}

function Totals({ totals: t }) {
  const figures = [
    ["Runners", number(t.runners), `${number(t.runnersYear)} ran this year`],
    ["Runs", number(t.runs), `${number(t.runsYear)} this year`],
    ["World records", number(t.worldRecords), "set since 2012"],
    ["Demos", number(t.demos), `${number(t.rendered)} autorendered`],
    ["Maps", number(t.maps), "with runs"],
    ["Countries", number(t.countries), "of ranked runners"],
  ];
  return (
    <div className="st-figures">
      {figures.map(([label, value, note]) => (
        <div className="st-figure" key={label}>
          <span className="st-figure-label">{label}</span>
          <span className="st-figure-value num">{value}</span>
          <span className="st-figure-note">{note}</span>
        </div>
      ))}
    </div>
  );
}

function PeakTable({ rows, board }) {
  if (!rows.length) return <EmptyState>No points on this board yet.</EmptyState>;
  return (
    <div className="st-table st-peaks" role="table">
      <div className="st-row st-head" role="row">
        <span className="st-rank">#</span>
        <span>Player</span>
        <span className="end">Peak</span>
        <span>Reached</span>
        <span className="end">Now</span>
        <span className="end">Change</span>
      </div>
      {rows.map((r, i) => {
        const drop = r.current - r.points;
        return (
          <div className="st-row" role="row" key={r.player.profileNumber}>
            <span className="st-rank num">{i + 1}</span>
            <span className="st-player">
              <Avatar src={r.player.avatar} name={r.player.name} size={26} />
              <PlayerLink player={r.player} />
            </span>
            <span className="end num st-strong">{formatPoints(r.points)}</span>
            <span className="num">
              <Link to={`/profile/${r.player.profileNumber}?at=${r.date}`} title="Their profile as it was that day">
                {formatDate(r.date)}
              </Link>
            </span>
            <span className="end num">{formatPoints(r.current)}</span>
            <span className={`end num ${drop < -0.05 ? "st-down" : "st-same"}`}>{drop < -0.05 ? formatPoints(drop) : "at peak"}</span>
          </div>
        );
      })}
    </div>
  );
}

function LeaderCard({ title, note, rows, format }) {
  return (
    <section className="st-card">
      <h3 className="st-card-title">
        {title}
        <span className="st-card-note">{note}</span>
      </h3>
      {rows.length ? (
        <ol className="st-list">
          {rows.map((r, i) => (
            <li className="st-list-row" key={r.player.profileNumber}>
              <span className="st-rank num">{i + 1}</span>
              <Avatar src={r.player.avatar} name={r.player.name} size={24} />
              <PlayerLink player={r.player} className="st-list-name" />
              <span className="num st-list-value">{format(r.value)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nothing yet.</p>
      )}
    </section>
  );
}

function LongestTable({ rows, game }) {
  if (!rows.length) return <EmptyState>No dated records yet.</EmptyState>;
  return (
    <div className="st-table st-longest" role="table">
      <div className="st-row st-head" role="row">
        <span className="st-rank">#</span>
        <span>Map</span>
        <span>Held by</span>
        <span className="end">Time</span>
        <span>Since</span>
      </div>
      {rows.map((r, i) => (
        <div className="st-row" role="row" key={r.mapId}>
          <span className="st-rank num">{i + 1}</span>
          <span>
            {r.map ? (
              <Link to={`/map/${r.map.mode}/${r.mapId}`}>{r.mapName}</Link>
            ) : (
              r.mapName
            )}
            {r.isCoop && <span className="muted"> · co-op</span>}
          </span>
          <span className="st-player st-holders">
            {r.players.map((p) => (
              <span key={p.profileNumber} className="st-holder">
                <Avatar src={p.avatar} name={p.name} size={24} />
                <PlayerLink player={p} />
              </span>
            ))}
          </span>
          <span className="end num st-strong">{formatScore(r.score)}</span>
          <span className="num">
            {formatDate(r.since)} <span className="muted">({timeAgo(r.since)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}
