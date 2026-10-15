import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Layout from "../../components/Layout";
import { Card, Avatar, Flag, Loading, EmptyState } from "../../components/ui";
import { GlobeIcon, HistoryIcon, PeakIcon, SparkleIcon, TrophyIcon, SteamIcon, TwitchIcon, YouTubeIcon, StarIcon, StarOutlineIcon, SwapIcon, EditIcon, TriangleDown } from "../../components/Icons";
import { fetchPointsHistory, fetchPointsPeak, fetchProfile, fetchProfileAt, profileAsOf, adminSetCountry } from "../../api/client";
import useWheelZoom from "../../hooks/useWheelZoom";
import { useCollapsedGroup } from "../../hooks/useCollapsed";
import { countryName, COUNTRY_LIST, countryIdByCode } from "../../data/countries";
import useApi from "../../hooks/useApi";
import { useDataVersion } from "../../lib/dataVersion";
import useFollows from "../../hooks/useFollows";
import useCurrentUser, { isRoleAdmin, isStaff, ROLE_LABELS } from "../../hooks/useCurrentUser";
import { setProfileBanned, setProfileDisplay, setProfileFrozen, setProfileRole } from "../../api/client";
import { bumpDataVersion } from "../../lib/dataVersion";
import { formatDate, formatDateTime, formatScore, ordinalSuffix, timeAgo, formatPoints, parseTimestamp } from "../../lib/format";
import { youtubeChannelUrl } from "../../lib/youtube";
import ProfileTabs from "./ProfileTabs";
import { playerRole, roleIcon, roleProgress } from "../../data/roles";
import ActivityHeatmap from "./ActivityHeatmap";
import { rankVars } from "../../lib/ranks";
import "./Profile.css";


// Each player gets a fresh page (forms, tabs, zoom and loaded data), even when going from one
// profile straight to another.
export default function Profile() {
  const { profileId } = useParams();
  return <ProfileView key={profileId} profileId={profileId} />;
}

