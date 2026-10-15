import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Avatar, EmptyState, Loading, Panel, PlayerLink, RankNumber, Select } from "../../components/ui";
import { PeopleIcon, SwapIcon } from "../../components/Icons";
import { fetchCompareSide, searchUsers } from "../../api/client";
import { GAMES, MODE_LABELS, chaptersFor, isMultiplayerMode, mapPath } from "../../data/maps";
import useApi from "../../hooks/useApi";
import useDebounced from "../../hooks/useDebounced";
import { formatDelta, formatLongScore, formatScore } from "../../lib/format";
import background from "../../scenes/global/img/Background.png";
import "./Compare.css";

// Two players' best times side by side, map by map, for one game and board.
export default function Compare() {
  const [params, setParams] = useSearchParams();
  const a = params.get("a") || "";
  const b = params.get("b") || "";
  const game = GAMES[params.get("game")] ? params.get("game") : "portal2";
  const modes = GAMES[game].modes;
  const mode = modes.includes(params.get("mode")) ? params.get("mode") : modes[0];
  const set = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const left = useApi(() => (a ? fetchCompareSide(a, game) : Promise.resolve(null)), [a, game]);
  const right = useApi(() => (b ? fetchCompareSide(b, game) : Promise.resolve(null)), [b, game]);

  return (
    <Layout background={background} tint="mono">
      <Panel icon={PeopleIcon} title="Compare players" bodyClassName="cmp-body">
        <div className="cmp-players">
          <PlayerSlot side={left.data} loading={left.loading} onPick={(pn) => set({ a: pn })} label="First player" />
          <button type="button" className="cmp-swap" onClick={() => set({ a: b, b: a })} disabled={!a && !b} title="Swap players" aria-label="Swap players">
            <SwapIcon />
          </button>
          <PlayerSlot side={right.data} loading={right.loading} onPick={(pn) => set({ b: pn })} label="Second player" />
        </div>
        <div className="cmp-controls">
          {Object.keys(GAMES).length > 1 && (
            <Select
              value={game}
              onChange={(g) => set({ game: g === "portal2" ? "" : g, mode: "" })}
              options={Object.values(GAMES).map((g) => ({ value: g.id, label: g.label }))}
              label="Game"
              className="cmp-select"
            />
          )}
          <div className="segmented">
            {modes.map((m) => (
              <button key={m} type="button" className={m === mode ? "is-active" : ""} onClick={() => set({ mode: m === modes[0] ? "" : m })}>
                {MODE_LABELS[m] || m}
              </button>
            ))}
          </div>
        </div>
        {left.data && right.data ? (
          <Comparison mode={mode} left={left.data} right={right.data} />
        ) : (
          !left.loading && !right.loading && <EmptyState>Pick two players to compare their times.</EmptyState>
        )}
      </Panel>
    </Layout>
  );
}

function PlayerSlot({ side, loading, onPick, label }) {
  const [editing, setEditing] = useState(!side);
  useEffect(() => setEditing(!side && !loading), [side, loading]);
  if (loading && !side) return <div className="cmp-slot"><Loading /></div>;
  if (side && !editing)
    return (
      <div className="cmp-slot">
        <Avatar src={side.player.avatar} name={side.player.name} size={64} />
        <div className="cmp-slot-name">
          <PlayerLink player={side.player} />
          <button type="button" className="cmp-change" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      </div>
    );
  return (
    <div className="cmp-slot">
      <PlayerSearch
        label={label}
        onPick={(pn) => {
          setEditing(false);
          onPick(pn);
        }}
      />
    </div>
  );
}

function PlayerSearch({ label, onPick }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 250);
  const results = useApi(() => searchUsers(query), [query]);
  return (
    <div className="cmp-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label}: name or Steam ID`} aria-label={label} autoFocus />
      {query.trim().length >= 2 && (
        <ul className="cmp-results">
          {(results.data || []).map((p) => (
            <li key={p.profileNumber}>
              <button type="button" onClick={() => onPick(p.profileNumber)}>
                <Avatar src={p.avatar} name={p.name} size={24} />
                <span>{p.name}</span>
                <small>{p.runs} runs</small>
              </button>
            </li>
          ))}
          {results.data && !results.data.length && <li className="muted cmp-none">No players found.</li>}
        </ul>
      )}
    </div>
  );
}

function Comparison({ mode, left, right }) {
  const chapters = chaptersFor(mode);
  const summary = useMemo(() => {
    const out = { left: 0, right: 0, ties: 0, onlyLeft: 0, onlyRight: 0, leftTotal: 0, rightTotal: 0, shared: 0 };
    chapters.forEach((c) =>
      c.maps.forEach((m) => {
        const l = left.scores[m.id];
        const r = right.scores[m.id];
        if (l && r) {
          out.shared++;
          out.leftTotal += l.score;
          out.rightTotal += r.score;
          if (l.score < r.score) out.left++;
          else if (r.score < l.score) out.right++;
          else out.ties++;
        } else if (l) {
          // A time beats no time.
          out.onlyLeft++;
          out.left++;
        } else if (r) {
          out.onlyRight++;
          out.right++;
        }
      }),
    );
    return out;
  }, [chapters, left, right]);

  return (
    <>
      <div className="cmp-summary">
        <div className={`cmp-score${summary.left > summary.right ? " is-ahead" : ""}`}>
          <strong className="num">{summary.left}</strong>
          <span>maps faster</span>
        </div>
        <div className="cmp-mid">
          <span className="num">{summary.ties} tied</span>
          {summary.shared > 0 && (
            <span className="num">
              {formatLongScore(summary.leftTotal)} vs {formatLongScore(summary.rightTotal)} over {summary.shared} shared maps
            </span>
          )}
          {(summary.onlyLeft > 0 || summary.onlyRight > 0) && (
            <span className="muted">
              Including maps only one has a time on: {left.player.name} {summary.onlyLeft} · {right.player.name} {summary.onlyRight}
            </span>
          )}
        </div>
        <div className={`cmp-score${summary.right > summary.left ? " is-ahead" : ""}`}>
          <strong className="num">{summary.right}</strong>
          <span>maps faster</span>
        </div>
      </div>
      {chapters.map((c) => (
        <section key={c.dbId ?? c.name} className="cmp-chapter">
          <h3>
            <small>{isMultiplayerMode(mode) ? "Course" : "Chapter"} {c.number}</small> {c.name}
          </h3>
          {c.maps.map((m) => {
            const l = left.scores[m.id];
            const r = right.scores[m.id];
            const diff = l && r ? l.score - r.score : null;
            return (
              <div key={m.id} className="cmp-row">
                <Side score={l} win={diff != null ? diff < 0 : Boolean(l)} />
                <span className="cmp-map">
                  <Link to={mapPath(m)}>{m.title}</Link>
                  {diff != null && diff !== 0 && <small className="num">{formatDelta(Math.abs(diff))}</small>}
                </span>
                <Side score={r} win={diff != null ? diff > 0 : Boolean(r)} right />
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

function Side({ score, win, right }) {
  return (
    <span className={`cmp-side${right ? " is-right" : ""}${win ? " is-win" : ""}`}>
      {score ? (
        <>
          <span className="cmp-rank num">
            <RankNumber rank={score.rank} />
          </span>
          <span className="cmp-time num">{formatScore(score.score)}</span>
        </>
      ) : (
        <span className="muted">–</span>
      )}
    </span>
  );
}
