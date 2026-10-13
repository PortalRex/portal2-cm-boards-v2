import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select, Avatar, PlayerLink, EmptyState, Loading, RankNumber } from "../../components/ui";
import { DownloadIcon, ChevronRightIcon, TriangleRight } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, useRenderedSet } from "../../components/RunMedia";
import RunDetails from "../../components/RunDetails";
import { toggleOnRowClick } from "../../lib/rows";
import { fetchMelProfile } from "../../api/client";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import { chaptersFor, mapPath, MODE_LABELS } from "../../data/maps";
import { rankColor } from "../../lib/ranks";
import { formatScore, formatDelta, formatDate, timeAgo } from "../../lib/format";
import { youtubeChannelLabel, youtubeChannelUrl } from "../../lib/youtube";

const TABS = [
  { key: "sp", label: "Singleplayer" },
  { key: "coop", label: "Cooperative" },
  { key: "mel", label: "Portal Stories: Mel" },
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
        {TABS.map((t) => (
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
        ) : tab === "mel" ? (
          <MelTab profileNumber={profile.player.profileNumber} selectedMap={selectedMap} onSelectMap={setSelectedMap} sort={sort} onSort={setSort} />
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
        <ChapterTable key={chapter.name} chapter={chapter} scores={profile.scores} coop={mode === "coop"} game="portal2" rendered={rendered} selectedMap={selectedMap} onSelectMap={onSelectMap} />
      ))}

      <div className="pf-bottom">
        <History history={profile.history} game="portal2" map={selectedMap} />
        <SubmissionForm map={selectedMap} />
      </div>
    </>
  );
}

// Portal Stories: Mel results come from melboard, keyed by the same Steam profile number.
function MelTab({ profileNumber, selectedMap, onSelectMap, sort, onSort }) {
  const [mode, setMode] = useState("story");
  const version = useDataVersion();
  const mel = useApi(() => fetchMelProfile(profileNumber), [profileNumber, version]);
  if (mel.loading && !mel.data) return <Loading label="Loading Mel results" />;
  const scores = mel.data?.scores || {};
  if (!Object.keys(scores).length) return <EmptyState>No Portal Stories: Mel scores for this player.</EmptyState>;
  const chapters = chaptersFor(mode);
  return (
    <>
      <div className="pf-controls">
        <div className="segmented pf-mel-modes" role="tablist">
          {["story", "advanced"].map((m) => (
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
        <ChapterTable key={chapter.name} chapter={chapter} scores={scores} coop={false} game="mel" selectedMap={selectedMap} onSelectMap={onSelectMap} />
      ))}
      <div className="pf-bottom">
        <History history={mel.data.history} game="mel" map={selectedMap} />
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
          <div className="pf-summary-row" key={chapter.name}>
            <span className="pf-summary-avg num" style={{ background: rankColor(avg) }} title="Average rank">
              {avg ?? "–"}
            </span>
            <span className="pf-summary-chapter">
              <small>{chapter.mode === "coop" ? "Course" : "Chapter"} {chapter.number}</small>
              {chapter.name}
            </span>
            <span className="pf-summary-tiles">
              {chapter.maps.map((m) => {
                const rank = scores[m.id]?.rank;
                return (
                  <Link key={m.id} to={mapPath(m)} className="pf-tile num" style={{ background: rank ? rankColor(rank) : undefined }} title={`${m.title}${rank ? ` — rank ${rank}` : ""}`}>
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
        return (
          <div key={m.id} className={`pf-centry${open ? " is-open" : ""}`}>
            <div
              className={`pf-crow${coop ? " is-coop" : ""}${selected ? " is-selected" : ""}${s ? " is-expandable" : ""}`}
              style={{ "--rank-accent": s ? rankColor(s.rank) : "transparent" }}
              aria-expanded={s ? open : undefined}
              onClick={s ? toggleOnRowClick(() => setOpenId(open ? null : m.id)) : undefined}
            >
              <span className="pf-crank num">
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
                <DownloadIcon className={s?.demoId ? "" : "is-off"} />
                <button type="button" className="pf-cselect" onClick={() => onSelectMap(selected ? null : m)} aria-pressed={selected} aria-label={`Show history for ${m.title}`}>
                  <ChevronRightIcon />
                </button>
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
        <span>Old rank</span>
        <span />
        <span>New rank</span>
        <span>{map ? "Time ago" : "Map"}</span>
        <span className="end">New time</span>
        <span className="end">ΔOld</span>
        <span />
        <span />
      </div>
      {rows.length ? (
        rows.map((h) => (
          <div className="pf-hrow" key={h.id}>
            <span className="pf-hrank is-old num">
              <RankNumber rank={h.preRank} />
            </span>
            <TriangleRight size={14} />
            <span className="pf-hrank is-new num">
              <RankNumber rank={h.postRank} />
            </span>
            <span className="muted pf-hwhen">{map ? timeAgo(h.timestamp) : `${h.map.title} · ${timeAgo(h.timestamp)}`}</span>
            <span className="end num">{formatScore(h.score)}</span>
            <span className="end num">{h.scoreDelta != null ? formatDelta(h.scoreDelta) : ""}</span>
            <span className="pf-hicons">
              <AutorenderLink run={h} game={game} rendered={rendered} size={22} />
              {h.youtubeId && <YouTubeLink id={h.youtubeId} size={22} />}
              {h.demoId && <DownloadIcon />}
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
            <div key={chapter.name} className="pf-legacy-chapter">
              <h3>{chapter.name}</h3>
              {chapter.maps.map((m) => {
                const s = scores[m.id];
                return (
                  <div key={m.id} className={`pf-legacy-row${s?.rank === 1 ? " is-wr" : ""}`}>
                    <span className="pf-legacy-rank num" style={{ background: s?.rank ? rankColor(s.rank) : undefined }}>
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

function InfoTab({ player }) {
  return (
    <dl className="pf-info">
      <dt>Steam ID</dt>
      <dd className="num">{player.steam}</dd>
      {player.badges?.length > 0 && (
        <>
          <dt>Titles</dt>
          <dd>{player.badges.map((b) => b.label).join(", ")}</dd>
        </>
      )}
      {player.twitch && (
        <>
          <dt>Twitch</dt>
          <dd>{player.twitch}</dd>
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
