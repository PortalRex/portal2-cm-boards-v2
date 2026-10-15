import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select, Avatar, PlayerLink, EmptyState, Loading, RankNumber } from "../../components/ui";
import { ChevronDownIcon, TriangleRight } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, useRenderedSet, DemoLink, CommentButton } from "../../components/RunMedia";
import RunDetails from "../../components/RunDetails";
import { scrollToCentre } from "../../lib/scroll";
import { toggleOnRowClick } from "../../lib/rows";
import { fetchGameProfile, fetchProfileStats } from "../../api/client";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import { GAMES, chapterDbId, chaptersFor, isMultiplayerMode, mapPath, MODE_LABELS } from "../../data/maps";
import { rankVars } from "../../lib/ranks";
import { formatScore, formatDelta, formatDate, formatDateTime, timeAgo } from "../../lib/format";
import { youtubeChannelLabel, youtubeChannelUrl } from "../../lib/youtube";
import { ROLE_LABELS } from "../../hooks/useCurrentUser";
import { TimeButton } from "../../components/RunHistory";
import SeasonSelect from "../../components/SeasonSelect";
import { seasonBoard, useSeason } from "../../data/seasons";

// Portal 2's boards, then a tab per other game (Mel, ...), then Legacy and Info. Seasons are
// picked inside their game's tabs (SeasonSelect), not tabs of their own.
const profileTabs = () => [
  { key: "sp", label: "Singleplayer" },
  { key: "coop", label: "Cooperative" },
  ...Object.values(GAMES)
    .filter((g) => g.id !== "portal2" && g.kind !== "season")
    .map((g) => ({ key: `game:${g.id}`, label: g.label })),
  { key: "stats", label: "Stats" },
  { key: "legacy", label: "Legacy" },
  { key: "info", label: "Info" },
];
const CATEGORIES = [{ value: "p2cm", label: "Portal 2 Challenge Mode" }];
const SORTS = [
  { value: "default", label: "Map order" },
  { value: "rank", label: "Best rank first" },
  { value: "date", label: "Newest first" },
];

// The chapter tables to show. "default" keeps the game's chapters; the other orders list
// every map of the mode in one table (maps without a score last).
function orderedChapters(chapters, scores, sort) {
  if (sort === "default") return chapters;
  const maps = chapters.flatMap((c) => c.maps);
  const key = (m) => {
    const s = scores[m.id];
    if (sort === "rank") return s?.rank ?? Infinity;
    return s?.timestamp ? -new Date(s.timestamp).getTime() : Infinity;
  };
  const sorted = [...maps].sort((a, b) => key(a) - key(b));
  return [{ ...chapters[0], name: SORTS.find((o) => o.value === sort).label, maps: sorted, sorted: true }];
}

function SortSelect({ sort, onSort }) {
  return <Select value={sort} onChange={onSort} options={SORTS} label="Sort maps" className="pf-category pf-sort" />;
}