function ProfileView({ profileId }) {
  const version = useDataVersion();
  const profile = useApi(() => fetchProfile(profileId), [profileId, version]);
  const p = profile.data;
  // Peak points: shown in their own card, and Legends is kept once a peak reached it.
  const profileNumber = p?.player.profileNumber;
  // Tagged with whose peak it is, so a render before this player's peak arrives can't use none.
  const peakFetch = useApi(
    () => (profileNumber ? fetchPointsPeak(profileNumber).then((data) => ({ of: profileNumber, data })) : Promise.resolve(null)),
    [profileNumber, version],
  );
  const peakReady = peakFetch.data?.of === profileNumber || Boolean(peakFetch.error);
  const peak = { data: peakReady ? peakFetch.data?.data ?? null : null, loading: !peakReady };
  // ?at=YYYY-MM-DD: the profile as it was that day (picked on the points chart).
  const [params, setParams] = useSearchParams();
  const at = /^\d{4}-\d{2}-\d{2}$/.test(params.get("at") || "") ? params.get("at") : null;
  const past = useApi(() => (at && profileNumber ? fetchProfileAt(profileNumber, at) : Promise.resolve(null)), [profileNumber, at, version]);
  const view = p && at && past.data ? profileAsOf(p, past.data, at) : p;
  const pickDay = (day) => setParams(day ? { at: day } : {}, { replace: true });
  // Legends is kept once a peak reached it: the server records when, so the name has its colour
  // as soon as the profile loads (as of a past day, only if it was reached by then).
  const legendsAt = p?.player.legendsAt ? String(p.player.legendsAt).slice(0, 10) : null;
  const keptLegends = Boolean(legendsAt && (!at || legendsAt <= at));
  const role = view ? playerRole(view.points, at ? null : peak.data, keptLegends) : null;

  return (
    <Layout background={p?.player.avatar} blur>
      {profile.loading && !p ? (
        <Loading label="Loading profile" />
      ) : !p ? (
        <EmptyState>Couldn’t load this profile.</EmptyState>
      ) : (
        <div className="profile">
          {at && (
            <div className="pf-asof">
              <span>
                {past.loading ? "Loading " : "Showing "}
                {p.player.name}’s profile as it was on <strong className="num">{formatDate(at)}</strong>
                {past.error ? " (couldn’t load that day)" : ""}
              </span>
              <button type="button" className="pf-asof-clear" onClick={() => pickDay(null)}>
                Back to today
              </button>
            </div>
          )}
          <CollapseAll />
          <div className="pf-row pf-row-1">
            <ProfileHeader player={p.player} role={role} />
            <Card icon={SparkleIcon} title="Challenge Mode Points" collapseId="profile.points" className="pf-points">
              <div className="stat-row">
                {[
                  ["sp", "Singleplayer"],
                  ["coop", "Cooperative"],
                  ["overall", "Overall"],
                ].map(([key, label]) => (
                  <Stat key={key} value={formatPoints(view.points[key])} label={label}>
                    <RoleBar board={key} points={view.points[key] || 0} />
                  </Stat>
                ))}
              </div>
            </Card>
          </div>

          <div className="pf-row pf-row-2">
            <Card icon={GlobeIcon} title="Global Rank" collapseId="profile.rank" className="pf-global">
              <div className="stat-row">
                {/* Each rank opens its board on the page with this player. */}
                <Stat value={<Ordinal n={view.globalRank?.sp} colored />} label="Singleplayer" to={view.globalRank?.sp ? `/leaderboard/sp?player=${p.player.profileNumber}` : undefined} />
                <Stat value={<Ordinal n={view.globalRank?.coop} colored />} label="Cooperative" to={view.globalRank?.coop ? `/leaderboard/coop?player=${p.player.profileNumber}` : undefined} />
                <Stat value={<Ordinal n={view.globalRank?.overall} colored />} label="Overall" to={view.globalRank?.overall ? `/leaderboard/overall?player=${p.player.profileNumber}` : undefined} />
                <Stat
                  to={view.globalRank?.country && p.player.country ? `/leaderboard/overall?country=${p.player.country}&player=${p.player.profileNumber}` : undefined}
                  value={
                    <>
                      <Ordinal n={view.globalRank?.country} colored />
                      <Flag code={p.player.country} height={18} />
                    </>
                  }
                  label={`In ${countryName(p.player.country) || "country"}`}
                />
              </div>
              <PointsChart profileNumber={p.player.profileNumber} fallback={p.history} peak={peak.data} at={at} onPick={pickDay} />
            </Card>

            <Card icon={SparkleIcon} title="Statistics" collapseId="profile.stats" className="pf-stats">
              <div className="pf-stat-grid">
                <ScoreStat label="Newest score" entry={view.newest} green />
                <ScoreStat label="Oldest score" entry={view.oldest} />
                <PlaceStat label="Best place" entry={view.best} />
                <PlaceStat label="Worst place" entry={view.worst} />
              </div>
            </Card>

            <div className="pf-side">
              <Card icon={SparkleIcon} title="Average Place" collapseId="profile.average" className="pf-side-card">
                <div className="stat-row">
                  <Stat value={fmtAvg(view.averagePlace.sp)} label="Single Player" />
                  <Stat value={fmtAvg(view.averagePlace.coop)} label="Cooperative" />
                  <Stat value={fmtAvg(view.averagePlace.overall)} label="Overall" />
                </div>
              </Card>
              <Card icon={TrophyIcon} title="World Records" collapseId="profile.wrs" className="pf-side-card">
                <div className="stat-row">
                  <Stat value={view.worldRecords.sp} label="Single Player" />
                  <Stat value={view.worldRecords.coop} label="Cooperative" />
                  <Stat value={view.worldRecords.sp + view.worldRecords.coop} label="Overall" />
                </div>
              </Card>
              <PeakPoints peak={peak} />
            </div>
          </div>

          {p.history?.length > 0 && (
            <Card icon={HistoryIcon} title="Activity" collapseId="profile.activity" className="pf-activity-card">
              <ActivityHeatmap history={p.history} />
            </Card>
          )}

          <ProfileTabs profile={view} />
        </div>
      )}
    </Layout>
  );
}

const fmtAvg = (v) => (v == null ? "–" : v.toFixed(1));

// The profile's cards above the tabs.
const PROFILE_CARDS = ["profile.points", "profile.rank", "profile.stats", "profile.average", "profile.wrs", "profile.peak", "profile.activity"];

// Opens or closes every card above the tabs at once (each still opens on its own too).
function CollapseAll() {
  const [all, toggleAll] = useCollapsedGroup(PROFILE_CARDS);
  return (
    <div className="pf-collapse-all">
      <button type="button" onClick={toggleAll} aria-expanded={!all}>
        {all ? "Expand all" : "Collapse all"}
        <TriangleDown size={11} className={all ? "" : "is-up"} />
      </button>
    </div>
  );
}

// A rank as "20th"; `colored` uses the rank colours the boards use elsewhere.
function Ordinal({ n, colored = false }) {
  if (!n) return <>–</>;
  const text = (
    <>
      {n}
      <small>{ordinalSuffix(n)}</small>
    </>
  );
  return colored ? (
    <span className="rank-colored" style={rankVars(n)}>
      {text}
    </span>
  ) : (
    text
  );
}

