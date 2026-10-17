import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar, EmptyState, Loading, Panel, PlayerLink } from "../../components/ui";
import { StatsIcon } from "../../components/Icons";
import { demoUrl, fetchWrStats } from "../../api/client";
import { GAMES, MODE_LABELS } from "../../data/maps";
import useApi from "../../hooks/useApi";
import useCurrentUser, { isStaff } from "../../hooks/useCurrentUser";
import { formatDate, formatLongScore, formatScore } from "../../lib/format";

// The World record pages of the Stats section (Records, History, Race, Times), all from one
// /stats/wr answer for the game.

const number = (n) => Number(n).toLocaleString("en-US");
const days = (d) => `${number(Math.round(d))} day${Math.round(d) === 1 ? "" : "s"}`;

// The game picked with ?game= (Portal 2 by default) and its boards.
function useGame() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("game");
  const game = GAMES[raw] && GAMES[raw].kind !== "season" ? raw : "portal2";
  const set = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  return { game, params, set };
}

export function useWrStats(game) {
  return useApi(() => fetchWrStats(game), [game]);
}

const label = (key) => (key === "overall" ? "Overall" : MODE_LABELS[key] || key);

function Segmented({ value, options, onChange, className = "" }) {
  return (
    <div className={`segmented st-seg ${className}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "is-active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Players of one or more teams (a co-op pair counts as one team).
function Teams({ teams, size = 22 }) {
  if (!teams?.length) return <span className="muted">–</span>;
  return (
    <span className="st-teams">
      {teams.map((t, i) => (
        <span className="st-team" key={i}>
          {t.players.map((p) => (
            <span className="st-holder" key={p.profileNumber}>
              <Avatar src={p.avatar} name={p.name} size={size} />
              <PlayerLink player={p} />
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

const mapLink = (r) => (r.map ? <Link to={`/map/${r.map.mode}/${r.mapId}`}>{r.mapName}</Link> : r.mapName);

function Shell({ title, actions, children, stats }) {
  return (
    <Panel icon={StatsIcon} title={title} bodyClassName="st-body" actions={actions}>
      {stats.loading && !stats.data ? <Loading label="Loading the record history" /> : !stats.data ? <EmptyState>Couldn’t load the stats.</EmptyState> : children(stats.data)}
    </Panel>
  );
}

// --- Records ---------------------------------------------------------------------

export function RecordsPanel() {
  const { game, params, set } = useGame();
  const stats = useWrStats(game);
  const modes = GAMES[game].modes;
  const mode = modes.includes(params.get("mode")) ? params.get("mode") : modes[0];
  return (
    <Shell title="World records" stats={stats} actions={<Segmented value={mode} options={modes.map((m) => ({ value: m, label: label(m) }))} onChange={(m) => set({ mode: m === modes[0] ? "" : m })} />}>
      {(s) => {
        const rows = s.records.filter((r) => r.mode === mode);
        const held = s.holders.filter((h) => h.held > 0);
        return (
          <>
            <div className="st-figures">
              {modes.map((m) => (
                <div className="st-figure" key={m}>
                  <span className="st-figure-label">{label(m)} total</span>
                  <span className="st-figure-value num">{formatLongScore(s.totalTime[m] || 0)}</span>
                  <span className="st-figure-note">{s.records.filter((r) => r.mode === m).length} records added up</span>
                </div>
              ))}
              <div className="st-figure">
                <span className="st-figure-label">Oldest record</span>
                <span className="st-figure-value num">{days(Math.max(0, ...s.records.map((r) => r.days)))}</span>
                <span className="st-figure-note">{[...s.records].sort((a, b) => b.days - a.days)[0]?.mapName}</span>
              </div>
            </div>

            <div className="st-table st-records" role="table">
              <div className="st-row st-head" role="row">
                <span>Map</span>
                <span className="end">Record</span>
                <span>Held by</span>
                <span>Since</span>
                <span className="end">Standing</span>
                <span className="end" title="Record times the map has had">Records</span>
              </div>
              {rows.map((r) => (
                <div className="st-row" role="row" key={r.mapId}>
                  <span className="st-map">{mapLink(r)}</span>
                  <span className="end num st-strong">{formatScore(r.score)}</span>
                  <Teams teams={r.teams} />
                  <span className="num st-date">{formatDate(r.since)}</span>
                  <span className="end num">{days(r.days)}</span>
                  <span className="end num muted">{r.records}</span>
                </div>
              ))}
            </div>

            <h2 className="st-section-title">Records held now</h2>
            <p className="muted st-intro">Every map’s current record, by player (ties count for everyone tied).</p>
            <ShareBars rows={held} total={s.records.length} />
          </>
        );
      }}
    </Shell>
  );
}

function ShareBars({ rows, total }) {
  const sorted = [...rows].sort((a, b) => b.held - a.held || b.days - a.days);
  const max = sorted[0]?.held || 1;
  return (
    <div className="st-share">
      {sorted.map((h) => (
        <div className="st-share-row" key={h.player.profileNumber}>
          <span className="st-player">
            <Avatar src={h.player.avatar} name={h.player.name} size={24} />
            <PlayerLink player={h.player} />
          </span>
          <span className="st-share-bar">
            <span style={{ width: `${(h.held / max) * 100}%` }} />
          </span>
          <span className="num st-strong">{h.held}</span>
          <span className="num muted st-share-pct">{((h.held / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// --- History ---------------------------------------------------------------------

const HISTORY = [
  { value: "longest", label: "Longest lasting" },
  { value: "domination", label: "Longest domination" },
  { value: "improvements", label: "Biggest improvements" },
  { value: "days", label: "Days holding" },
];

export function HistoryPanel() {
  const { game, params, set } = useGame();
  const stats = useWrStats(game);
  const view = HISTORY.some((h) => h.value === params.get("view")) ? params.get("view") : "longest";
  return (
    <Shell title="Record history" stats={stats}>
      {(s) => (
        <>
          <Segmented className="st-seg-wrap st-seg-body" value={view} options={HISTORY} onChange={(v) => set({ view: v === "longest" ? "" : v })} />
          {view === "domination" ? (
          <Domination rows={s.domination} />
        ) : view === "improvements" ? (
          <Improvements rows={s.improvements} />
        ) : view === "days" ? (
          <DaysHolding rows={s.holders} />
        ) : (
          <Longest rows={s.longest} />
        )}
        </>
      )}
    </Shell>
  );
}

function Longest({ rows }) {
  return (
    <>
      <p className="muted st-intro">Every record time a map has had, by how long it stood (records still standing count up to today).</p>
      <div className="st-table st-hist" role="table">
        <div className="st-row st-head" role="row">
          <span className="st-rank">#</span>
          <span>Map</span>
          <span className="end">Time</span>
          <span>Set by</span>
          <span className="end">Stood</span>
          <span>From – to</span>
          <span>Beaten by</span>
        </div>
        {rows.map((r, i) => (
          <div className="st-row" role="row" key={`${r.mapId}-${r.score}`}>
            <span className="st-rank num">{i + 1}</span>
            <span className="st-map">{mapLink(r)}</span>
            <span className="end num st-strong">{formatScore(r.score)}</span>
            <Teams teams={r.teams} />
            <span className="end num">{days(r.days)}</span>
            <span className="num st-date">
              {formatDate(r.start)} – {r.end ? formatDate(r.end) : <span className="st-live">still standing</span>}
            </span>
            <span>{r.end ? <><Teams teams={r.beatenBy} /> <span className="muted num">({formatScore(r.beatenWith)})</span></> : <span className="muted">–</span>}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Domination({ rows }) {
  return (
    <>
      <p className="muted st-intro">One player holding a map’s record through several record times in a row: the longest streaks.</p>
      <div className="st-table st-dom" role="table">
        <div className="st-row st-head" role="row">
          <span className="st-rank">#</span>
          <span>Map</span>
          <span>Player</span>
          <span className="end">Records</span>
          <span className="end">Held</span>
          <span>From – to</span>
          <span className="end">Times</span>
        </div>
        {rows.map((r, i) => (
          <div className="st-row" role="row" key={`${r.mapId}-${r.player.profileNumber}-${r.start}`}>
            <span className="st-rank num">{i + 1}</span>
            <span className="st-map">{mapLink(r)}</span>
            <span className="st-player">
              <Avatar src={r.player.avatar} name={r.player.name} size={22} />
              <PlayerLink player={r.player} />
            </span>
            <span className="end num st-strong">{r.records}</span>
            <span className="end num">{days(r.days)}</span>
            <span className="num st-date">
              {formatDate(r.start)} – {r.end ? formatDate(r.end) : <span className="st-live">still holds it</span>}
            </span>
            <span className="end num muted">
              {formatScore(r.fromScore)} → {formatScore(r.toScore)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Improvements({ rows }) {
  return (
    <>
      <p className="muted st-intro">The biggest single cuts to a world record.</p>
      <div className="st-table st-imp" role="table">
        <div className="st-row st-head" role="row">
          <span className="st-rank">#</span>
          <span>Map</span>
          <span className="end">Saved</span>
          <span className="end">Time</span>
          <span>By</span>
          <span>Date</span>
          <span>Previous record</span>
        </div>
        {rows.map((r, i) => (
          <div className="st-row" role="row" key={`${r.mapId}-${r.toScore}`}>
            <span className="st-rank num">{i + 1}</span>
            <span className="st-map">{mapLink(r)}</span>
            <span className="end num st-strong st-good">−{formatScore(r.delta)}</span>
            <span className="end num">
              <span className="muted">{formatScore(r.fromScore)} →</span> {formatScore(r.toScore)}
            </span>
            <Teams teams={r.teams} />
            <span className="num st-date">{formatDate(r.date)}</span>
            <span>
              <Teams teams={r.previous} /> <span className="muted num">(stood {days(r.previousDays)})</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function DaysHolding({ rows }) {
  const top = rows.slice(0, 100);
  return (
    <>
      <p className="muted st-intro">
        Days spent holding world records, every map added together (holding two records for a day counts two). Ties count from the player’s own run.
      </p>
      <div className="st-table st-days" role="table">
        <div className="st-row st-head" role="row">
          <span className="st-rank">#</span>
          <span>Player</span>
          <span className="end">Record-days</span>
          <span className="end">Years</span>
          <span className="end">Records set</span>
          <span className="end">Held now</span>
        </div>
        {top.map((h, i) => (
          <div className="st-row" role="row" key={h.player.profileNumber}>
            <span className="st-rank num">{i + 1}</span>
            <span className="st-player">
              <Avatar src={h.player.avatar} name={h.player.name} size={24} />
              <PlayerLink player={h.player} />
            </span>
            <span className="end num st-strong">{number(Math.round(h.days))}</span>
            <span className="end num muted">{(h.days / 365.25).toFixed(1)}</span>
            <span className="end num">{number(h.set)}</span>
            <span className="end num">{h.held}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// --- Race ------------------------------------------------------------------------

// A steady colour per player.
const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const ROW = 40;

export function RacePanel() {
  const { game, params, set } = useGame();
  const stats = useWrStats(game);
  const boards = [...GAMES[game].modes, "overall"];
  const board = boards.includes(params.get("board")) ? params.get("board") : "overall";
  return (
    <Shell title="World record race" stats={stats} actions={<Segmented value={board} options={boards.map((b) => ({ value: b, label: label(b) }))} onChange={(b) => set({ board: b === "overall" ? "" : b })} />}>
      {(s) => <Race frames={s.race[board]?.frames || []} players={s.racePlayers} />}
    </Shell>
  );
}

function Race({ frames, players }) {
  const [index, setIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  useEffect(() => setIndex(frames.length - 1), [frames]);
  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 220);
    return () => clearInterval(timer.current);
  }, [playing, frames.length]);
  const frame = frames[index];
  // Everyone in this frame, placed by rank; bars slide between places as the frames change.
  const ids = useMemo(() => [...new Set(frames.flatMap((f) => f.top.map((t) => t.profileNumber)))], [frames]);
  if (!frame) return <EmptyState>No records yet.</EmptyState>;
  const max = Math.max(1, ...frame.top.map((t) => t.held));
  const place = Object.fromEntries(frame.top.map((t, i) => [t.profileNumber, i]));
  const play = () => {
    if (index >= frames.length - 1) setIndex(0);
    setPlaying((p) => !p);
  };
  return (
    <>
      <p className="muted st-intro">How many maps’ records each player held, month by month since the first record. Press play.</p>
      <div className="st-race-controls">
        <button type="button" className="st-play" onClick={play} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          aria-label="Month"
        />
        <span className="st-race-date num">{new Date(frame.date).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
      </div>
      <div className="st-race" style={{ height: frame.top.length * ROW + 8 }}>
        {ids.map((id) => {
          const at = place[id];
          const p = players[id];
          const held = frame.top[at]?.held || 0;
          return (
            <div
              key={id}
              className="st-race-row"
              style={{ transform: `translateY(${(at ?? frame.top.length) * ROW}px)`, opacity: at === undefined ? 0 : 1 }}
            >
              <span className="st-race-name">
                <Avatar src={p?.avatar} name={p?.name} size={24} />
                <span>{p?.name || id}</span>
              </span>
              <span className="st-race-track">
                <span className="st-race-bar" style={{ width: `${(held / max) * 100}%`, background: `hsl(${hue(id)} 60% 52%)` }} />
                <span className="st-race-count num">{held || ""}</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// --- Times -----------------------------------------------------------------------

export function TimesPanel() {
  const { game, params, set } = useGame();
  const stats = useWrStats(game);
  const user = useCurrentUser();
  const modes = GAMES[game].modes;
  const mode = modes.includes(params.get("mode")) ? params.get("mode") : modes[0];
  return (
    <Shell title="Time endings" stats={stats} actions={<Segmented value={mode} options={modes.map((m) => ({ value: m, label: label(m) }))} onChange={(m) => set({ mode: m === modes[0] ? "" : m })} />}>
      {(s) => (
        <>
          <p className="muted st-intro">
            How often each hundredths ending appears in verified times. A run’s time is its ticks ÷ 60 cut down to the hundredth, so times
            end in 0, 1, 3, 5, 6 or 8. The rest are rare: <strong className="st-amber">…4 and …9</strong> are times that came out 0.01 low because of how some
            setups (Linux among them) handle the timer, and <strong className="st-red">…2 and …7</strong> mostly the same, rounded the other way. Banned runs
            from 2014–16 with these endings are from the <code>-tickrate</code> era and aren’t counted here.
          </p>
          <Endings counts={s.endings[mode] || []} />
          {isStaff(user) && <Flagged data={s.flagged} />}
        </>
      )}
    </Shell>
  );
}

function Endings({ counts }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="st-endings" role="img" aria-label="Runs per hundredths ending">
      {counts.map((n, cs) => (
        <span
          key={cs}
          className={`st-ending${cs % 5 === 2 ? " is-unlikely" : cs % 5 === 4 ? " is-low" : ""}`}
          title={`.${String(cs).padStart(2, "0")}: ${number(n)} runs (${((n / total) * 100).toFixed(2)}%)`}
        >
          <span className="st-ending-bar" style={{ height: `${Math.max(1, (n / max) * 100)}%` }} />
          {cs % 10 === 0 && <span className="st-ending-label num">.{String(cs).padStart(2, "0")}</span>}
        </span>
      ))}
    </div>
  );
}

const GROUPS = [
  { kind: "mismatch", title: "Doesn’t match its demo", note: "More than 0.03 s from what the demo’s ticks say. The ones to check (a few are map-trigger quirks).", open: true },
  { kind: "no_check", title: "Odd ending, no demo to check", note: "Times ending in …2 or …7 with no demo, or one whose splits haven’t been read.", open: true },
  { kind: "low", title: "0.01 under its demo", note: "Timer rounding: the demo’s ticks give a time 0.01 higher. Not a different run.", open: false },
  { kind: "rounded", title: "Rounded up instead of cut", note: "The same timer difference the other way. Not a different run.", open: false },
];

function Flagged({ data }) {
  return (
    <>
      <h2 className="st-section-title">
        Runs to check <span className="st-staff">staff only</span>
      </h2>
      <p className="muted st-intro">
        Verified runs compared with their own demo. Not listed: {number(data.low49)} runs ending in …4 or …9 that are 0.01 under their demo
        (timer rounding).
      </p>
      {GROUPS.map((g) => (
        <FlaggedGroup key={g.kind} group={g} count={data.counts[g.kind] || 0} rows={data.runs.filter((r) => r.kind === g.kind)} />
      ))}
    </>
  );
}

function FlaggedGroup({ group, count, rows }) {
  const [open, setOpen] = useState(group.open);
  return (
    <section className={`st-flag${group.kind === "mismatch" ? " is-alert" : ""}`}>
      <button type="button" className="st-flag-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="st-flag-title">
          {group.title} <span className="num st-flag-count">{number(count)}</span>
        </span>
        <span className="muted st-flag-note">{group.note}</span>
        <span className="st-flag-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open &&
        (rows.length ? (
          <div className="st-table st-unlikely" role="table">
            <div className="st-row st-head" role="row">
              <span>Map</span>
              <span className="end">Time</span>
              <span className="end">Demo</span>
              <span>Player</span>
              <span className="end">Rank</span>
              <span>Date</span>
              <span>File</span>
            </div>
            {rows.map((r) => (
              <div className="st-row" role="row" key={r.id}>
                <span className="st-map">{mapLink(r)}</span>
                <span className="end num st-strong">{formatScore(r.score)}</span>
                <span className={`end num${r.demoScore != null && r.demoScore > r.score + 3 ? " st-bad" : ""}`}>{r.demoScore != null ? formatScore(r.demoScore) : <span className="muted">–</span>}</span>
                <span className="st-player">
                  <Avatar src={r.player.avatar} name={r.player.name} size={22} />
                  <PlayerLink player={r.player} />
                </span>
                <span className="end num">{r.postRank ?? "–"}</span>
                <span className="num st-date">{r.timestamp ? formatDate(r.timestamp) : <span className="muted">no date</span>}</span>
                <span>{r.demoId ? <a href={demoUrl(r.demoId)} download>Demo</a> : <span className="muted">none</span>}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">None.</p>
        ))}
    </section>
  );
}
