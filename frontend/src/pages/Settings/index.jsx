import Layout from "../../components/Layout";
import { Panel } from "../../components/ui";
import { MoreIcon } from "../../components/Icons";
import useCurrentUser, { clearCurrentUser, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { logout, steamLoginUrl } from "../../api/client";
import useTheme from "../../hooks/useTheme";
import background from "../../scenes/global/img/Background.png";
import "./Settings.css";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const user = useCurrentUser();

  return (
    <Layout background={background} tint="mono" narrow>
      <Panel icon={MoreIcon} title="Settings" bodyClassName="settings">
        <section className="settings-section">
          <h2>Appearance</h2>
          <div className="segmented settings-theme">
            {["dark", "light"].map((t) => (
              <button key={t} type="button" className={theme === t ? "is-active" : ""} onClick={() => theme !== t && toggleTheme()}>
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>Account</h2>
          {user && !user.sample ? (
            <div className="settings-row">
              <span>
                Signed in through Steam as <b>{user.name}</b>
                {user.role ? ` (${ROLE_LABELS[user.role]})` : ""}.
              </span>
              <button
                type="button"
                className="outline-button"
                onClick={async () => {
                  await logout().catch(() => {});
                  clearCurrentUser();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="settings-row">
              <span className="muted">Not signed in.</span>
              <a className="outline-button" href={steamLoginUrl("/more/settings")}>
                Sign in through Steam
              </a>
            </div>
          )}
        </section>
      </Panel>
    </Layout>
  );
}
