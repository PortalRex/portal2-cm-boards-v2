import Layout from "../../components/Layout";
import { Panel } from "../../components/ui";
import { MoreIcon } from "../../components/Icons";
import useCurrentUser, { clearCurrentUser, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { useEffect, useState } from "react";
import { fetchUser, logout, setMyCountry, setMyCountryFromSteam, steamLoginUrl } from "../../api/client";
import { COUNTRY_LIST } from "../../data/countries";
import { bumpDataVersion } from "../../lib/dataVersion";
import useTheme from "../../hooks/useTheme";
import background from "../../scenes/global/img/Background.png";
import "./Settings.css";

// Your country: shown on your profile with your rank in it, and on the boards' country filter.
function CountrySetting({ user }) {
  const [country, setCountry] = useState("");
  const [state, setState] = useState({ busy: false, message: null, error: null });
  useEffect(() => {
    fetchUser(user.profileNumber)
      .then((u) => setCountry(u?.country_id ? String(u.country_id) : ""))
      .catch(() => {});
  }, [user.profileNumber]);
  const act = async (fn, message) => {
    setState({ busy: true, message: null, error: null });
    try {
      const res = await fn();
      if (res && "country_id" in res) setCountry(res.country_id ? String(res.country_id) : "");
      setState({ busy: false, message, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, message: null, error: e.message });
    }
  };
  return (
    <section className="settings-section">
      <h2>Country</h2>
      <div className="settings-row settings-country">
        <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={state.busy} aria-label="Country">
          <option value="">Not set</option>
          {COUNTRY_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="outline-button" disabled={state.busy} onClick={() => act(() => setMyCountry(country ? Number(country) : null), "Saved.")}>
          Save
        </button>
        <button type="button" className="outline-button" disabled={state.busy} onClick={() => act(() => setMyCountryFromSteam(), "Set from your Steam profile.")}>
          Use my Steam country
        </button>
      </div>
      <p className="muted settings-note">Shown on your profile with your rank in your country, and used for the boards' country filter.</p>
      {state.message && <p className="settings-ok">{state.message}</p>}
      {state.error && <p className="settings-error">{state.error}</p>}
    </section>
  );
}

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

        {user && !user.sample && <CountrySetting user={user} />}

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
