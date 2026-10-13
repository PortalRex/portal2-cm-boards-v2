import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Card, Avatar, Flag, Loading, EmptyState } from "../../components/ui";
import { GlobeIcon, HistoryIcon, PeakIcon, SparkleIcon, TrophyIcon, SteamIcon, TwitchIcon, YouTubeIcon, StarIcon, StarOutlineIcon } from "../../components/Icons";
import { fetchPointsHistory, fetchPointsPeak, fetchProfile } from "../../api/client";
import { countryName } from "../../data/countries";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import useFollows from "../../hooks/useFollows";
import useCurrentUser, { isRoleAdmin, isStaff, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { setProfileBanned, setProfileDisplay, setProfileFrozen, setProfileRole } from "../../api/client";
import { bumpDataVersion } from "../../lib/dataVersion";
import { formatDate, formatScore, ordinalSuffix, timeAgo, formatPoints } from "../../lib/format";
import { youtubeChannelUrl } from "../../lib/youtube";
import ProfileTabs from "./ProfileTabs";
import { playerRole, roleProgress } from "../../data/roles";
import ActivityHeatmap from "./ActivityHeatmap";
import "./Profile.css";


export default function Profile() {
  const { profileId } = useParams();
  const version = useDataVersion();
  const profile = useApi(() => fetchProfile(profileId), [profileId, version]);
  const p = profile.data;

  return (
    <Layout background={p?.player.avatar} blur>
      {profile.loading && !p ? (
        <Loading label="Loading profile" />
      ) : !p ? (
        <EmptyState>Couldn’t load this profile.</EmptyState>
      ) : (
        <div className="profile">
          <div className="pf-row pf-row-1">
            <ProfileHeader player={p.player} role={playerRole(p.points)} />
            <Card icon={SparkleIcon} title="Challenge Mode Points" collapseId="profile.points" className="pf-points">
              <div className="stat-row">
                {[
                  ["sp", "Singleplayer"],
                  ["coop", "Cooperative"],
                  ["overall", "Overall"],
                ].map(([key, label]) => (
                  <Stat key={key} value={formatPoints(p.points[key])} label={label}>
                    <RoleBar board={key} points={p.points[key] || 0} />
                  </Stat>
                ))}
              </div>
            </Card>
          </div>

          <div className="pf-row pf-row-2">
            <Card icon={GlobeIcon} title="Global Rank" collapseId="profile.rank" className="pf-global">
              <div className="stat-row">
                <Stat value={<Ordinal n={p.globalRank?.sp} />} label="Singleplayer" />
                <Stat value={<Ordinal n={p.globalRank?.coop} />} label="Cooperative" />
                <Stat value={<Ordinal n={p.globalRank?.overall} />} label="Overall" />
                <Stat
                  value={
                    <>
                      <Ordinal n={p.globalRank?.country} />
                      <Flag code={p.player.country} height={18} />
                    </>
                  }
                  label={`In ${countryName(p.player.country) || "country"}`}
                />
              </div>
              <PointsChart profileNumber={p.player.profileNumber} fallback={p.history} />
            </Card>

            <Card icon={SparkleIcon} title="Statistics" collapseId="profile.stats" className="pf-stats">
              <div className="pf-stat-grid">
                <ScoreStat label="Newest score" entry={p.newest} green />
                <ScoreStat label="Oldest score" entry={p.oldest} />
                <PlaceStat label="Best place" entry={p.best} />
                <PlaceStat label="Worst place" entry={p.worst} />
              </div>
            </Card>

            <div className="pf-side">
              <Card icon={SparkleIcon} title="Average Place" collapseId="profile.average" className="pf-side-card">
                <div className="stat-row">
                  <Stat value={fmtAvg(p.averagePlace.sp)} label="Single Player" />
                  <Stat value={fmtAvg(p.averagePlace.coop)} label="Cooperative" />
                  <Stat value={fmtAvg(p.averagePlace.overall)} label="Overall" />
                </div>
              </Card>
              <Card icon={TrophyIcon} title="World Records" collapseId="profile.wrs" className="pf-side-card">
                <div className="stat-row">
                  <Stat value={p.worldRecords.sp} label="Single Player" />
                  <Stat value={p.worldRecords.coop} label="Cooperative" />
                  <Stat value={p.worldRecords.sp + p.worldRecords.coop} label="Overall" />
                </div>
              </Card>
              <PeakPoints profileNumber={p.player.profileNumber} />
            </div>
          </div>

          {p.history?.length > 0 && (
            <Card icon={HistoryIcon} title="Activity" collapseId="profile.activity" className="pf-activity-card">
              <ActivityHeatmap history={p.history} />
            </Card>
          )}

          <ProfileTabs profile={p} />
        </div>
      )}
    </Layout>
  );
}

const fmtAvg = (v) => (v == null ? "–" : v.toFixed(1));

function Ordinal({ n }) {
  if (!n) return <>–</>;
  return (
    <>
      {n}
      <small>{ordinalSuffix(n)}</small>
    </>
  );
}

// Highest points the player has ever had per board, with the date (hover) it was reached.
function PeakPoints({ profileNumber }) {
  const version = useDataVersion();
  const peak = useApi(() => fetchPointsPeak(profileNumber), [profileNumber, version]);
  const one = (key, label) => {
    const v = peak.data?.[key];
    return (
      <Stat value={v ? Math.round(v.points) : "–"} label={label}>
        {v && <span className="pf-peak-date num">{formatDate(v.date)}</span>}
      </Stat>
    );
  };
  return (
    <Card icon={PeakIcon} title="Peak Points" collapseId="profile.peak" className="pf-side-card">
      <div className="stat-row">
        {one("sp", "Single Player")}
        {one("coop", "Cooperative")}
        {one("overall", "Overall")}
      </div>
    </Card>
  );
}

// Progress toward the next community role on a board; hover (or focus) shows how far off it is.
function RoleBar({ board, points }) {
  const prog = roleProgress(board, points);
  const text = prog.reached ? `${prog.reached} threshold reached` : `${prog.missing.toLocaleString()} points to ${prog.next} | ${prog.percent}%`;
  const [pos, setPos] = useState(null);
  // The label goes on the page body (the card would clip it), above the bar and inside the window.
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const half = 110;
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: r.top });
  };
  return (
    <span className="pf-bar-wrap" tabIndex={0} aria-label={text} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {/* Filled in the colour of the role already reached on this board (grey before the first). */}
      <span className="pf-bar">
        <span style={{ width: `${Math.min(100, prog.percent)}%`, background: prog.current?.color || "var(--text-muted)" }} />
      </span>
      {pos &&
        createPortal(
          <span className="comment-bubble" role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

function Stat({ value, label, children }) {
  return (
    <div className="stat">
      <span className="stat-value num">{value}</span>
      <span className="stat-label">{label}</span>
      {children}
    </div>
  );
}

function ScoreStat({ label, entry, green }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value num">
        {entry?.score != null ? formatScore(entry.score) : "–"}
        {entry?.score != null && <small>s</small>}
      </span>
      {entry && (
        <span className="stat-on">
          on <b>{entry.map.title}</b>
        </span>
      )}
      {entry?.timestamp && <span className={`stat-when ${green ? "green" : "muted"}`}>{timeAgo(entry.timestamp)}</span>}
    </div>
  );
}

function PlaceStat({ label, entry }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value num">
        <Ordinal n={entry?.rank} />
      </span>
      {entry && (
        <span className="stat-on">
          on <b>{entry.map.title}</b>
        </span>
      )}
    </div>
  );
}

function ProfileHeader({ player, role }) {
  const links = [
    { href: `https://steamcommunity.com/profiles/${player.steam}`, icon: SteamIcon, label: "Steam", className: "is-steam" },
    player.twitch && { href: `https://twitch.tv/${player.twitch}`, icon: TwitchIcon, label: "Twitch", className: "is-twitch" },
    youtubeChannelUrl(player.youtube) && { href: youtubeChannelUrl(player.youtube), icon: YouTubeIcon, label: "YouTube", className: "is-youtube" },
  ].filter(Boolean);
  return (
    <section className="pf-header">
      <Avatar src={player.avatar} name={player.name} size={180} className="pf-avatar" />
      <div className="pf-identity">
        <h1 className="pf-name" style={role ? { color: role.color } : undefined} title={role ? `${role.name} (from points)` : undefined}>
          {player.name}
        </h1>
        {/* All badges together on one row under the name. */}
        <div className="pf-badges">
          {(player.badges || []).map((b) => (
            <span key={b.label} className={`pf-badge is-${b.tone}`}>
              {b.label}
            </span>
          ))}
          {player.banned && (
            <span className="pf-badge is-red" title="Banned: this player's runs are hidden from the boards">
              Banned
            </span>
          )}
          {player.frozen && (
            <span className="pf-badge is-frozen" title={player.frozenReason ? `Frozen: ${player.frozenReason}` : "Frozen: existing times stay, new ones aren't accepted"}>
              Frozen
            </span>
          )}
        </div>
        {player.country && (
          <div className="pf-country">
            <Flag code={player.country} height={22} />
            {countryName(player.country)}
          </div>
        )}
        <div className="pf-staff-tools">
          <RoleControl player={player} />
          <FreezeControl player={player} />
          <BanControl player={player} />
          <DisplayControl player={player} />
        </div>
      </div>
      <FollowButton player={player} />
      <CompareLink player={player} />
      <div className="pf-links">
        {links.map(({ href, icon: Icon, label, className }) => (
          <a key={label} href={href} target="_blank" rel="noreferrer" className={`pf-link ${className}`} aria-label={label} title={label}>
            <Icon size={32} />
          </a>
        ))}
      </div>
    </section>
  );
}

// Admins: set the player's staff tier (saved immediately, recorded in the audit log).
function RoleControl({ player }) {
  const user = useCurrentUser();
  const [state, setState] = useState({ busy: false, error: null });
  if (!isRoleAdmin(user) || user.profileNumber === player.profileNumber) return null;
  const change = async (role) => {
    setState({ busy: true, error: null });
    try {
      await setProfileRole(player.profileNumber, role || null);
      setState({ busy: false, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  return (
    <label className="pf-role" title={state.error || "Staff tier"}>
      <span>Role</span>
      <select value={player.role || ""} disabled={state.busy} onChange={(e) => change(e.target.value)}>
        <option value="">None</option>
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Moderators and admins: replace a bad name or picture (locked against Steam sign-ins until
// reset), or go back to the player's Steam name / picture.
function DisplayControl({ player }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(player.name);
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: null });
  if (!isStaff(user) || !(user.role === "moderator" || user.role === "admin")) return null;
  const save = async (changes) => {
    setState({ busy: true, error: null });
    try {
      await setProfileDisplay(player.profileNumber, changes, reason.trim() || undefined);
      setState({ busy: false, error: null });
      setUrl("");
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  if (!open)
    return (
      <button type="button" className="pf-admin-button" onClick={() => setOpen(true)} title="Replace this player's name or picture">
        Edit name & picture
        {(player.nameLocked || player.avatarLocked) && <span className="pf-locked"> (set by staff)</span>}
      </button>
    );
  return (
    <div className="pf-display-form">
      <div className="pf-freeze-form">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Name" placeholder="Name" />
        <button type="button" className="pf-admin-button" disabled={state.busy || !name.trim()} onClick={() => save({ name: name.trim() })}>
          Set name
        </button>
        {player.nameLocked && (
          <button type="button" className="pf-admin-button" disabled={state.busy} onClick={() => save({ name: null })} title={player.steamName ? `Back to “${player.steamName}”` : undefined}>
            Use Steam name
          </button>
        )}
      </div>
      <div className="pf-freeze-form">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Picture address (https://…)" aria-label="Picture address" />
        <button type="button" className="pf-admin-button" disabled={state.busy || !url.trim()} onClick={() => save({ avatar: url.trim() })}>
          Set picture
        </button>
        <button type="button" className="pf-admin-button" disabled={state.busy} onClick={() => save({ avatar: "default" })}>
          Default picture
        </button>
        {player.avatarLocked && (
          <button type="button" className="pf-admin-button" disabled={state.busy} onClick={() => save({ avatar: "steam" })}>
            Use Steam picture
          </button>
        )}
      </div>
      <div className="pf-freeze-form">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit log)" maxLength={500} />
        <button type="button" className="pf-admin-button" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
      {state.error && <span className="pf-freeze-error">{state.error}</span>}
    </div>
  );
}

// Moderators and admins: ban a profile (all its runs leave the boards and the player is signed
// out) or unban it. Staff have to lose their role before they can be banned.
function BanControl({ player }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: null });
  const canBan = isStaff(user) && (user.role === "moderator" || user.role === "admin");
  if (!canBan || user.profileNumber === player.profileNumber || (player.role && !player.banned)) return null;
  const save = async (banned) => {
    setState({ busy: true, error: null });
    try {
      await setProfileBanned(player.profileNumber, banned, reason.trim() || undefined);
      setOpen(false);
      setReason("");
      setState({ busy: false, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  if (player.banned) {
    return (
      <button type="button" className="pf-admin-button" disabled={state.busy} onClick={() => save(false)} title={state.error || "Put this player's runs back on the boards"}>
        Unban
      </button>
    );
  }
  return open ? (
    <form
      className="pf-freeze-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit log)" maxLength={500} autoFocus />
      <button type="submit" className="pf-admin-button is-danger" disabled={state.busy}>
        Ban
      </button>
      <button type="button" className="pf-admin-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && <span className="pf-freeze-error">{state.error}</span>}
    </form>
  ) : (
    <button type="button" className="pf-admin-button is-danger" onClick={() => setOpen(true)} title="Hide all of this player's runs and list them on the Wall of Shame">
      Ban profile
    </button>
  );
}

// Staff: freeze (existing times stay, new ones are refused) or unfreeze the profile.
function FreezeControl({ player }) {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: null });
  if (!isStaff(user) || user.profileNumber === player.profileNumber) return null;
  const save = async (frozen) => {
    setState({ busy: true, error: null });
    try {
      await setProfileFrozen(player.profileNumber, frozen, reason.trim() || undefined);
      setOpen(false);
      setReason("");
      setState({ busy: false, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  if (player.frozen) {
    return (
      <button type="button" className="pf-admin-button" disabled={state.busy} onClick={() => save(false)} title={state.error || "Allow new times again"}>
        Unfreeze
      </button>
    );
  }
  return open ? (
    <form
      className="pf-freeze-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit log)" maxLength={500} autoFocus />
      <button type="submit" className="pf-admin-button is-danger" disabled={state.busy}>
        Freeze
      </button>
      <button type="button" className="pf-admin-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && <span className="pf-freeze-error">{state.error}</span>}
    </form>
  ) : (
    <button type="button" className="pf-admin-button" onClick={() => setOpen(true)} title="Keep this player's times but refuse new ones">
      Freeze profile
    </button>
  );
}

// Compare this player with yourself (signed in), or pick someone to compare with.
function CompareLink({ player }) {
  const user = useCurrentUser();
  const me = user && !user.sample && user.profileNumber !== player.profileNumber ? user.profileNumber : null;
  const to = me ? `/compare?a=${me}&b=${player.profileNumber}` : `/compare?a=${player.profileNumber}`;
  return (
    <Link to={to} className="pf-follow pf-compare" title={me ? "Compare your times with this player" : "Compare this player with someone"}>
      Compare
    </Link>
  );
}

function FollowButton({ player }) {
  const { isFollowing, toggleFollow } = useFollows();
  const following = isFollowing(player.profileNumber);
  return (
    <button
      type="button"
      className={`pf-follow${following ? " is-following" : ""}`}
      onClick={() => toggleFollow(player)}
      aria-pressed={following}
      title={following ? "Stop following (saved in this browser)" : "Follow this player's runs on Score Updates (saved in this browser)"}
    >
      {following ? <StarIcon /> : <StarOutlineIcon />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

const SERIES = [
  { key: "sp", label: "Singleplayer", color: "var(--series-sp)" },
  { key: "coop", label: "Cooperative", color: "var(--series-coop)" },
  { key: "overall", label: "Overall", color: "var(--series-overall)" },
];

// Points over time as they really were: ranks are recomputed against everyone's best times at
// each date, so being passed shows as a drop (see fetchPointsHistory in api/client).
function PointsChart({ profileNumber, fallback }) {
  const [hidden, setHidden] = useState({});
  const version = useDataVersion();
  const history = useApi(() => fetchPointsHistory(profileNumber, fallback), [profileNumber, version]);
  const data = history.data || [];
  if (history.loading && !history.data) return <div className="pf-chart-empty muted">Loading points history…</div>;
  if (data.length < 2) return <div className="pf-chart-empty muted">Not enough submissions for a points history yet.</div>;
  return (
    <div className="pf-chart">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: "var(--menu)", border: "1px solid var(--border)", borderRadius: 4 }}
            labelStyle={{ color: "var(--text-2)" }}
            labelFormatter={(d) => formatDate(d)}
            formatter={(v, name) => [`${v} pts`, name]}
          />
          {SERIES.filter((s) => !hidden[s.key]).map((s) => (
            <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={3} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="pf-legend">
        <span className="pf-legend-title muted">Points over time</span>
        {SERIES.map((s) => (
          <button key={s.key} type="button" className={hidden[s.key] ? "is-off" : ""} onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}>
            <span style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
