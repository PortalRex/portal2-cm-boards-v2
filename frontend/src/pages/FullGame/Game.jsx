import { Link, Navigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Loading, EmptyState } from "../../components/ui";
import { TimerIcon, PersonIcon, PeopleIcon } from "../../components/Icons";
import { fetchFgGame, fetchFgGames } from "../../api/fullgame";
import useApi from "../../hooks/useApi";
import { bannerImage, boardPath } from "./shared";
import "./FullGame.css";

const GROUPS = [
  ["Full game", (c) => !c.miscellaneous && c.type === "full_game"],
  ["Individual levels", (c) => !c.miscellaneous && c.type === "per_level"],
  ["Miscellaneous", (c) => c.miscellaneous],
];

// /fullgame: with one game, go straight to it; otherwise list the games.
export function Games() {
  const games = useApi(() => fetchFgGames(), []);
  if (games.loading && !games.data) return <Layout><Loading /></Layout>;
  const list = games.data || [];
  if (list.length === 1) return <Navigate to={`/fullgame/${list[0].slug}`} replace />;
  return (
    <Layout narrow>
      <div className="fg-page">
        <h1 className="fg-title">Full Game</h1>
        {list.length ? (
          <div className="fg-grid">
            {list.map((g) => (
              <Link key={g.id} to={`/fullgame/${g.slug}`} className="fg-tile">
                <TimerIcon />
                <span className="fg-tile-name">{g.name}</span>
                <span className="muted">{g.categories.length} categories</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState>No full-game boards yet.</EmptyState>
        )}
      </div>
    </Layout>
  );
}

export default function Game() {
  const { game } = useParams();
  const page = useApi(() => fetchFgGame(game), [game]);
  const p = page.data;
  if (!page.loading && !p) return <Navigate to="/fullgame" replace />;
  return (
    <Layout background={bannerImage(null)} blur narrow>
      <div className="fg-page">
        <nav className="fg-breadcrumb">
          <Link to="/fullgame">Full Game</Link> › {p?.game.name || game}
        </nav>
        <h1 className="fg-title">{p?.game.name}</h1>
        {page.loading && !p ? (
          <Loading />
        ) : (
          GROUPS.map(([label, test]) => {
            const list = p.categories.filter(test);
            if (!list.length) return null;
            return (
              <section key={label} className="fg-section">
                <h2 className="fg-section-title">{label}</h2>
                <div className="fg-grid">
                  {list.map((c) => (
                    <Link key={c.id} to={boardPath(p.game.slug, c.slug)} className="fg-tile" style={{ "--tile-image": `url("${bannerImage(c)}")` }}>
                      {c.players > 1 ? <PeopleIcon /> : <PersonIcon />}
                      <span className="fg-tile-name">{c.name}</span>
                      <span className="muted">
                        {c.type === "per_level" ? `${p.levels.length} levels` : "Full game"} · {c.players > 1 ? `${c.players} players` : "Solo"}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </Layout>
  );
}
