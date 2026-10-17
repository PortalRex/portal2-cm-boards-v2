import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { GAMES } from "../data/maps";
import portal2Logo from "../scenes/global/img/portal2logo.png";
import melLogo from "../scenes/global/img/psmcm.png";
import melBackground from "../scenes/global/img/MelBackground.png";

// The game the site shows (Score Updates, the map list, Aggregate, Stats, Compare, profiles),
// picked under the P2CM logo in the header and saved in this browser. A page's address can name
// the game instead (a ?game= link, a Mel board or map), and then wins: shared links open on
// their game, and the header follows them.
const KEY = "p2cm.game";
const listeners = new Set();

// Games only: a season belongs to its game (picked on the game's pages).
const baseGame = (id) => {
  const g = GAMES[id];
  if (!g) return null;
  return g.kind === "season" ? (GAMES[g.base] ? g.base : null) : id;
};

let stored = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

export function setGame(id) {
  stored = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not saved; it still applies until the page is reloaded.
  }
  listeners.forEach((fn) => fn(id));
}

// The game a page's address belongs to, if it names one.
export function gameFromLocation(pathname, search) {
  const param = baseGame(new URLSearchParams(search).get("game"));
  if (param) return param;
  if (pathname.startsWith("/leaderboard/mel")) return "mel";
  const custom = pathname.match(/^\/leaderboard\/game\/([^/]+)/);
  if (custom) return baseGame(custom[1]);
  if (pathname.startsWith("/leaderboard/")) return "portal2";
  const map = pathname.match(/^\/map\/([^/]+)\//);
  if (map) {
    const g = Object.values(GAMES).find((x) => x.modes.includes(map[1]));
    return g ? baseGame(g.id) : null;
  }
  return null;
}

// Games to pick from (no seasons, no hidden games).
export const pickableGames = () => Object.values(GAMES).filter((g) => g.kind === "game" && !g.hidden);

// The site's own branding per game: the logo and name in the header, and the background for the
// pages that use the site-wide one (null: keep it). The games editor can replace each of them.
const BUILT_IN = { mel: { logo: melLogo, brand: "PSM:CM", background: melBackground } };
export const builtInBranding = (id) => ({ logo: BUILT_IN[id]?.logo || portal2Logo, brand: BUILT_IN[id]?.brand || "P2CM", background: BUILT_IN[id]?.background || null });
export const gameLogo = (id) => GAMES[id]?.logo || builtInBranding(id).logo;
export const gameBrand = (id) => GAMES[id]?.shortName || builtInBranding(id).brand;
export const gameBackground = (id) => GAMES[id]?.background || builtInBranding(id).background;

// A game's aggregated boards (built-in games keep their old addresses).
const BOARD_BASE = { portal2: "/leaderboard", mel: "/leaderboard/mel" };
export const gameBoardPath = (game, board) => (BOARD_BASE[game] ? `${BOARD_BASE[game]}/${board}` : `/leaderboard/game/${game}/${board}`);
export const gameBoardsPath = (game) => gameBoardPath(game, "overall");

export default function useGame() {
  const { pathname, search } = useLocation();
  const [picked, setPicked] = useState(stored);
  useEffect(() => {
    listeners.add(setPicked);
    return () => listeners.delete(setPicked);
  }, []);
  const fromAddress = gameFromLocation(pathname, search);
  // Remember the address's game, so the next page without one stays on it.
  useEffect(() => {
    if (fromAddress && fromAddress !== stored) setGame(fromAddress);
  }, [fromAddress]);
  return fromAddress || baseGame(picked) || "portal2";
}
