import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Card, Avatar, Flag, Loading, EmptyState } from "../../components/ui";
import { GlobeIcon, SparkleIcon, TrophyIcon, SteamIcon, TwitchIcon, YouTubeIcon, StarIcon, StarOutlineIcon } from "../../components/Icons";
import { fetchProfile } from "../../api/client";
import { countryName } from "../../data/countries";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import useFollows from "../../hooks/useFollows";
import useCurrentUser, { isRoleAdmin, isStaff, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { setProfileFrozen, setProfileRole } from "../../api/client";
import { bumpDataVersion } from "../../lib/dataVersion";
import { formatDate, formatScore, ordinalSuffix, timeAgo, formatPoints } from "../../lib/format";
import { youtubeChannelUrl } from "../../lib/youtube";
import ProfileTabs from "./ProfileTabs";
import "./Profile.css";

// Theoretical maximum points (200 per map) used to scale the progress bars.
const MAX_POINTS = { sp: 60 * 200, coop: 48 * 200, overall: 108 * 200 };

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
            <ProfileHeader player={p.player} />
            <Card icon={SparkleIcon} title="Challenge Mode Points" className="pf-points">
              <div className="stat-row">
                {[
                  ["sp", "Singleplayer"],
                  ["coop", "Cooperative"],
                  ["overall", "Overall"],
                ].map(([key, label]) => (
                  <Stat key={key} value={formatPoints(p.points[key])} label={label}>
                    <span className={`pf-bar ${key === "overall" ? "is-red" : ""}`}>
                      <span style={{ width: `${Math.min(100, (p.points[key] / MAX_POINTS[key]) * 100)}%` }} />
                    </span>
                  </Stat>
                ))}
              </div>
            </Card>
          </div>

          <div className="pf-row pf-row-2">
            <Card icon={GlobeIcon} title="Global Rank" className="pf-global">
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
              <PointsChart history={p.pointsHistory} />
            </Card>

            <Card icon={SparkleIcon} title="Statistics" className="pf-stats">
              <div className="pf-stat-grid">
                <ScoreStat label="Newest score" entry={p.newest} green />
                <ScoreStat label="Oldest score" entry={p.oldest} />
                <PlaceStat label="Best place" entry={p.best} />
                <PlaceStat label="Worst place" entry={p.worst} />
              </div>
            </Card>

            <div className="pf-side">
              <Card icon={SparkleIcon} title="Average Place">
                <div className="stat-row">
                  <Stat value={fmtAvg(p.averagePlace.sp)} label="Single Player" />
                  <Stat value={fmtAvg(p.averagePlace.coop)} label="Cooperative" />
                  <Stat value={fmtAvg(p.averagePlace.overall)} label="Overall" />
                </div>
              </Card>
              <Card icon={TrophyIcon} title="World Records">
                <div className="stat-row">
                  <Stat value={p.worldRecords.sp} label="Single Player" />
                  <Stat value={p.worldRecords.coop} label="Cooperative" />
                  <Stat value={p.worldRecords.sp + p.worldRecords.coop} label="Overall" />
                </div>
              </Card>
            </div>
          </div>

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

function ProfileHeader({ player }) {
  const links = [
    { href: `https://steamcommunity.com/profiles/${player.steam}`, icon: SteamIcon, label: "Steam", className: "is-steam" },
    player.twitch && { href: `https://twitch.tv/${player.twitch}`, icon: TwitchIcon, label: "Twitch", className: "is-twitch" },
    youtubeChannelUrl(player.youtube) && { href: youtubeChannelUrl(player.youtube), icon: YouTubeIcon, label: "YouTube", className: "is-youtube" },
  ].filter(Boolean);
  return (
    <section className="pf-header">
      <Avatar src={player.avatar} name={player.name} size={180} className="pf-avatar" />
      <div className="pf-identity">
        <div className="pf-name-row">
          <h1>{player.name}</h1>
          {(player.badges || []).map((b) => (
            <span key={b.label} className={`pf-badge is-${b.tone}`}>
              {b.label}
            </span>
          ))}
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
      </div>
      <RoleControl player={player} />
      <FreezeControl player={player} />
      <FollowButton player={player} />
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
  { key: "coop", label: "Cooperative", color: "var(--series-coop)" },
  { key: "sp", label: "Singleplayer", color: "var(--series-sp)" },
  { key: "overall", label: "Overall", color: "var(--series-overall)" },
];

// Points over time, rebuilt from the player's submissions (see pointsHistory in api/client).
function PointsChart({ history }) {
  const [hidden, setHidden] = useState({});
  const data = useMemo(() => history || [], [history]);
  if (data.length < 2) return <div className="pf-chart-empty muted">Not enough submissions for a points history yet.</div>;
  return (
    <div className="pf-chart">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            contentStyle={{ background: "var(--menu)", border: "1px solid var(--border)", borderRadius: 4 }}
            labelStyle={{ color: "var(--text-2)" }}
            labelFormatter={(d) => formatDate(d)}
            formatter={(v, name) => [`${v} pts`, name]}
          />
          {SERIES.filter((s) => !hidden[s.key]).map((s) => (
            <Line key={s.key} type="stepAfter" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={3} dot={false} isAnimationActive={false} />
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
