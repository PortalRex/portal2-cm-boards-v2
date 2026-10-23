import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel } from "../../components/ui";
import { InfoIcon } from "../../components/Icons";
import background from "../../scenes/global/img/Background.png";
import "./About.css";

const DISCORD = "https://discord.gg/hRwE4Zr";

// Points for a rank: max(1, (201 − rank)² / 200) for the top 200, as the board computes them.
const pointsFor = (rank) => Math.max(1, (201 - rank) ** 2 / 200);
const EXAMPLES = [1, 2, 5, 10, 25, 50, 100, 150, 200];

const TEAM = [
  { role: "Developers and admins", names: ["Jonese1234", "Rex", "Daniel"] },
  { role: "Admins", names: ["Betsruner", "Bexc"] },
];

// About the boards, based on the original board's About page (board.portal2.sr/about).
export default function About() {
  return (
    <Layout background={background} tint="mono" narrow>
      <Panel icon={InfoIcon} title="About" bodyClassName="about-body">
        <section className="about-hero">
          <h1>Portal 2 Challenge Mode Leaderboards</h1>
          <p>
            The community leaderboards for Portal 2 and Portal Stories: Mel Challenge Mode: every single player chamber and co-op course,
            with demos, videos and history for each time.
          </p>
        </section>

        <section className="about-grid">
          <article className="about-card">
            <h2>Find your way around</h2>
            <ul>
              <li>
                <Link to="/">Score Updates</Link>: the latest times, as they come in.
              </li>
              <li>
                <Link to="/maps">Leaderboard</Link>: every map&apos;s board, chapter by chapter.
              </li>
              <li>
                <Link to="/leaderboard/overall">Aggregate</Link>: points and summed times across single player, co-op and each chapter.
              </li>
              <li>
                <Link to="/compare">Compare Players</Link>: two players&apos; times side by side.
              </li>
            </ul>
          </article>

          <article className="about-card">
            <h2>Rules</h2>
            <p>
              Runs must follow the Challenge Mode rules and allowed console commands, listed at{" "}
              <a href="https://rules.portal2.sr/" target="_blank" rel="noreferrer">
                rules.portal2.sr
              </a>
              . Times in the top 200 need a demo; without one they stay pending and earn no points. Use the report button on any run that
              looks wrong.
            </p>
          </article>
        </section>

        <section className="about-card">
          <h2>How points work</h2>
          <p>
            Each map&apos;s board tracks the top 500 times, and the top 200 earn points: <strong>(201 − rank)² ÷ 200</strong>, at least 1.
            First place earns 200 points and points fall off faster near the top, so a few places there are worth more than many places
            lower down. Your total is the sum over every map; the Aggregate boards add them up for single player, co-op, both, and each
            chapter.
          </p>
          <div className="about-points" role="table" aria-label="Points by rank">
            {EXAMPLES.map((r) => (
              <div key={r} className="about-point" role="row">
                <span className="about-point-rank">#{r}</span>
                <span className="about-point-value num">{Math.round(pointsFor(r) * 10) / 10}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="about-grid">
          <article className="about-card">
            <h2>Team</h2>
            {TEAM.map((t) => (
              <div key={t.role} className="about-team">
                <span className="about-team-role">{t.role}</span>
                <span>{t.names.join(", ")}</span>
              </div>
            ))}
          </article>

          <article className="about-card">
            <h2>Community</h2>
            <ul>
              <li>
                <a href={DISCORD} target="_blank" rel="noreferrer">
                  Discord
                </a>
                : news, questions and run discussion.
              </li>
              <li>
                <a href="https://github.com/p2sr/portal2-cm-boards-v2" target="_blank" rel="noreferrer">
                  GitHub
                </a>
                : the boards&apos; source code.
              </li>
              <li>
                <Link to="/more/donators">Donators</Link> and the <Link to="/more/wall-of-shame">Wall of Shame</Link>.
              </li>
            </ul>
          </article>
        </section>

        <section className="about-grid">
          <article className="about-card">
            <h2>Data and API</h2>
            <p>
              Everything on the site comes from a JSON API under <code>/api/v1</code>, for example <code>/api/v1/changelog</code> for score
              updates or <code>/api/v1/map/sp/&lt;map id&gt;</code> for a map&apos;s board. Every submitted demo is kept with its run.
            </p>
          </article>

          <article className="about-card">
            <h2>Credits</h2>
            <p>
              The original board was developed and designed by ncla, improved by iVerb, and maintained by Jonese1234, mlugg and NeKz. Run
              videos are rendered by autorender, and demos are read with NeKz&apos;s sdp.
            </p>
          </article>
        </section>
      </Panel>
    </Layout>
  );
}
