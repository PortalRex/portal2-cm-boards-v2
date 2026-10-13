import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Pagination, Select, Avatar, Flag, PlayerLink, Loading, EmptyState } from "../../components/ui";
import { fetchAggregatedBoard } from "../../api/boards";
import { MODE_LABELS, chapterDbId, p2ChapterByDbId, spChapters, coopChapters } from "../../data/maps";
import useApi from "../../hooks/useApi";
import { formatPoints, formatLongScore } from "../../lib/format";
import background from "../../scenes/global/img/OverallOpaque.png";
import "./Aggregated.css";

// Route segment -> [title, API kind] per game.
const KINDS = {
  portal2: {
    overall: ["Overall", "overall"],
    sp: ["Single Player", "sp"],
    coop: ["Cooperative", "coop"],
    season: ["Season 1", null],
  },
  mel: {
    story: ["Story Mode", "story"],
    advanced: ["Advanced Mode", "advanced"],
    overall: ["Overall", "mel-overall"],
  },
};

const CATEGORIES = [
  { value: "portal2", label: "Portal 2 Challenge Mode" },
  { value: "mel", label: "Portal Stories: Mel" },
];
const BASE = { portal2: "/leaderboard", mel: "/leaderboard/mel" };
const PAGE_SIZE = 20;

// Portal 2 board picker: the three aggregated boards plus one per chapter.
const P2_BOARDS = [
  ...["overall", "sp", "coop"].map((k) => ({ value: `/leaderboard/${k}`, label: KINDS.portal2[k][0] })),
  ...[...spChapters, ...coopChapters].map((c) => ({
    value: `/leaderboard/chapter/${chapterDbId(c)}`,
    label: `${c.mode === "coop" ? "Course" : "Chapter"} ${c.number}: ${c.name}`,
  })),
];

export default function Aggregated({ game = "portal2" }) {
  const { kind, chapterId } = useParams();
  if (chapterId) {
    const chapter = p2ChapterByDbId(chapterId);
    if (!chapter) return <Navigate to="/leaderboard/overall" replace />;
    const kicker = `${MODE_LABELS[chapter.mode]} · ${chapter.mode === "coop" ? "Course" : "Chapter"} ${chapter.number}`;
    return <AggregatedContent key={`chapter-${chapterId}`} game="portal2" title={chapter.name} apiKind={`chapter-${chapterId}`} kicker={kicker} />;
  }
  if (!KINDS[game][kind]) return <Navigate to={`${BASE[game]}/overall`} replace />;
  const [title, apiKind] = KINDS[game][kind];
  return <AggregatedContent key={`${game}-${kind}`} game={game} kind={kind} title={title} apiKind={apiKind} />;
}

function AggregatedContent({ game, kind, title, apiKind, kicker = "Aggregated points and times" }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const data = useApi(() => (apiKind ? fetchAggregatedBoard(game, apiKind) : Promise.resolve(null)), [game, apiKind]);

  return (
    <Layout background={background} tint="warm" narrow>
      <header className="agg-header">
        <p className="agg-kicker">{kicker}</p>
        <h1 className="agg-title">{title}</h1>
        <div className="agg-selects">
          <Select value={game} onChange={(g) => navigate(`${BASE[g]}/overall`)} options={CATEGORIES} label="Category" className="agg-select" />
          {game === "portal2" && P2_BOARDS.some((b) => b.value === pathname) && (
            <Select value={pathname} onChange={(to) => navigate(to)} options={P2_BOARDS} label="Board" className="agg-select" />
          )}
        </div>
        {game === "mel" && (
          <nav className="agg-modes" aria-label="Mel boards">
            {Object.entries(KINDS.mel).map(([k, [label]]) => (
              <Link key={k} to={`${BASE.mel}/${k}`} className={k === kind ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <section className="agg-panel">
        <div className="agg-panel-head" />
        {!apiKind ? (
          <EmptyState>Season standings aren’t published yet.</EmptyState>
        ) : data.loading && !data.data ? (
          <Loading />
        ) : (
          <div className="agg-columns">
            <Board rows={data.data?.points || []} valueLabel="Aggregated points" value={(r) => formatPoints(r.points)} />
            <Board
              rows={data.data?.times || []}
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

function Board({ rows, valueLabel, value, empty = "No players yet." }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div className="agg-board">
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
          <div className="agg-row" key={r.player.profileNumber || i}>
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
