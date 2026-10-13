import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select, Avatar, PlayerLink, EmptyState, Loading, RankNumber } from "../../components/ui";
import { ChevronDownIcon, TriangleRight } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, useRenderedSet, DemoLink } from "../../components/RunMedia";
import RunDetails from "../../components/RunDetails";
import { toggleOnRowClick } from "../../lib/rows";
import { fetchGameProfile, fetchProfileStats } from "../../api/client";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import { GAMES, chaptersFor, isMultiplayerMode, mapPath, MODE_LABELS } from "../../data/maps";
import { rankVars } from "../../lib/ranks";
import { formatScore, formatDelta, formatDate, timeAgo } from "../../lib/format";
import { youtubeChannelLabel, youtubeChannelUrl } from "../../lib/youtube";
import { ROLE_LABELS } from "../../hooks/useCurrentUser";

// Portal 2's boards, then a tab per other game (Mel, seasons, ...), then Legacy and Info.
const profileTabs = () => [
  { key: "sp", label: "Singleplayer" },
  { key: "coop", label: "Cooperative" },
  ...Object.values(GAMES)
    .filter((g) => g.id !== "portal2")
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
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pf-tabpanel" role="tabpanel">
        {tab === "sp" || tab === "coop" ? (
          <ModeTab mode={tab} profile={profile} selectedMap={selectedMap} onSelectMap={setSelectedMap} sort={sort} onSort={setSort} />
        ) : tab.startsWith("game:") ? (
          <GameTab
            key={tab}
            game={tab.slice(5)}
            profileNumber={profile.player.profileNumber}
            selectedMap={selectedMap}
            onSelectMap={setSelectedMap}
            sort={sort}
            onSort={setSort}
          />
        ) : tab === "stats" ? (
          <StatsTab profileNumber={profile.player.profileNumber} />
        ) : tab === "legacy" ? (
          <LegacyTab scores={profile.scores} />
        ) : (
          <InfoTab player={profile.player} />
        )}
      </div>
    </section>
  );
}

