import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import logo from "../scenes/global/img/portal2logo.png";
import {
  HistoryIcon, PinIcon, BarsIcon, MoreIcon, TrophyIcon, PersonIcon, PeopleIcon, MenuIcon, CloseIcon, LightModeIcon, DarkModeIcon, SteamIcon, UploadIcon,
  DiscordIcon, GitHubIcon, DonateIcon, CompareIcon, GavelIcon, InfoIcon,
} from "./Icons";
import { Avatar, Flag } from "./ui";
import { GAMES } from "../data/maps";
import useCurrentUser, { clearCurrentUser, isStaff } from "../hooks/useCurrentUser";
import { logout, steamLoginUrl } from "../api/client";
import useTheme from "../hooks/useTheme";
import SubmitRun from "./SubmitRun";
import "./TopBar.css";

const LEADERBOARD_MENU = [
  { to: "/leaderboard/overall", label: "Overall", icon: BarsIcon },
  { to: "/leaderboard/sp", label: "Single Player", icon: PersonIcon },
  { to: "/leaderboard/coop", label: "Cooperative", icon: PeopleIcon },
];

// Seasons and added games come from the catalog, ahead of the built-in boards.
const leaderboardMenu = () => [
  ...Object.values(GAMES)
    .filter((g) => g.kind === "season" && !g.hidden)
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    .map((g) => ({ to: `/leaderboard/game/${g.id}/overall`, label: g.label, icon: TrophyIcon, highlight: true })),
  ...Object.values(GAMES)
    .filter((g) => g.kind === "game" && g.id !== "portal2" && g.id !== "mel" && !g.hidden)
    .map((g) => ({ to: `/leaderboard/game/${g.id}/overall`, label: g.label, icon: BarsIcon })),
  ...LEADERBOARD_MENU,
];

const MORE_MENU = [
  { to: "/more/discord", label: "Discord", icon: DiscordIcon },
  { href: "https://github.com/p2sr/portal2-cm-boards-v2", label: "GitHub", icon: GitHubIcon },
  { to: "/more/donators", label: "Donators", icon: DonateIcon },
  { to: "/compare", label: "Compare Players", icon: CompareIcon },
  { to: "/more/wall-of-shame", label: "Wall Of Shame", icon: GavelIcon },
  { to: "/more/about", label: "About", icon: InfoIcon },
];

const NAV = [
  { to: "/", label: "Score Updates", icon: HistoryIcon, end: true },
  { to: "/maps", label: "Leaderboard", icon: PinIcon, match: ["/maps", "/map/"] },
  { to: "/leaderboard/overall", label: "Aggregate", icon: BarsIcon, menu: "leaderboard", match: ["/leaderboard"] },
  { to: "/more/about", label: "More", icon: MoreIcon, menu: MORE_MENU, match: ["/more"] },
];

function MenuItem({ item }) {
  const Icon = item.icon || BarsIcon;
  const body = (
    <>
      <Icon className="menu-item-icon" />
      <span>{item.label}</span>
    </>
  );
  const className = `menu-item${item.highlight ? " is-highlight" : ""}`;
  return item.href ? (
    <a className={className} href={item.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <Link className={className} to={item.to}>
      {body}
    </Link>
  );
}

function NavItem({ item, pathname }) {
  const Icon = item.icon;
  const active = item.end ? pathname === item.to : (item.match || [item.to]).some((m) => pathname.startsWith(m));
  return (
    <li className={`nav-item${item.menu ? " has-menu" : ""}`}>
      <NavLink to={item.to} className={`nav-link${active ? " is-active" : ""}`} end={item.end}>
        <Icon className="nav-icon" />
        <span>{item.label}</span>
      </NavLink>
      {item.menu && (
        <div className="nav-menu" role="menu">
          {(item.menu === "leaderboard" ? leaderboardMenu() : item.menu).map((m) => (
            <MenuItem key={m.label} item={m} />
          ))}
        </div>
      )}
    </li>
  );
}

function ProfileMenu({ user, pathname, search }) {
  if (!user) {
    return (
      <a className="sign-in" href={steamLoginUrl(pathname + search)} title="Sign in through Steam">
        <SteamIcon size={20} /> <span className="sign-in-label">Sign in</span>
      </a>
    );
  }
  const signOut = async () => {
    await logout().catch(() => {});
    clearCurrentUser();
  };
  return (
    <div className="profile-menu">
      <Link to={`/profile/${user.profileNumber}`} className="profile-menu-trigger" aria-label="Your profile">
        <Avatar src={user.avatar} name={user.name} size={48} className="topbar-avatar" />
      </Link>
      <div className="profile-hover" role="menu">
        <div className="profile-hover-banner" style={{ backgroundImage: user.avatar ? `url("${user.avatar}")` : undefined }} />
        <span className="profile-hover-name">{user.name}</span>
        <Link to={`/profile/${user.profileNumber}`}>My Profile</Link>
        <Link to="/more/settings">Settings</Link>
        {isStaff(user) && <Link to="/admin">Staff</Link>}
        <button type="button" onClick={signOut} disabled={user.sample} title={user.sample ? "Sample data: not signed in" : undefined}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function TopBar() {
  const { pathname, search } = useLocation();
  const user = useCurrentUser();
  const signinFailed = new URLSearchParams(search).get("signin") === "failed";
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className={`topbar${open ? " is-open" : ""}`}>
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="Portal 2 Challenge Mode boards home">
          <img src={logo} alt="" />
          <span>P2CM</span>
        </Link>

        <nav className="topbar-nav" aria-label="Main">
          <ul>
            {NAV.map((item) => (
              <NavItem key={item.label} item={item} pathname={pathname} />
            ))}
          </ul>
        </nav>

        <div className="topbar-user">
          {user && !user.sample && (
            <button type="button" className="submit-run-button" onClick={() => setSubmitting(true)} title="Submit a run">
              <UploadIcon />
              <span>SUBMIT RUN</span>
            </button>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Dark theme" : "Light theme"}
          >
            {theme === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </button>
          <ProfileMenu user={user} pathname={pathname} search={search.replace(/[?&]signin=failed/, "")} />
          {user?.country && <Flag code={user.country} height={30} />}
          <button type="button" className="menu-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {signinFailed && (
        <div className="signin-failed" role="alert">
          Steam sign-in didn’t complete. Please try again.
        </div>
      )}
      {submitting && user && <SubmitRun user={user} onClose={() => setSubmitting(false)} />}
    </header>
  );
}