// Highest points the player has ever had per board, with the date (hover) it was reached.
function PeakPoints({ peak }) {
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
        <span className={prog.current ? "is-role" : undefined} style={{ width: `${Math.min(100, prog.percent)}%`, "--role": prog.current?.color || "var(--text-muted)" }} />
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

// A number with its label; with `to`, a link (e.g. a rank to its leaderboard).
function Stat({ value, label, children, to }) {
  const body = (
    <>
      <span className="stat-value num">{value}</span>
      <span className="stat-label">{label}</span>
    </>
  );
  return (
    <div className="stat">
      {to ? (
        <Link to={to} className="stat-link" title={`See the ${typeof label === "string" ? label.toLowerCase() : ""} leaderboard`}>
          {body}
        </Link>
      ) : (
        body
      )}
      {children}
    </div>
  );
}

const RECENT_MS = 7 * 24 * 3600 * 1000;

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
      {entry?.timestamp && (
        // Green while it's recent (the past week), grey after.
        <span className={`stat-when ${green && Date.now() - parseTimestamp(entry.timestamp).getTime() < RECENT_MS ? "green" : "muted"}`} title={formatDateTime(entry.timestamp)}>
          {timeAgo(entry.timestamp)}
        </span>
      )}
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
      <Avatar src={player.avatar} name={player.name} size={138} className="pf-avatar" />
      {/* Bottom row (name, badges, country; links) first in the markup; shown under the top row. */}
      <div className="pf-head-main">
        <div className="pf-head-bottom">
          <div className="pf-identity">
            <div className="pf-name-row">
              <h1 className={`pf-name${role ? " has-role" : ""}`} style={role ? { "--role": role.color } : undefined} title={role ? (role.fromPeak ? `${role.name} (reached at peak points, kept for good)` : `${role.name} (from points)`) : undefined}>
                {player.name}
                {role && <img className="pf-role-icon" src={roleIcon(role)} alt={role.name} />}
              </h1>
              {/* All badges together, beside the name. */}
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
            </div>
            {player.country && (
              <div className="pf-country">
                <Flag code={player.country} height={22} />
                {countryName(player.country)}
              </div>
            )}
          </div>
          <div className="pf-links">
            {links.map(({ href, icon: Icon, label, className }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className={`pf-link ${className}`} aria-label={label} title={label}>
                <Icon size={32} />
              </a>
            ))}
          </div>
        </div>
        <div className="pf-head-top">
          <div className="pf-actions">
            <FollowButton player={player} />
            <CompareLink player={player} />
          </div>
          {/* Staff only, after follow / compare. */}
          <div className="pf-staff-tools">
            <RoleControl player={player} />
            <FreezeControl player={player} />
            <BanControl player={player} />
            <DisplayControl player={player} />
          </div>
        </div>
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
  const [country, setCountry] = useState(player.country ? String(countryIdByCode(player.country) ?? "") : "");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, error: null });
  if (!isStaff(user) || !(user.role === "moderator" || user.role === "admin")) return null;
  const saveCountry = async () => {
    setState({ busy: true, error: null });
    try {
      await adminSetCountry(player.profileNumber, country ? Number(country) : null, reason.trim() || undefined);
      setState({ busy: false, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
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
  if (!open) {
    const locked = player.nameLocked || player.avatarLocked;
    const label = `Edit name & picture${locked ? " (set by staff)" : ""}`;
    return (
      <button type="button" className={`pf-icon-button pf-edit-button${locked ? " is-locked" : ""}`} onClick={() => setOpen(true)} title={label} aria-label={label}>
        <EditIcon />
      </button>
    );
  }
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
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" className="pf-country-select">
          <option value="">No country</option>
          {COUNTRY_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="pf-admin-button" disabled={state.busy} onClick={saveCountry}>
          Set country
        </button>
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
    <Link to={to} className="pf-icon-button" title={me ? "Compare your times with this player" : "Compare this player with someone"} aria-label="Compare">
      <SwapIcon />
    </Link>
  );
}

function FollowButton({ player }) {
  const { isFollowing, toggleFollow } = useFollows();
  const following = isFollowing(player.profileNumber);
  return (
    <button
      type="button"
      className={`pf-icon-button${following ? " is-following" : ""}`}
      onClick={() => toggleFollow(player)}
      aria-pressed={following}
      aria-label="Follow"
      title={following ? "Following: click to stop (saved in this browser)" : "Follow this player's runs on Score Updates (saved in this browser)"}
    >
      {following ? <StarIcon /> : <StarOutlineIcon />}
    </button>
  );
}

const SERIES = [
  { key: "sp", label: "Singleplayer", color: "var(--series-sp)" },
  { key: "coop", label: "Cooperative", color: "var(--series-coop)" },
  { key: "overall", label: "Overall", color: "var(--series-overall)" },
];

// Points over time as they really were: ranks are recomputed against everyone's best times at
// each date, so being passed shows as a drop (see fetchPointsHistory in api/client). Scroll over
// it to zoom; click a day to see the profile as it was then. Each board's peak is marked.
const dayMs = (date) => Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);

function PointsChart({ profileNumber, fallback, peak, at, onPick }) {
  const [hidden, setHidden] = useState({});
  const version = useDataVersion();
  const history = useApi(() => fetchPointsHistory(profileNumber, fallback), [profileNumber, version]);
  // The samples plus each board's peak (the samples are weekly and can miss the peak day).
  const all = useMemo(() => {
    const rows = (history.data || []).map((d) => ({ ...d, t: dayMs(d.date) }));
    if (rows.length < 2) return rows;
    const extra = SERIES.filter((s) => peak?.[s.key]?.date && peak[s.key].points > 0).map((s) => ({
      date: String(peak[s.key].date).slice(0, 10),
      t: dayMs(peak[s.key].date),
      [s.key]: Math.round(peak[s.key].points),
      peakOf: s.key,
    }));
    return [...rows, ...extra].sort((a, b) => a.t - b.t);
  }, [history.data, peak]);
  const full = all.length ? [all[0].t, all[all.length - 1].t] : null;
  const [zoom, zoomRef, resetZoom] = useWheelZoom(full, { left: 10, right: 10, minSpan: 14 * 24 * 3600 * 1000 });
  if (history.loading && !history.data) return <div className="pf-chart-empty muted">Loading points history…</div>;
  if (all.length < 2) return <div className="pf-chart-empty muted">Not enough submissions for a points history yet.</div>;
  const [from, to] = zoom || full;
  // What's in view, plus the samples either side so the lines run to the edges.
  const first = Math.max(0, all.findIndex((d) => d.t >= from) - 1);
  let lastIn = all.length - 1;
  while (lastIn > 0 && all[lastIn].t > to) lastIn -= 1;
  const data = all.slice(first, Math.min(all.length, lastIn + 2));
  // Height: the whole history shares one scale from 0 (totals compare). Zoomed in, each line gets
  // its own scale fitted to what's in view, so its rises and drops show (hover gives the points).
  const inView = data.filter((d) => d.t >= from && d.t <= to);
  const domainFor = (key) => {
    if (!zoom) return [0, "dataMax"];
    const values = (inView.length ? inView : data).map((d) => d[key]).filter((v) => v != null);
    if (!values.length) return [0, "dataMax"];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(3, (hi - lo) * 0.15);
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
  };
  const axisFor = (key) => (zoom ? key : "shared");
  const atMs = at ? dayMs(at) : null;
  const pick = (state) => {
    const d = state?.activePayload?.[0]?.payload;
    if (d?.date) onPick?.(String(d.date).slice(0, 10));
  };
  return (
    <div className="pf-chart">
      {zoom && (
        <button type="button" className="pf-chart-reset" onClick={resetZoom}>
          Reset zoom
        </button>
      )}
      <div ref={zoomRef} className="pf-chart-plot" title="Scroll to zoom · click a day to see the profile as it was then">
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 22, right: 10, bottom: 0, left: 10 }} onClick={pick}>
            <XAxis dataKey="t" type="number" domain={[from, to]} allowDataOverflow hide />
            {zoom ? (
              SERIES.map((s) => <YAxis key={s.key} yAxisId={s.key} hide domain={domainFor(s.key)} allowDataOverflow />)
            ) : (
              <YAxis yAxisId="shared" hide domain={[0, "dataMax"]} />
            )}
            <Tooltip
              isAnimationActive={false}
              contentStyle={{ background: "var(--menu)", border: "1px solid var(--border)", borderRadius: 4 }}
              labelStyle={{ color: "var(--text-2)" }}
              labelFormatter={(t, items) => {
                const d = items?.[0]?.payload;
                return `${formatDate(d?.date || new Date(t).toISOString().slice(0, 10))}${d?.peakOf ? " · peak" : ""}`;
              }}
              formatter={(v, name) => [`${v} pts`, name]}
            />
            {atMs != null && atMs >= from && atMs <= to && <ReferenceLine x={atMs} yAxisId={zoom ? "overall" : "shared"} stroke="var(--accent)" strokeDasharray="4 3" />}
            {SERIES.filter((s) => !hidden[s.key]).map((s) => (
              <Line key={s.key} yAxisId={axisFor(s.key)} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            ))}
            {SERIES.filter((s) => !hidden[s.key] && peak?.[s.key]?.date).map((s) => {
              const t = dayMs(peak[s.key].date);
              if (t < from || t > to) return null;
              return (
                <ReferenceDot
                  yAxisId={axisFor(s.key)}
                  key={`peak-${s.key}`}
                  x={t}
                  y={Math.round(peak[s.key].points)}
                  r={4}
                  fill={s.color}
                  stroke="var(--panel)"
                  strokeWidth={2}
                  label={{ value: `Peak ${Math.round(peak[s.key].points)}`, position: "top", fill: "var(--text-2)", fontSize: 11 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
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
