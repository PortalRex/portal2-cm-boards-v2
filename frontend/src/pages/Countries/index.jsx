import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel, Avatar, Flag, PlayerLink, Loading, EmptyState } from "../../components/ui";
import { GlobeIcon } from "../../components/Icons";
import { fetchCountryStats } from "../../api/client";
import useApi from "../../hooks/useApi";
import { formatPoints } from "../../lib/format";
import background from "../../scenes/global/img/Background.png";
import "./Countries.css";

const BOARDS = [
  { value: "overall", label: "Overall" },
  { value: "sp", label: "Singleplayer" },
  { value: "coop", label: "Cooperative" },
];

// Countries on a Portal 2 points board: how many players each has, their points together and its
// best players. Players set their country in Settings.
export default function Countries() {
  const [board, setBoard] = useState("overall");
  const stats = useApi(() => fetchCountryStats(board), [board]);
  const list = stats.data || [];
  const players = list.reduce((n, c) => n + c.players, 0);

  return (
    <Layout background={background} tint="mono">
      <Panel
        icon={GlobeIcon}
        title="Countries"
        bodyClassName="ct-body"
        actions={
          <div className="segmented" role="group" aria-label="Board">
            {BOARDS.map((b) => (
              <button key={b.value} type="button" className={board === b.value ? "is-active" : ""} onClick={() => setBoard(b.value)}>
                {b.label}
              </button>
            ))}
          </div>
        }
      >
        <p className="muted ct-intro">
          {list.length
            ? `${players} ranked players across ${list.length} countries. Set yours in `
            : "No one has set a country yet. Set yours in "}
          <Link to="/more/settings">Settings</Link>.
        </p>
        {stats.loading && !stats.data ? (
          <Loading />
        ) : !list.length ? (
          <EmptyState>No countries yet.</EmptyState>
        ) : (
          <div className="ct-table" role="table">
            <div className="ct-row ct-head" role="row">
              <span className="ct-rank">#</span>
              <span>Country</span>
              <span className="end">Players</span>
              <span className="end">Points</span>
              <span>Best players</span>
            </div>
            {list.map((c, i) => (
              <div className="ct-row" role="row" key={c.country?.code || i}>
                <span className="ct-rank num">{i + 1}</span>
                <Link className="ct-country" to={`/leaderboard/${board}?country=${c.country?.code || ""}`} title={`${c.country?.name} on the ${board} board`}>
                  <Flag code={c.country?.code} height={18} />
                  {c.country?.name || "Unknown"}
                </Link>
                <span className="end num">{c.players}</span>
                <span className="end num">{formatPoints(c.points)}</span>
                <span className="ct-top">
                  {c.top.map((t, j) => (
                    <span key={t.player.profileNumber} className="ct-player" title={`${formatPoints(t.points)} points`}>
                      <span className="muted num">{j + 1}.</span>
                      <Avatar src={t.player.avatar} name={t.player.name} size={22} />
                      <PlayerLink player={t.player} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </Layout>
  );
}
