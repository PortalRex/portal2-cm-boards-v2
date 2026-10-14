import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import logo from "../scenes/global/img/portal2logo.png";
import {
  HistoryIcon, PinIcon, BarsIcon, MoreIcon, TrophyIcon, PersonIcon, PeopleIcon, MenuIcon, CloseIcon, LightModeIcon, DarkModeIcon, SteamIcon, UploadIcon,
  DiscordIcon, GitHubIcon, DonateIcon, CompareIcon, GavelIcon, InfoIcon, StarIcon, TriangleRight, TriangleDown, GlobeIcon,
} from "./Icons";
import { Avatar, Flag } from "./ui";
import { GAMES, MODE_LABELS, chapterDbId, coopChapters, spChapters } from "../data/maps";
import useCurrentUser, { clearCurrentUser, isStaff } from "../hooks/useCurrentUser";
import { logout, steamLoginUrl } from "../api/client";
import useTheme from "../hooks/useTheme";
import { useDataVersion } from "../lib/dataVersion";
import SubmitRun from "./SubmitRun";
import "./TopBar.css";

// The Aggregate menu, like the old boards' but with a game level: game → board (Overall, a mode)
// → Total and each chapter (Portal 2's chapter boards). Seasons and added games come from the
// catalog, seasons first.
const chapterItems = (chapters) => chapters.map((c) => ({ number: c.number, label: c.name, to: `/leaderboard/chapter/${chapterDbId(c)}` }));
const aggregateMenu = () => [
  ...Object.values(GAMES)
    .filter((g) => g.kind === "season" && !g.hidden)
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    .map((g) => gameEntry(g, TrophyIcon, true)),
  {
    id: "portal2",
    label: "Portal 2",
    icon: BarsIcon,
    to: "/leaderboard/overall",
    boards: [
      { label: "Overall", icon: BarsIcon, to: "/leaderboard/overall" },
      { label: "Single Player", icon: PersonIcon, to: "/leaderboard/sp", chapters: chapterItems(spChapters) },
      { label: "Cooperative", icon: PeopleIcon, to: "/leaderboard/coop", chapters: chapterItems(coopChapters) },
    ],
  },
  {
    id: "mel",
    label: "Portal Stories: Mel",
    icon: BarsIcon,
    to: "/leaderboard/mel/overall",
    boards: [
      { label: "Overall", icon: BarsIcon, to: "/leaderboard/mel/overall" },
      { label: "Story Mode", icon: PersonIcon, to: "/leaderboard/mel/story" },
      { label: "Advanced Mode", icon: PersonIcon, to: "/leaderboard/mel/advanced" },
    ],
  },
  ...Object.values(GAMES)
    .filter((g) => g.kind === "game" && g.id !== "portal2" && g.id !== "mel" && !g.hidden)
    .map((g) => gameEntry(g, BarsIcon, false)),
];

function gameEntry(g, icon, highlight) {
  const base = `/leaderboard/game/${g.id}`;
  return {
    id: g.id,
    label: g.label,
    icon,
    highlight,
    to: `${base}/overall`,
    boards: [{ label: "Overall", icon: BarsIcon, to: `${base}/overall` }, ...g.modes.map((m) => ({ label: MODE_LABELS[m] || m, icon: BarsIcon, to: `${base}/${m}` }))],
  };
}

function MenuLink({ item, caret = false }) {
  const Icon = item.icon;
  return (
    <Link className={`menu-item${item.highlight ? " is-highlight" : ""}`} to={item.to}>
      {item.number != null ? <span className="menu-num num">{item.number}</span> : Icon ? <Icon className="menu-item-icon" /> : null}
      <span className="menu-label">{item.label}</span>
      {caret && (
        <span className="menu-caret">
          <TriangleRight size={10} />
        </span>
      )}
    </Link>
  );
}

// On phones (the menu under the hamburger) each game opens with its arrow; on wider screens the
// arrows are hidden and the games open on hover.
function ExpandButton({ open, onToggle, label, className }) {
  return (
    <button type="button" className={`${className}${open ? " is-open" : ""}`} aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${label}`} onClick={onToggle}>
      <TriangleDown size={12} />
    </button>
  );
}

function AggregateMenu() {
  const [open, setOpen] = useState({});
  // Re-read the games after an edit in the games editor (names, boards, new games).
  useDataVersion();
  return (
    <div className="nav-menu nav-menu-tree" role="menu">
      {aggregateMenu().map((game) => (
        <div className={`menu-group${open[game.id] ? " is-expanded" : ""}`} key={game.id}>
          <MenuLink item={game} caret />
          <ExpandButton className="menu-expand" open={Boolean(open[game.id])} label={game.label} onToggle={() => setOpen((o) => ({ ...o, [game.id]: !o[game.id] }))} />
          <div className="menu-sub">
            {game.boards.map((board) => (
              <div className="menu-group" key={board.to}>
                <MenuLink item={board} caret={Boolean(board.chapters)} />
                {board.chapters && (
                  <div className="menu-sub menu-sub-chapters">
                    <MenuLink item={{ label: "Total", icon: StarIcon, to: board.to }} />
                    {board.chapters.map((c) => (
                      <MenuLink key={c.to} item={c} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const MORE_MENU = [
  { href: "https://discord.gg/hRwE4Zr", label: "Discord", icon: DiscordIcon },
  { href: "https://github.com/p2sr/portal2-cm-boards-v2", label: "GitHub", icon: GitHubIcon },
  { to: "/more/donators", label: "Donators", icon: DonateIcon },
  { to: "/compare", label: "Compare Players", icon: CompareIcon },
  { to: "/more/countries", label: "Countries", icon: GlobeIcon },
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
  // Phones: a menu stays closed until its arrow is tapped.
  const [expanded, setExpanded] = useState(false);
  return (
    <li className={`nav-item${item.menu ? " has-menu" : ""}${expanded ? " is-expanded" : ""}`}>
      <NavLink to={item.to} className={`nav-link${active ? " is-active" : ""}`} end={item.end}>
        <Icon className="nav-icon" />
        <span>{item.label}</span>
      </NavLink>
      {item.menu && <ExpandButton className="nav-expand" open={expanded} label={item.label} onToggle={() => setExpanded((e) => !e)} />}
      {item.menu === "leaderboard" ? (
        <AggregateMenu />
      ) : (
        item.menu && (
          <div className="nav-menu" role="menu">
            {item.menu.map((m) => (
              <MenuItem key={m.label} item={m} />
            ))}
          </div>
        )
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
