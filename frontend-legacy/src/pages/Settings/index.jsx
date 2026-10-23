import Layout from "../../components/Layout";
import { Avatar, Panel } from "../../components/ui";
import { MoreIcon } from "../../components/Icons";
import useCurrentUser, { clearCurrentUser, reloadCurrentUser, setViewAsPlayer, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { useEffect, useState } from "react";
import { fetchUser, logout, setMyCountry, setMyCountryFromSteam, setMyDisplay, steamLoginUrl } from "../../api/client";
import { COUNTRY_LIST } from "../../data/countries";
import { bumpDataVersion } from "../../lib/dataVersion";
import useTheme from "../../hooks/useTheme";
import useCoopPbStyle, { COOP_PB_STYLES } from "../../hooks/useCoopPbStyle";
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

// Your name and picture: your own, or back to your Steam ones. Whatever staff have set stays
// until they reset it.
function DisplaySetting({ user }) {
  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [state, setState] = useState({ busy: false, message: null, error: null });
  const load = () =>
    fetchUser(user.profileNumber)
      .then((u) => {
        setMe(u);
        setName(u?.board_name || u?.steam_name || "");
      })
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.profileNumber]);
  const save = async (changes, message) => {
    setState({ busy: true, message: null, error: null });
    try {
      await setMyDisplay(changes);
      setState({ busy: false, message, error: null });
      setUrl("");
      await load();
      reloadCurrentUser();
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, message: null, error: e.message });
    }
  };
  if (!me) return null;
  const shownName = me.board_name || me.steam_name;
  return (
    <section className="settings-section">
      <h2>Name &amp; picture</h2>
      <div className="settings-row settings-display">
        <Avatar src={me.avatar} name={shownName} size={82} />
        <div className="settings-display-fields">
          <div className="settings-row settings-country">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Name" placeholder={me.steam_name || "Name"} disabled={state.busy || me.name_locked} />
            <button type="button" className="outline-button" disabled={state.busy || me.name_locked || !name.trim() || name.trim() === shownName} onClick={() => save({ name: name.trim() }, "Name saved.")}>
              Save name
            </button>
            <button type="button" className="outline-button" disabled={state.busy || me.name_locked || !me.board_name} onClick={() => save({ name: null }, "Back to your Steam name.")} title={me.board_name ? undefined : "Already your Steam name"}>
              Use my Steam name
            </button>
          </div>
          <div className="settings-row settings-country">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Picture address (https://…)" aria-label="Picture address" disabled={state.busy || me.avatar_locked} />
            <button type="button" className="outline-button" disabled={state.busy || me.avatar_locked || !url.trim()} onClick={() => save({ avatar: url.trim() }, "Picture saved.")}>
              Save picture
            </button>
            <button type="button" className="outline-button" disabled={state.busy || me.avatar_locked} onClick={() => save({ avatar: "steam" }, "Set to your current Steam picture.")} title="Use your current Steam picture">
              Use my Steam picture
            </button>
          </div>
        </div>
      </div>
      <p className="muted settings-note">
        {me.name_locked || me.avatar_locked
          ? `Your ${me.name_locked && me.avatar_locked ? "name and picture were" : me.name_locked ? "name was" : "picture was"} set by staff, so ${me.name_locked && me.avatar_locked ? "they" : "it"} can't be changed here.`
          : "Shown on the boards instead of your Steam name and picture. They stay when you sign in again."}
      </p>
      {state.message && <p className="settings-ok">{state.message}</p>}
      {state.error && <p className="settings-error">{state.error}</p>}
    </section>
  );
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [pbStyle, setPbStyle] = useCoopPbStyle();
  const user = useCurrentUser();
  // The real staff tier, also while viewing as a player.
  const staffRole = user && !user.sample ? user.staffRole || user.role : null;

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
          <h3 className="settings-sub">Co-op PBs in Score Updates</h3>
          <div className="segmented settings-theme">
            {COOP_PB_STYLES.map((o) => (
              <button key={o.value} type="button" className={pbStyle === o.value ? "is-active" : ""} onClick={() => setPbStyle(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="muted settings-note">How a co-op run marks which player set a personal best: a trophy by their name, or their name in their portal colour.</p>
        </section>

        {user && !user.sample && <DisplaySetting user={user} />}
        {user && !user.sample && <CountrySetting user={user} />}

        {staffRole && (
          <section className="settings-section">
            <h2>Staff</h2>
            <div className="segmented settings-theme">
              {[
                [false, `As ${ROLE_LABELS[staffRole].toLowerCase()}`],
                [true, "As a player"],
              ].map(([asPlayer, label]) => (
                <button key={label} type="button" className={Boolean(user.staffRole) === asPlayer ? "is-active" : ""} onClick={() => setViewAsPlayer(asPlayer)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="muted settings-note">See the site as a regular player would: staff tools, links and menus are hidden until you switch back (saved in this browser).</p>
          </section>
        )}

        <section className="settings-section">
          <h2>Account</h2>
          {user && !user.sample ? (
            <div className="settings-row">
              <span>
                Signed in through Steam as <b>{user.name}</b>
                {staffRole ? ` (${ROLE_LABELS[staffRole]})` : ""}.
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
