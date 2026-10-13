import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Loading, EmptyState, Select, RankNumber } from "../../components/ui";
import { HistoryIcon } from "../../components/Icons";
import { fetchFgBoard, fetchFgGame, formatRunTime } from "../../api/fullgame";
import useApi from "../../hooks/useApi";
import { formatDate } from "../../lib/format";
import { bannerImage, boardPath, ProofIcons, RunnerChips } from "./shared";
import "./FullGame.css";

const GROUPS = [
  ["Full game", (c) => !c.miscellaneous && c.type === "full_game"],
  ["Individual levels", (c) => !c.miscellaneous && c.type === "per_level"],
  ["Miscellaneous", (c) => c.miscellaneous],
];

// speedrun.com reuses names across full-game and per-level categories (e.g. "Solo Co-op");
// mark the per-level one when a tab group would otherwise show the same name twice.
const tabLabel = (c, group) =>
  c.type === "per_level" && !/(^|\s)IL(\s|$)/i.test(c.name) && group.some((o) => o.id !== c.id && o.name === c.name) ? `${c.name} IL` : c.name;

export default function Board() {
  const { game, category, level } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selected = Object.fromEntries([...params.entries()].filter(([k]) => /^v\d+$/.test(k)).map(([k, v]) => [k.slice(1), v]));
  const obsolete = params.get("obsolete") === "1";
  const key = `${game}/${category}/${level || ""}?${params.toString()}`;
  const board = useApi(() => fetchFgBoard({ game, category, level, selected, obsolete }), [key]);
  const gameInfo = useApi(() => fetchFgGame(game), [game]);
  const b = board.data;

  if (!board.loading && !b) return <Navigate to={`/fullgame/${game}`} replace />;

  const query = (overrides = {}) => {
    const q = { ...Object.fromEntries(Object.entries(b?.selected || {}).map(([id, slug]) => [`v${id}`, slug])), obsolete: obsolete ? "1" : undefined, ...overrides };
    return q;
  };
  const attributes = (b?.variables || []).filter((v) => !v.is_subcategory);
  const subcategories = (b?.variables || []).filter((v) => v.is_subcategory && v.values.length);
  const categories = gameInfo.data?.categories || [];

  return (
    <Layout background={bannerImage(b?.category)} blur>
      <div className="fg-page">
        <nav className="fg-breadcrumb">
          <Link to="/fullgame">Full Game</Link> › <Link to={`/fullgame/${game}`}>{b?.game.name || gameInfo.data?.game.name || game}</Link>
        </nav>

        {categories.length > 0 && (
          <div className="fg-category-tabs">
            {GROUPS.map(([label, test]) => {
              const list = categories.filter(test);
              if (!list.length) return null;
              return (
                <div key={label} className="fg-category-group">
                  <span className="fg-group-label">{label}</span>
                  <div className="segmented">
                    {list.map((c) => (
                      <button key={c.id} type="button" className={c.slug === category ? "is-active" : ""} onClick={() => navigate(boardPath(game, c.slug))}>
                        {tabLabel(c, list)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className="fg-board-panel">
          <header className="fg-banner" style={{ backgroundImage: `url("${bannerImage(b?.category)}")` }}>
            <div className="fg-banner-text">
              <span className="fg-banner-small">
                {b?.game.name}
                {b?.level ? ` – ${b.category.name}` : ""}
              </span>
              <h1>{b ? b.level?.name || b.category.name : ""}</h1>
            </div>
            {b?.levels.length > 0 && (
              <Select
                value={b.level?.slug}
                onChange={(slug) => navigate(boardPath(game, category, slug, query()))}
                options={b.levels.map((l) => ({ value: l.slug, label: l.name }))}
                label="Level"
                className="fg-level-select"
              />
            )}
          </header>

          <div className="fg-toolbar">
            <div className="fg-subcats">
              {subcategories.map((v) => (
                <div key={v.id} className="segmented" title={v.name}>
                  {v.values.map((value) => (
                    <button
                      key={value.id}
                      type="button"
                      className={b.selected[v.id] === value.slug ? "is-active" : ""}
                      onClick={() => navigate(boardPath(game, category, level, query({ [`v${v.id}`]: value.slug })))}
                    >
                      {value.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="fg-toolbar-right">
              <button type="button" className="outline-button" onClick={() => navigate(boardPath(game, category, level, query({ obsolete: obsolete ? undefined : "1" })))}>
                <HistoryIcon /> {obsolete ? "Hide" : "Show"} obsolete runs
              </button>
              <a className="outline-button" href="#rules">
                Rules
              </a>
            </div>
          </div>

          {board.loading && !b ? (
            <Loading />
          ) : !b.runs.length ? (
            <EmptyState>No verified runs yet.</EmptyState>
          ) : (
            <div className="fg-table" style={{ "--fg-attrs": attributes.length }} role="table">
              <div className="fg-row fg-row-head" role="row">
                <span className="fg-rank">#</span>
                <span>Runner{b.category.players > 1 ? "s" : ""}</span>
                {attributes.map((v) => (
                  <span key={v.id} className="fg-attr">
                    {v.name}
                  </span>
                ))}
                <span className="fg-proof-head">Proof</span>
                <span className="fg-date">Date</span>
                <span className="end">Time</span>
              </div>
              {b.runs.map((run) => (
                <div key={run.id} className={`fg-row${run.obsolete ? " is-obsolete" : ""}`} role="row">
                  <span className="fg-rank num">
                    <RankNumber rank={run.rank} />
                  </span>
                  <RunnerChips runners={run.runners} />
                  {attributes.map((v) => (
                    <span key={v.id} className="fg-attr">
                      {run.values.find((x) => x.variable_id === v.id)?.label || ""}
                    </span>
                  ))}
                  <ProofIcons run={run} />
                  <span className="fg-date muted num">{formatDate(run.run_date)}</span>
                  <Link className="fg-time num end" to={`/fullgame/runs/${run.id}`}>
                    {formatRunTime(run.time_ms)}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {b && (
            <section className="fg-rules" id="rules">
              <h2>Rules</h2>
              {b.category.rules && <p className="fg-rules-text">{b.category.rules}</p>}
              <p className="muted">
                Demos required through rank {b.category.demo_rank == null ? "all" : b.category.demo_rank}
                {b.category.video_required ? "; video required" : ""}. Full rules:{" "}
                <a href="https://rules.portal2.sr/" target="_blank" rel="noreferrer">
                  rules.portal2.sr
                </a>
                .
              </p>
            </section>
          )}
        </section>
      </div>
    </Layout>
  );
}