export default function ProfileTabs({ profile }) {
  const [tab, setTab] = useState("sp");
  const [sort, setSort] = useState("default");
  const [selectedMap, setSelectedMap] = useState(null);
  // The season picked in the current tab (a ?season= link opens Portal 2's tabs on it).
  const linked = useSeason("portal2");
  const [season, setSeason] = useState(linked);
  const pickSeason = (s) => {
    setSeason(s);
    setSelectedMap(null);
  };

  return (
    <section className="pf-tabs">
      <div className="pf-tablist" role="tablist">
        {profileTabs().map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "is-active" : ""}
            onClick={() => {
              setTab(t.key);
              setSelectedMap(null);
              // Singleplayer and Cooperative share Portal 2's season; another game starts on all-time.
              if (!(["sp", "coop"].includes(tab) && ["sp", "coop"].includes(t.key))) setSeason(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pf-tabpanel" role="tabpanel">
        {(tab === "sp" || tab === "coop") && season ? (
          <GameTab
            key={`${tab}-${season}`}
            game="portal2"
            fixedMode={tab}
            season={season}
            onSeason={pickSeason}
            profileNumber={profile.player.profileNumber}
            player={profile.player}
            selectedMap={selectedMap}
            onSelectMap={setSelectedMap}
            sort={sort}
            onSort={setSort}
          />
        ) : tab === "sp" || tab === "coop" ? (
          <ModeTab mode={tab} profile={profile} selectedMap={selectedMap} onSelectMap={setSelectedMap} sort={sort} onSort={setSort} onSeason={pickSeason} />
        ) : tab.startsWith("game:") ? (
          <GameTab
            key={`${tab}-${season || ""}`}
            game={tab.slice(5)}
            season={season}
            onSeason={pickSeason}
            profileNumber={profile.player.profileNumber}
            player={profile.player}
            selectedMap={selectedMap}
            onSelectMap={setSelectedMap}
            sort={sort}
            onSort={setSort}
          />
        ) : tab === "stats" ? (
          <StatsTab profileNumber={profile.player.profileNumber} />
        ) : tab === "legacy" ? (
          <LegacyTab scores={profile.scores} player={profile.player} />
        ) : (
          <InfoTab player={profile.player} />
        )}
      </div>
    </section>
  );
}

function ModeTab({ mode, profile, selectedMap, onSelectMap, sort, onSort, onSeason }) {
  const chapters = chaptersFor(mode);
  const rendered = useRenderedSet(useMemo(() => Object.values(profile.scores), [profile.scores]), "portal2");
  return (
    <>
      <div className="pf-controls">
        <Select value="p2cm" onChange={() => {}} options={CATEGORIES} label="Category" className="pf-category" />
        <SeasonSelect base="portal2" season={null} onChange={onSeason} className="pf-category" />
        <SortSelect sort={sort} onSort={onSort} />
      </div>
      <h2 className="pf-section-title">Summary</h2>
      <Summary chapters={chapters} scores={profile.scores} onSelectMap={onSelectMap} chapterLink={(c) => chapterBoardPath(c, profile.player)} />

      {orderedChapters(chapters, profile.scores, sort).map((chapter) => (
        <ChapterTable
          key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}
          chapter={chapter}
          scores={profile.scores}
          coop={mode === "coop"}
          game="portal2"
          rendered={rendered}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
          player={profile.player}
          chapterLink={chapterBoardPath(chapter, profile.player)}
        />
      ))}

      <div className="pf-bottom">
        <History history={profile.history} game="portal2" map={selectedMap} />
      </div>
    </>
  );
}

// Results in another game (Portal Stories: Mel, ...), board by board; or with a season picked,
// the season's results on its copies of the game's boards. `fixedMode`: one board only (Portal
// 2's Singleplayer / Cooperative tabs with a season picked).
function GameTab({ game, fixedMode = null, season = null, onSeason, profileNumber, player, selectedMap, onSelectMap, sort, onSort }) {
  const modes = GAMES[game]?.modes || [];
  const [picked, setMode] = useState(modes[0]);
  const mode = fixedMode || picked;
  const source = season || game;
  const board = season ? seasonBoard(season, game, mode) : mode;
  const version = useDataVersion();
  const results = useApi(() => fetchGameProfile(profileNumber, source), [profileNumber, source, version]);
  const label = GAMES[source]?.label || source;
  const controls = (
    <div className="pf-controls">
      {!fixedMode && (
        <div className="segmented pf-mel-modes" role="tablist">
          {modes.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-active" : ""} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      )}
      {fixedMode && <Select value="p2cm" onChange={() => {}} options={CATEGORIES} label="Category" className="pf-category" />}
      <SeasonSelect base={game} season={season} onChange={onSeason} className="pf-category" />
      <SortSelect sort={sort} onSort={onSort} />
    </div>
  );
  if (results.loading && !results.data) return <Loading label={`Loading ${label} results`} />;
  const scores = results.data?.scores || {};
  const chapters = board ? chaptersFor(board) : [];
  if (!Object.keys(scores).length || !board)
    return (
      <>
        {controls}
        <EmptyState>
          No {label}
          {season && fixedMode ? ` ${MODE_LABELS[fixedMode] || ""}` : ""} scores for this player.
        </EmptyState>
      </>
    );
  return (
    <>
      {controls}
      <h2 className="pf-section-title">Summary</h2>
      <Summary chapters={chapters} scores={scores} onSelectMap={onSelectMap} />
      {orderedChapters(chapters, scores, sort).map((chapter) => (
        <ChapterTable
          key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}
          chapter={chapter}
          scores={scores}
          coop={isMultiplayerMode(board)}
          game={source}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
          player={player}
        />
      ))}
      <div className="pf-bottom">
        <History history={results.data.history} game={source} map={selectedMap} />
      </div>
    </>
  );
}

// The run row for a map in the chapter tables below (Summary scrolls to it).
const runRowId = (map) => `pf-run-${map.id}`;

// A tile with a run opens it in the chapter tables below (scrolled to); one without goes to the
// map page.
// A Portal 2 chapter's aggregated board, opened on the player's row.
const chapterBoardPath = (chapter, player) => `/leaderboard/chapter/${chapterDbId(chapter)}?player=${player.profileNumber}`;

// `chapterLink(chapter)`: where a chapter's average and name lead (its aggregated board), if it has one.
function Summary({ chapters, scores, onSelectMap, chapterLink }) {
  const openRun = (m) => {
    onSelectMap(m);
    // After the row has opened.
    setTimeout(() => scrollToCentre(document.getElementById(runRowId(m))), 0);
  };
  return (
    <div className="pf-summary">
      {chapters.map((chapter) => {
        const ranks = chapter.maps.map((m) => scores[m.id]?.rank).filter(Boolean);
        const avg = ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;
        return (
          <div className="pf-summary-row" key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}>
            {chapterLink ? (
              <>
                <Link to={chapterLink(chapter)} className={`pf-summary-avg num${avg ? " rank-tint" : ""}`} style={rankVars(avg)} title={`Average rank · ${chapter.name} board`}>
                  {avg ?? "–"}
                </Link>
                <Link to={chapterLink(chapter)} className="pf-summary-chapter is-link" title={`${chapter.name} board`}>
                  <small>{isMultiplayerMode(chapter.mode) ? "Course" : "Chapter"} {chapter.number}</small>
                  {chapter.name}
                </Link>
              </>
            ) : (
              <>
                <span className={`pf-summary-avg num${avg ? " rank-tint" : ""}`} style={rankVars(avg)} title="Average rank">
                  {avg ?? "–"}
                </span>
                <span className="pf-summary-chapter">
                  <small>{isMultiplayerMode(chapter.mode) ? "Course" : "Chapter"} {chapter.number}</small>
                  {chapter.name}
                </span>
              </>
            )}
            <span className="pf-summary-tiles">
              {chapter.maps.map((m) => {
                const rank = scores[m.id]?.rank;
                const title = `${m.title}${rank ? ` — rank ${rank}` : ""}`;
                return scores[m.id] ? (
                  <button key={m.id} type="button" onClick={() => openRun(m)} className={`pf-tile num${rank ? " rank-tint" : ""}`} style={rankVars(rank)} title={title}>
                    <RankNumber rank={rank} inherit />
                  </button>
                ) : (
                  <Link key={m.id} to={mapPath(m)} className="pf-tile num" title={title}>
                    <RankNumber rank={rank} inherit />
                  </Link>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChapterTable({ chapter, scores, coop, game, rendered, selectedMap, onSelectMap, player, chapterLink }) {
  return (
    <section className="pf-chapter">
      <div className={`pf-crow pf-crow-head${coop ? " is-coop" : ""}`}>
        <h3>{chapterLink ? <Link to={chapterLink} className="pf-chapter-link" title={`${chapter.name} board`}>{chapter.name}</Link> : chapter.name}</h3>
        <span className="end">Time</span>
        <span className="end">ΔNext</span>
        <span className="end">ΔWR</span>
        <span className="end">Points</span>
        {coop && <span className="pf-partner-head">Partner</span>}
        <span />
      </div>
      {chapter.maps.map((m) => {
        const s = scores[m.id];
        const selected = selectedMap?.id === m.id;
        // The selected map's run is the open one (from its row or the Summary). Opening a run also
        // narrows History to its map; closing it shows all history again.
        const open = Boolean(s) && selected;
        const toggle = () => onSelectMap(open ? null : m);
        return (
          <div key={m.id} id={runRowId(m)} className={`pf-centry${open ? " is-open" : ""}`}>
            <div
              className={`pf-crow${coop ? " is-coop" : ""}${selected ? " is-selected" : ""}${s ? " is-expandable" : ""}`}
              style={s ? rankVars(s.rank) : undefined}
              aria-expanded={s ? open : undefined}
              onClick={s ? toggleOnRowClick(toggle) : undefined}
            >
              <span className={`pf-crank num${s?.rank ? " rank-tint" : ""}`}>
                <RankNumber rank={s?.rank} inherit />
              </span>
              {/* Only the name links to the map; the rest of the row opens the run. */}
              <span className="pf-cmap">
                <Link to={mapPath(m)} className="pf-cmap-link">
                  {m.title}
                </Link>
                <small title={s?.timestamp ? formatDateTime(s.timestamp) : undefined}>
                  {chapter.sorted ? `${m.chapter} · ` : ""}
                  {s?.timestamp ? timeAgo(s.timestamp) : s ? "" : "No score"}
                </small>
              </span>
              <span className="end num">{s?.score != null ? <TimeButton score={s.score} players={[player, s.partner]} map={m} /> : ""}</span>
              <span className="end num">{s?.deltaNext != null ? formatDelta(s.deltaNext) : ""}</span>
              <span className="end num">{s?.deltaWr != null ? formatDelta(s.deltaWr) : ""}</span>
              <span className="end num">{s?.points != null ? s.points.toFixed(1) : ""}</span>
              {coop && (
                <span className="pf-partner">
                  {s?.partner && (
                    <>
                      <Avatar src={s.partner.avatar} name={s.partner.name} size={30} />
                      <PlayerLink player={s.partner} />
                    </>
                  )}
                </span>
              )}
              <span className="pf-cicons">
                {s ? <CommentButton note={s.note} /> : <span className="pf-icon-gap" />}
                {s ? <AutorenderLink run={s} game={game} rendered={rendered} /> : <span className="pf-icon-gap" />}
                <YouTubeLink id={s?.youtubeId} />
                <DemoLink demoId={s?.demoId} />
                {s ? (
                  <button type="button" className={`pf-cselect${open ? " is-open" : ""}`} onClick={toggle} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} run details for ${m.title}`}>
                    <ChevronDownIcon />
                  </button>
                ) : (
                  <span className="pf-icon-gap" />
                )}
              </span>
            </div>
            {open && <RunDetails run={s} map={m} game={game} rendered={rendered} />}
          </div>
        );
      })}
    </section>
  );
}

function History({ history, game, map }) {
  const rows = useMemo(() => {
    const list = map && map.game === game ? history.filter((h) => h.map.id === map.id) : history;
    return list.slice(0, 10);
  }, [history, game, map]);
  const rendered = useRenderedSet(rows, game);
  return (
    <section className="pf-history">
      <h2 className="pf-section-title">History{map ? ` · ${map.title}` : ""}</h2>
      <div className="pf-hrow pf-hrow-head">
        <span>
          Old<span className="pf-hlong"> rank</span>
        </span>
        <span />
        <span>
          New<span className="pf-hlong"> rank</span>
        </span>
        <span>{map ? "Time ago" : "Map"}</span>
        <span className="end">New time</span>
        <span className="end">ΔOld</span>
        <span />
      </div>
      {rows.length ? (
        rows.map((h) => (
          <div className="pf-hrow" key={h.id}>
            <span className={`pf-hrank is-old num${h.preRank ? " rank-tint" : ""}`} style={rankVars(h.preRank)}>
              <RankNumber rank={h.preRank} inherit />
            </span>
            <TriangleRight size={14} />
            <span className={`pf-hrank is-new num${h.postRank ? " rank-tint" : ""}`} style={rankVars(h.postRank)}>
              <RankNumber rank={h.postRank} inherit />
            </span>
            <span className="muted pf-hwhen" title={formatDateTime(h.timestamp)}>{map ? timeAgo(h.timestamp) : `${h.map.title} · ${timeAgo(h.timestamp)}`}</span>
            <span className="end num">
              <TimeButton score={h.score} players={h.players} map={h.map} />
            </span>
            <span className="end num">{h.scoreDelta != null ? formatDelta(h.scoreDelta) : ""}</span>
            <span className="pf-hicons">
              <AutorenderLink run={h} game={game} rendered={rendered} size={22} />
              {h.youtubeId && <YouTubeLink id={h.youtubeId} size={22} />}
              <DemoLink demoId={h.demoId} hideMissing />
            </span>
          </div>
        ))
      ) : (
        <EmptyState>{map ? `No submissions for ${map.title}.` : "No submissions yet."}</EmptyState>
      )}
    </section>
  );
}

// Compact single-page view in the style of the original board's profile: every
// Portal 2 map with rank, time and date, singleplayer and co-op side by side.
function LegacyTab({ scores, player }) {
  const [openId, setOpenId] = useState(null);
  const rendered = useRenderedSet(useMemo(() => Object.values(scores), [scores]), "portal2");
  return (
    <div className="pf-legacy">
      {["sp", "coop"].map((mode) => (
        <section key={mode} className="pf-legacy-col">
          <h2 className="pf-section-title">{MODE_LABELS[mode]}</h2>
          {chaptersFor(mode).map((chapter) => (
            <div key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`} className="pf-legacy-chapter">
              <h3>{chapter.name}</h3>
              {chapter.maps.map((m) => {
                const s = scores[m.id];
                const open = Boolean(s) && openId === m.id;
                const toggle = () => setOpenId(open ? null : m.id);
                return (
                  <div key={m.id} className={`pf-legacy-entry${open ? " is-open" : ""}`}>
                    <div
                      className={`pf-legacy-row${s?.rank === 1 ? " is-wr" : ""}${s ? " is-expandable" : ""}`}
                      onClick={s ? toggle : undefined}
                      role={s ? "button" : undefined}
                      tabIndex={s ? 0 : undefined}
                      aria-expanded={s ? open : undefined}
                      onKeyDown={s ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle()) : undefined}
                    >
                      <span className={`pf-legacy-rank num${s?.rank ? " rank-tint" : ""}`} style={rankVars(s?.rank)}>
                        <RankNumber rank={s?.rank} inherit />
                      </span>
                      {s ? (
                        <span className="pf-legacy-map">{m.title}</span>
                      ) : (
                        <Link to={mapPath(m)} className="pf-legacy-map">
                          {m.title}
                        </Link>
                      )}
                      <span className="num end">{s?.score != null ? formatScore(s.score) : ""}</span>
                      <span className="num end muted pf-legacy-date" title={s?.timestamp ? formatDateTime(s.timestamp) : undefined}>{s?.timestamp ? formatDate(s.timestamp) : ""}</span>
                    </div>
                    {open && (
                      <div className="pf-legacy-details">
                        <Link to={mapPath(m)} className="pf-legacy-maplink">
                          {m.title} board →
                        </Link>
                        <RunDetails run={{ ...s, players: [player, s.partner].filter(Boolean) }} map={m} game="portal2" rendered={rendered} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "–");

// Activity, co-op partners and demo stats for one game.
function StatsTab({ profileNumber }) {
  const [game, setGame] = useState("portal2");
  const [season, setSeason] = useState(null);
  const source = season || game;
  const version = useDataVersion();
  const stats = useApi(() => fetchProfileStats(profileNumber, source), [profileNumber, source, version]);
  const games = Object.values(GAMES)
    .filter((g) => g.kind !== "season")
    .map((g) => ({ value: g.id, label: g.label }));
  const s = stats.data?.summary;
  return (
    <div className="pf-stats">
      <div className="pf-controls">
        {games.length > 1 && (
          <Select
            value={game}
            onChange={(g) => {
              setGame(g);
              setSeason(null);
            }}
            options={games}
            label="Game"
            className="pf-category"
          />
        )}
        <SeasonSelect base={game} season={season} onChange={setSeason} className="pf-category" />
      </div>
      {stats.loading && !stats.data ? (
        <Loading label="Loading stats" />
      ) : !s ? (
        <EmptyState>No stats for this player.</EmptyState>
      ) : (
        <>
          <div className="pf-figures">
            <Stat label="Runs" value={s.runs} note={`${s.verified_runs} verified`} />
            <Stat label="Singleplayer maps" value={`${s.sp_maps} / ${s.sp_map_count}`} note={pct(s.sp_maps, s.sp_map_count)} hide={!s.sp_map_count} />
            <Stat label="Co-op maps" value={`${s.coop_maps} / ${s.coop_map_count}`} note={pct(s.coop_maps, s.coop_map_count)} hide={!s.coop_map_count} />
            <Stat label="Co-op partners" value={stats.data.uniquePartners} hide={!s.coop_map_count} />
            <Stat label="World records" value={s.wr_runs} note={s.wr_runs ? `held on ${s.wr_maps} map${s.wr_maps === 1 ? "" : "s"}` : "none yet"} />
            <Stat label="Time saved" value={formatScore(s.time_saved)} note="through improvements" />
            <Stat label="With demo" value={pct(s.runs_with_demo, s.runs)} note={`${s.runs_with_demo} runs`} />
            <Stat label="With video" value={pct(s.runs_with_video, s.runs)} note={`${s.runs_with_video} runs`} />
            <Stat
              label="Portals per PB"
              value={s.pbs_with_portals ? (s.pb_portals_total / s.pbs_with_portals).toFixed(1) : "–"}
              note={s.pbs_with_portals ? `${s.pb_portals_total} over ${s.pbs_with_portals} maps` : "no demo data"}
            />
            <Stat label="Portals placed" value={s.portals_total.toLocaleString()} note={`in ${s.runs_with_portals} runs with demos`} hide={!s.runs_with_portals} />
            <Stat label="Active" value={s.first_run ? formatDate(s.first_run).slice(0, 4) : "–"} note={s.latest_run ? `latest run ${timeAgo(s.latest_run)}` : ""} />
          </div>
          {stats.data.partners.length > 0 && (
            <section className="pf-partners">
              <h2 className="pf-section-title">Co-op partners</h2>
              <div className="pf-partner-row pf-partner-head">
                <span>Partner</span>
                <span className="end">Maps together</span>
                <span className="end">Runs</span>
              </div>
              {stats.data.partners.map((p) => (
                <div key={p.player.profileNumber} className="pf-partner-row">
                  <span className="pf-partner">
                    <Avatar src={p.player.avatar} name={p.player.name} size={28} />
                    <PlayerLink player={p.player} />
                  </span>
                  <span className="end num">{p.maps}</span>
                  <span className="end num muted">{p.runs}</span>
                </div>
              ))}
              {stats.data.uniquePartners > stats.data.partners.length && (
                <p className="muted pf-more">and {stats.data.uniquePartners - stats.data.partners.length} more</p>
              )}
            </section>
          )}
          {stats.data.fewestPortals.length > 0 && (
            <section className="pf-partners">
              <h2 className="pf-section-title">Fewest portals (personal bests)</h2>
              {stats.data.fewestPortals.map((f) => (
                <div key={f.mapName} className="pf-partner-row">
                  <span>{f.map ? <Link to={mapPath(f.map)}>{f.map.title}</Link> : f.mapName}</span>
                  <span className="end num">{f.portals} portals</span>
                  <span className="end num muted">{formatScore(f.score)}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, hide }) {
  if (hide) return null;
  return (
    <div className="pf-figure">
      <span className="pf-figure-label">{label}</span>
      <span className="pf-figure-value num">{value}</span>
      {note && <span className="pf-figure-note">{note}</span>}
    </div>
  );
}

function InfoTab({ player }) {
  return (
    <dl className="pf-info">
      <dt>Steam ID</dt>
      <dd className="num">{player.steam}</dd>
      {(player.titles || []).length > 0 && (
        <>
          <dt>Titles</dt>
          <dd className="pf-info-titles">
            {player.titles.map((t) => (
              <span key={t} className="pf-info-title">
                {t}
              </span>
            ))}
          </dd>
        </>
      )}
      {player.role && (
        <>
          <dt>Staff</dt>
          <dd>{ROLE_LABELS[player.role]}</dd>
        </>
      )}
      {player.twitch && (
        <>
          <dt>Twitch</dt>
          <dd>
            <a href={`https://twitch.tv/${player.twitch}`} target="_blank" rel="noreferrer">
              {player.twitch}
            </a>
          </dd>
        </>
      )}
      {player.youtube && (
        <>
          <dt>YouTube</dt>
          <dd>
            <a href={youtubeChannelUrl(player.youtube)} target="_blank" rel="noreferrer">
              {youtubeChannelLabel(player.youtube)}
            </a>
          </dd>
        </>
      )}
    </dl>
  );
}