function ModeTab({ mode, profile, selectedMap, onSelectMap, sort, onSort }) {
  const chapters = chaptersFor(mode);
  const rendered = useRenderedSet(useMemo(() => Object.values(profile.scores), [profile.scores]), "portal2");
  return (
    <>
      <div className="pf-controls">
        <Select value="p2cm" onChange={() => {}} options={CATEGORIES} label="Category" className="pf-category" />
        <SortSelect sort={sort} onSort={onSort} />
      </div>
      <h2 className="pf-section-title">Summary</h2>
      <Summary chapters={chapters} scores={profile.scores} />

      {orderedChapters(chapters, profile.scores, sort).map((chapter) => (
        <ChapterTable key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`} chapter={chapter} scores={profile.scores} coop={mode === "coop"} game="portal2" rendered={rendered} selectedMap={selectedMap} onSelectMap={onSelectMap} />
      ))}

      <div className="pf-bottom">
        <History history={profile.history} game="portal2" map={selectedMap} />
        <SubmissionForm map={selectedMap} />
      </div>
    </>
  );
}

// Results in another game (Portal Stories: Mel, a season, ...), board by board.
function GameTab({ game, profileNumber, selectedMap, onSelectMap, sort, onSort }) {
  const modes = GAMES[game]?.modes || [];
  const [mode, setMode] = useState(modes[0]);
  const version = useDataVersion();
  const results = useApi(() => fetchGameProfile(profileNumber, game), [profileNumber, game, version]);
  const label = GAMES[game]?.label || game;
  if (results.loading && !results.data) return <Loading label={`Loading ${label} results`} />;
  const scores = results.data?.scores || {};
  if (!Object.keys(scores).length) return <EmptyState>No {label} scores for this player.</EmptyState>;
  const chapters = chaptersFor(mode);
  return (
    <>
      <div className="pf-controls">
        <div className="segmented pf-mel-modes" role="tablist">
          {modes.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-active" : ""} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <SortSelect sort={sort} onSort={onSort} />
      </div>
      <h2 className="pf-section-title">Summary</h2>
      <Summary chapters={chapters} scores={scores} />
      {orderedChapters(chapters, scores, sort).map((chapter) => (
        <ChapterTable
          key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}
          chapter={chapter}
          scores={scores}
          coop={isMultiplayerMode(mode)}
          game={game}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
        />
      ))}
      <div className="pf-bottom">
        <History history={results.data.history} game={game} map={selectedMap} />
      </div>
    </>
  );
}

function Summary({ chapters, scores }) {
  return (
    <div className="pf-summary">
      {chapters.map((chapter) => {
        const ranks = chapter.maps.map((m) => scores[m.id]?.rank).filter(Boolean);
        const avg = ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;
        return (
          <div className="pf-summary-row" key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}>
            <span className={`pf-summary-avg num${avg ? " rank-tint" : ""}`} style={rankVars(avg)} title="Average rank">
              {avg ?? "–"}
            </span>
            <span className="pf-summary-chapter">
              <small>{isMultiplayerMode(chapter.mode) ? "Course" : "Chapter"} {chapter.number}</small>
              {chapter.name}
            </span>
            <span className="pf-summary-tiles">
              {chapter.maps.map((m) => {
                const rank = scores[m.id]?.rank;
                return (
                  <Link key={m.id} to={mapPath(m)} className={`pf-tile num${rank ? " rank-tint" : ""}`} style={rankVars(rank)} title={`${m.title}${rank ? ` — rank ${rank}` : ""}`}>
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

function ChapterTable({ chapter, scores, coop, game, rendered, selectedMap, onSelectMap }) {
  const [openId, setOpenId] = useState(null);
  return (
    <section className="pf-chapter">
      <div className={`pf-crow pf-crow-head${coop ? " is-coop" : ""}`}>
        <h3>{chapter.name}</h3>
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
        const open = openId === m.id;
        // Opening a run also narrows History to its map; closing it shows all history again.
        const toggle = () => {
          setOpenId(open ? null : m.id);
          onSelectMap(open ? null : m);
        };
        return (
          <div key={m.id} className={`pf-centry${open ? " is-open" : ""}`}>
            <div
              className={`pf-crow${coop ? " is-coop" : ""}${selected ? " is-selected" : ""}${s ? " is-expandable" : ""}`}
              style={s ? rankVars(s.rank) : undefined}
              aria-expanded={s ? open : undefined}
              onClick={s ? toggleOnRowClick(toggle) : undefined}
            >
              <span className={`pf-crank num${s?.rank ? " rank-tint" : ""}`}>
                <RankNumber rank={s?.rank} inherit />
              </span>
              <Link to={mapPath(m)} className="pf-cmap">
                {m.title}
                <small>
                  {chapter.sorted ? `${m.chapter} · ` : ""}
                  {s?.timestamp ? timeAgo(s.timestamp) : s ? "" : "No score"}
                </small>
              </Link>
              <span className="end num">{s?.score != null ? formatScore(s.score) : ""}</span>
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
            <span className="muted pf-hwhen">{map ? timeAgo(h.timestamp) : `${h.map.title} · ${timeAgo(h.timestamp)}`}</span>
            <span className="end num">{formatScore(h.score)}</span>
            <span className="end num">{h.scoreDelta != null ? formatDelta(h.scoreDelta) : ""}</span>
            <span className="pf-hicons">
              <AutorenderLink run={h} game={game} rendered={rendered} size={22} />
              {h.youtubeId && <YouTubeLink id={h.youtubeId} size={22} />}
              <DemoLink demoId={h.demoId} hideMissing />
            </span>
            <span className="pf-hactions">
              <button type="button" disabled title="Requires moderator sign-in">Edit</button>
              <button type="button" disabled title="Requires moderator sign-in" className="is-ban">Ban</button>
            </span>
          </div>
        ))
      ) : (
        <EmptyState>{map ? `No submissions for ${map.title}.` : "No submissions yet."}</EmptyState>
      )}
      <button type="button" className="pf-new-submission" disabled title="Submissions require Steam sign-in">
        New submission
      </button>
    </section>
  );
}

// Layout of the create/edit form from the design. Posting needs Steam sign-in,
// which the frontend doesn't have yet, so the controls are disabled.
function SubmissionForm({ map }) {
  return (
    <section className="pf-form">
      <h2 className="pf-section-title">Create/Edit Submission{map ? ` · ${map.title}` : ""}</h2>
      <fieldset disabled title="Submissions require Steam sign-in">
        <label>
          <span>Time:</span>
          <input type="text" inputMode="decimal" />
        </label>
        <label>
          <span>YouTube URL:</span>
          <input type="url" />
        </label>
        <label>
          <span>Comment:</span>
          <input type="text" />
        </label>
        <div className="pf-form-buttons">
          <button type="button">Browse for demo</button>
          <button type="submit">Submit</button>
          <button type="button">Cancel</button>
        </div>
      </fieldset>
    </section>
  );
}

// Compact single-page view in the style of the original board's profile: every
// Portal 2 map with rank, time and date, singleplayer and co-op side by side.
function LegacyTab({ scores }) {
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
                return (
                  <div key={m.id} className={`pf-legacy-row${s?.rank === 1 ? " is-wr" : ""}`}>
                    <span className={`pf-legacy-rank num${s?.rank ? " rank-tint" : ""}`} style={rankVars(s?.rank)}>
                      <RankNumber rank={s?.rank} inherit />
                    </span>
                    <Link to={mapPath(m)} className="pf-legacy-map">
                      {m.title}
                    </Link>
                    <span className="num end">{s?.score != null ? formatScore(s.score) : ""}</span>
                    <span className="num end muted pf-legacy-date">{s?.timestamp ? formatDate(s.timestamp) : ""}</span>
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
  const version = useDataVersion();
  const stats = useApi(() => fetchProfileStats(profileNumber, game), [profileNumber, game, version]);
  const games = Object.values(GAMES).map((g) => ({ value: g.id, label: g.label }));
  const s = stats.data?.summary;
  return (
    <div className="pf-stats">
      {games.length > 1 && (
        <div className="pf-controls">
          <Select value={game} onChange={setGame} options={games} label="Game" className="pf-category" />
        </div>
      )}
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
