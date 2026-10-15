import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Pagination, Select, Avatar, Flag, PlayerLink, Loading, EmptyState } from "../../components/ui";
import useCurrentUser from "../../hooks/useCurrentUser";
import { fetchAggregatedBoard } from "../../api/boards";
import { GAMES, MODE_LABELS, chapterDbId, isMultiplayerMode, p2ChapterByDbId, spChapters, coopChapters } from "../../data/maps";
import useApi from "../../hooks/useApi";
import { formatPoints, formatLongScore } from "../../lib/format";
import background from "../../scenes/global/img/OverallOpaque.png";
import { countryName } from "../../data/countries";
import "./Aggregated.css";

// Route segment -> [title, API kind] per game.
const KINDS = {
  portal2: {
    overall: ["Overall", "overall"],
    sp: ["Single Player", "sp"],
    coop: ["Cooperative", "coop"],
  },
  mel: {
    overall: ["Overall", "mel-overall"],
    story: ["Story Mode", "story"],
    advanced: ["Advanced Mode", "advanced"],
  },
};

const BASE = { portal2: "/leaderboard", mel: "/leaderboard/mel" };
// Leaderboard home of a game: built-in games keep their old addresses.
export const gameBoardsPath = (game) => (BASE[game] ? `${BASE[game]}/overall` : `/leaderboard/game/${game}/overall`);
const categories = () =>
  Object.values(GAMES).map((g) => ({ value: g.id, label: g.id === "portal2" ? "Portal 2 Challenge Mode" : g.label }));

// The season running now (else the latest one), for /leaderboard/season.
export function currentSeason() {
  const seasons = Object.values(GAMES).filter((g) => g.kind === "season" && !g.hidden);
  const now = Date.now();
  const live = seasons.filter((g) => new Date(`${g.startsAt}Z`) <= now && (!g.endsAt || new Date(`${g.endsAt}Z`) > now));
  const byStart = (a, b) => new Date(b.startsAt) - new Date(a.startsAt);
  return live.sort(byStart)[0] || seasons.sort(byStart)[0] || null;
}
const PAGE_SIZE = 20;

// Portal 2 board picker: the three aggregated boards plus one per chapter.
// Single Player / Cooperative: all of the mode's chapters, or one chapter / course.
const chapterBoards = (mode) => [
  { value: `/leaderboard/${mode}`, label: mode === "coop" ? "All courses" : "All chapters" },
  ...(mode === "coop" ? coopChapters : spChapters).map((c) => ({
    value: `/leaderboard/chapter/${chapterDbId(c)}`,
    label: `${isMultiplayerMode(c.mode) ? "Course" : "Chapter"} ${c.number}: ${c.name}`,
  })),
];

export default function Aggregated({ game = "portal2" }) {
  const { kind, chapterId, gameId, board } = useParams();
  if (kind === "season") {
    const season = currentSeason();
    return season ? <Navigate to={gameBoardsPath(season.id)} replace /> : <NoSeason />;
  }
  if (gameId) {
    const g = GAMES[gameId];
    if (!g) return <Navigate to="/leaderboard/overall" replace />;
    if (BASE[gameId]) return <Navigate to={gameBoardsPath(gameId)} replace />;
    const boardKey = board === "overall" || g.modes.includes(board) ? board : null;
    if (!boardKey) return <Navigate to={gameBoardsPath(gameId)} replace />;
    const title = boardKey === "overall" ? "Overall" : MODE_LABELS[boardKey] || boardKey;
    // Season dates are UTC; show them as entered.
    const day = (ts) => String(ts).slice(0, 10);
    const span = g.kind === "season" && g.startsAt ? `${day(g.startsAt)} – ${g.endsAt ? day(g.endsAt) : "ongoing"}` : null;
    return (
      <AggregatedContent
        key={`${gameId}-${boardKey}`}
        game={gameId}
        kind={boardKey}
        title={title}
        apiKind={`game:${gameId}:${boardKey}`}
        kicker={span ? `${g.label} · ${span}` : g.label}
      />
    );
  }
  if (chapterId) {
    const chapter = p2ChapterByDbId(chapterId);
    if (!chapter) return <Navigate to="/leaderboard/overall" replace />;
    const kicker = `${MODE_LABELS[chapter.mode]} · ${chapter.mode === "coop" ? "Course" : "Chapter"} ${chapter.number}`;
    return <AggregatedContent key={`chapter-${chapterId}`} game="portal2" kind={chapter.mode} title={chapter.name} apiKind={`chapter-${chapterId}`} kicker={kicker} />;
  }
  if (!KINDS[game][kind]) return <Navigate to={`${BASE[game]}/overall`} replace />;
  const [title, apiKind] = KINDS[game][kind];
  return <AggregatedContent key={`${game}-${kind}`} game={game} kind={kind} title={title} apiKind={apiKind} />;
}

