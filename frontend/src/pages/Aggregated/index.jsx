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
import { baseBoardOf, currentSeason, seasonBoard, withSeason } from "../../data/seasons";
import SeasonSelect from "../../components/SeasonSelect";
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
// A board of a game: built-in games keep their old addresses.
const boardPath = (game, board) => (BASE[game] ? `${BASE[game]}/${board}` : `/leaderboard/game/${game}/${board}`);
export const gameBoardsPath = (game) => boardPath(game, "overall");
// Games only: seasons are picked on their game's page (SeasonSelect).
const categories = () =>
  Object.values(GAMES)
    .filter((g) => g.kind !== "season")
    .map((g) => ({ value: g.id, label: g.id === "portal2" ? "Portal 2 Challenge Mode" : g.label }));

// Season dates are UTC; shown as entered.
const seasonKicker = (season) => {
  const g = GAMES[season];
  const day = (ts) => String(ts).slice(0, 10);
  return g.startsAt ? `${g.label} · ${day(g.startsAt)} – ${g.endsAt ? day(g.endsAt) : "ongoing"}` : g.label;
};
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
  const [params] = useSearchParams();
  const { search } = useLocation();
  // ?season=: one of the game's seasons instead of all-time.
  const seasonOf = (base) => {
    const key = params.get("season");
    return key && GAMES[key]?.kind === "season" && GAMES[key].base === base ? key : null;
  };
  if (kind === "season") {
    const season = currentSeason();
    return season ? <Navigate to={withSeason(gameBoardsPath(season.base), season.id)} replace /> : <NoSeason />;
  }
  if (gameId) {
    const g = GAMES[gameId];
    if (!g) return <Navigate to="/leaderboard/overall" replace />;
    if (BASE[gameId]) return <Navigate to={gameBoardsPath(gameId)} replace />;
    // An old season address: its game's board with the season picked.
    if (g.kind === "season" && g.base && GAMES[g.base]) {
      return <Navigate to={withSeason(`${boardPath(g.base, baseBoardOf(gameId, board || "overall"))}${search}`, gameId)} replace />;
    }
    const boardKey = board === "overall" || g.modes.includes(board) ? board : null;
    if (!boardKey) return <Navigate to={gameBoardsPath(gameId)} replace />;
    const title = boardKey === "overall" ? "Overall" : MODE_LABELS[boardKey] || boardKey;
    const season = seasonOf(gameId);
    const sb = season && seasonBoard(season, gameId, boardKey);
    return (
      <AggregatedContent
        key={`${gameId}-${boardKey}-${season || ""}`}
        game={gameId}
        kind={boardKey}
        title={title}
        season={season}
        apiKind={season ? sb && `game:${season}:${sb}` : `game:${gameId}:${boardKey}`}
        kicker={season ? seasonKicker(season) : g.label}
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
  const season = seasonOf(game);
  if (season) {
    const sb = seasonBoard(season, game, kind);
    return <AggregatedContent key={`${game}-${kind}-${season}`} game={game} kind={kind} title={title} season={season} apiKind={sb && `game:${season}:${sb}`} kicker={seasonKicker(season)} />;
  }
  return <AggregatedContent key={`${game}-${kind}`} game={game} kind={kind} title={title} apiKind={apiKind} />;
}

function AggregatedContent({ game, kind, title, apiKind, season = null, kicker = "Aggregated points and times" }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const data = useApi(() => (apiKind ? fetchAggregatedBoard(game, apiKind) : Promise.resolve(null)), [game, apiKind]);
  // Who's best in a country: the boards filtered to its players (ranks within the country).
  const [params, setParams] = useSearchParams();
  const country = params.get("country") || "";
  // ?player=: open on the page with this player, their row marked (from a profile's ranks).
  const focus = params.get("player") || null;
  const setCountry = (c) => setParams(c ? { country: c } : {}, { replace: true });
  // Switching board (tab or chapter) keeps the chosen country and season.
  const keep = (to, s = season) => withSeason(country ? `${to}?country=${country}` : to, s);
  const countries = [...new Set((data.data?.points || []).map((r) => r.player.country).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const inCountry = (rows) => (country ? rows.filter((r) => r.player.country === country) : rows);

  return (
    <Layout background={background} tint="warm">
      <header className="agg-header">
        <p className="agg-kicker">{kicker}</p>
        <h1 className="agg-title">{title}</h1>
        <div className="agg-selects">
          <Select value={game} onChange={(g) => navigate(keep(gameBoardsPath(g), null))} options={categories()} label="Games" className="agg-select" />
          <SeasonSelect base={game} season={season} onChange={(s) => navigate(keep(s && pathname.includes("/chapter/") ? boardPath(game, kind) : pathname, s))} className="agg-select" />
          {!season && game === "portal2" && (kind === "sp" || kind === "coop") && (
            <Select value={pathname} onChange={(to) => navigate(keep(to))} options={chapterBoards(kind)} label="Chapter" className="agg-select" />
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
              <Link key={k} to={keep(`${BASE.portal2}/${k}`)} className={k === kind ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        )}
        {game === "mel" && (
          <nav className="agg-modes" aria-label="Mel boards">
            {Object.entries(KINDS.mel).map(([k, [label]]) => (
              <Link key={k} to={keep(`${BASE.mel}/${k}`)} className={k === kind ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        )}
        {!BASE[game] && GAMES[game] && (
          <nav className="agg-modes" aria-label={`${GAMES[game].label} boards`}>
            {["overall", ...GAMES[game].modes].map((k) => (
              <Link key={k} to={keep(`/leaderboard/game/${game}/${k}`)} className={k === kind ? "is-active" : ""}>
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
