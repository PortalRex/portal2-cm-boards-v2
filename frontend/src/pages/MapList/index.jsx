import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel, Select, PlayerLink, Loading } from "../../components/ui";
import { PinIcon, TrophyIcon } from "../../components/Icons";
import { AutorenderLink, YouTubeLink, DemoLink } from "../../components/RunMedia";
import { fetchPreviews } from "../../api/boards";
import { GAMES, MODE_LABELS, chaptersFor, isMultiplayerMode, mapPath } from "../../data/maps";
import useApi from "../../hooks/useApi";
import background from "../../scenes/global/img/Background.png";
import "./MapList.css";
import { TimeButton } from "../../components/RunHistory";

// Built when rendering: the game list comes from the server's catalog at startup.
const gameOptions = () => Object.values(GAMES).map((g) => ({ value: g.id, label: g.label }));

export default function MapList() {
  const [params, setParams] = useSearchParams();
  const game = GAMES[params.get("game")] ? params.get("game") : "portal2";
  const modes = GAMES[game].modes;
  const mode = modes.includes(params.get("mode")) ? params.get("mode") : modes[0];
  const previews = useApi(() => fetchPreviews(mode), [mode]);
  const chapters = chaptersFor(mode);

  const update = (nextGame, nextMode) => {
    const next = {};
    if (nextGame !== "portal2") next.game = nextGame;
    if (nextMode !== GAMES[nextGame].modes[0]) next.mode = nextMode;
    setParams(next, { replace: true });
  };

  return (
    <Layout background={background} tint="mono">
      <Panel icon={PinIcon} title="Leaderboards" bodyClassName="ml-body">
        <div className="ml-controls">
          <div className="ml-control">
            <span className="ml-label">Category</span>
            <Select value={game} onChange={(g) => update(g, GAMES[g].modes[0])} options={gameOptions()} label="Category" className="ml-select" />
          </div>
          <div className="ml-control">
            <span className="ml-label">Mode</span>
            <div className="segmented" role="tablist">
              {modes.map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "is-active" : ""} onClick={() => update(game, m)}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {previews.loading && !previews.data && <Loading />}

        {chapters.map((chapter) => (
          <section key={chapter.dbId ?? `${chapter.mode}-${chapter.number}`} className="ml-chapter">
            <header className="ml-chapter-head">
              <span className="ml-chapter-number">
                {isMultiplayerMode(mode) ? "Course" : "Chapter"} {String(chapter.number).padStart(2, "0")}
              </span>
              <h2>{chapter.name}</h2>
            </header>
            <div className="ml-grid">
              {chapter.maps.map((map) => (
                <MapCard key={map.id} map={map} scores={previews.data?.[map.id]} />
              ))}
            </div>
          </section>
        ))}
      </Panel>
    </Layout>
  );
}

// Whether a card needs a demo column (the video columns are always there).
const iconSlots = (entries) => ({ demo: entries.some((e) => e.demoId) });

// A run's demo / video icons, each in its own fixed-width column. The autorender and YouTube
// columns are always kept, right before the time, so the play icon sits in the same place on
// every card and row whether or not there's a YouTube video.
function ScoreIcons({ entry, game, size, slots }) {
  const slot = (key, icon) => (
    <span key={key} className="mc-icon-slot">
      {icon}
    </span>
  );
  return (
    <span className="mc-icons">
      {slots.demo && slot("demo", <DemoLink demoId={entry.demoId} size={size} hideMissing />)}
      {slot("autorender", entry.autorenderId && <AutorenderLink run={entry} game={game} size={size + 2} />)}
      {slot("youtube", entry.youtubeId && <YouTubeLink id={entry.youtubeId} size={size + 4} />)}
    </span>
  );
}

function MapCard({ map, scores }) {
  const [wr, ...rest] = scores || [];
  // One set of icon columns for the whole card (WR row included), so icons line up.
  const slots = iconSlots([wr, ...rest.slice(0, 6)].filter(Boolean));
  return (
    <article className="map-card">
      <Link to={mapPath(map)} className="mc-head" style={{ backgroundImage: `url("${map.image}")` }}>
        <h3>{map.title}</h3>
      </Link>
      <div className="mc-wr">
        <TrophyIcon className="mc-trophy" />
        {wr ? (
          <>
            {/* Same order as the rows below: name, video / demo, time. */}
            <div className="mc-wr-text">
              {wr.players.map((p, i) => (
                <PlayerLink key={i} player={p} className="mc-wr-name" />
              ))}
            </div>
            <ScoreIcons entry={wr} game={map.game} size={22} slots={slots} />
            <TimeButton score={wr.score} players={wr.players} map={map} className="mc-wr-time" />
          </>
        ) : (
          <span className="muted">{scores ? "No scores yet" : ""}</span>
        )}
      </div>
      <ol className="mc-rows" start={2}>
        {rest.slice(0, 6).map((entry, i) => (
          <li key={i}>
            <span className="mc-name">
              {entry.players.map((p, j) => (
                <span key={p.profileNumber || j}>
                  {j > 0 && " & "}
                  <PlayerLink player={p} />
                </span>
              ))}
            </span>
            <ScoreIcons entry={entry} game={map.game} size={18} slots={slots} />
            <TimeButton score={entry.score} players={entry.players} map={map} className="mc-time" />
          </li>
        ))}
      </ol>
    </article>
  );
}