function AggregatedContent({ game, kind, title, apiKind, kicker = "Aggregated points and times" }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const data = useApi(() => (apiKind ? fetchAggregatedBoard(game, apiKind) : Promise.resolve(null)), [game, apiKind]);
  // Who's best in a country: the boards filtered to its players (ranks within the country).
  const [params, setParams] = useSearchParams();
  const country = params.get("country") || "";
  // ?player=: open on the page with this player, their row marked (from a profile's ranks).
  const focus = params.get("player") || null;
  const setCountry = (c) => setParams(c ? { country: c } : {}, { replace: true });
  const countries = [...new Set((data.data?.points || []).map((r) => r.player.country).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const inCountry = (rows) => (country ? rows.filter((r) => r.player.country === country) : rows);

  return (
    <Layout background={background} tint="warm">
      <header className="agg-header">
        <p className="agg-kicker">{kicker}</p>
        <h1 className="agg-title">{title}</h1>
        <div className="agg-selects">
          <Select value={game} onChange={(g) => navigate(gameBoardsPath(g))} options={categories()} label="Games" className="agg-select" />
          {game === "portal2" && (kind === "sp" || kind === "coop") && (
            <Select value={pathname} onChange={(to) => navigate(to)} options={chapterBoards(kind)} label="Chapter" className="agg-select" />
          )}
          {countries.length > 0 && (
            <Select
              value={country}
              onChange={setCountry}
              options={[{ value: "", label: "All countries" }, ...countries.map((c) => ({ value: c, label: countryName(c) }))]}
              label="Country"
              className="agg-select"
            />
          )}
        </div>
        {game === "portal2" && (
          <nav className="agg-modes" aria-label="Portal 2 boards">
            {Object.entries(KINDS.portal2).map(([k, [label]]) => (
              <Link key={k} to={`${BASE.portal2}/${k}`} className={k === kind ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        )}
        {game === "mel" && (
          <nav className="agg-modes" aria-label="Mel boards">
            {Object.entries(KINDS.mel).map(([k, [label]]) => (
              <Link key={k} to={`${BASE.mel}/${k}`} className={k === kind ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        )}
        {!BASE[game] && GAMES[game] && (
          <nav className="agg-modes" aria-label={`${GAMES[game].label} boards`}>
            {["overall", ...GAMES[game].modes].map((k) => (
              <Link key={k} to={`/leaderboard/game/${game}/${k}`} className={k === kind ? "is-active" : ""}>
                {k === "overall" ? "Overall" : MODE_LABELS[k] || k}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Points and times as two separate panels side by side. */}
      <section className="agg-panel">
        {data.loading && !data.data ? (
          <Loading />
        ) : (
          <div className="agg-columns">
            <Board key={`points-${country}`} focus={focus} title="Points" rows={inCountry(data.data?.points || [])} valueLabel="Aggregated points" value={(r) => formatPoints(r.points)} />
            <Board
              key={`time-${country}`}
              focus={focus}
              title="Time"
              rows={inCountry(data.data?.times || [])}
              valueLabel="Aggregated time"
              value={(r) => formatLongScore(r.score)}
              empty={data.data?.mapCount ? `No one has a time on all ${data.data.mapCount} maps yet.` : "No players yet."}
            />
          </div>
        )}
      </section>
    </Layout>
  );
}

function NoSeason() {
  return (
    <Layout background={background} tint="warm" narrow>
      <header className="agg-header">
        <p className="agg-kicker">Seasons</p>
        <h1 className="agg-title">No season yet</h1>
      </header>
      <section className="agg-panel">
        <EmptyState>There’s no season running. Check back soon.</EmptyState>
      </section>
    </Layout>
  );
}

function Board({ title, rows, valueLabel, value, focus = null, empty = "No players yet." }) {
  const me = useCurrentUser();
  const focusIndex = focus ? rows.findIndex((r) => r.player.profileNumber === focus) : -1;
  const [page, setPage] = useState(focusIndex >= 0 ? Math.floor(focusIndex / PAGE_SIZE) : 0);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div className="agg-board">
      <h2 className="agg-board-head">{title}</h2>
      <div className="agg-pagination">
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      <div className="agg-row agg-row-head">
        <span />
        <span className="agg-rank">#</span>
        <span>Player</span>
        <span className="end">{valueLabel}</span>
      </div>
      {visible.length ? (
        visible.map((r, i) => (
          <div
            className={`agg-row${me && !me.sample && r.player.profileNumber === me.profileNumber ? " is-me" : ""}${focus && r.player.profileNumber === focus ? " is-focus" : ""}`}
            key={r.player.profileNumber || i}
          >
            <Avatar src={r.player.avatar} name={r.player.name} size={46} />
            <span className="agg-rank num">{r.rank ?? page * PAGE_SIZE + i + 1}</span>
            <span className="agg-player">
              <Flag code={r.player.country} height={20} />
              <PlayerLink player={r.player} />
            </span>
            <span className="agg-value num end">{value(r)}</span>
          </div>
        ))
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </div>
  );
}
