// Seasons as a choice on their base game's pages (?season=<key>) rather than games of their own.
// A season is still its own game in the catalog: its boards are "<season>-<mode>" and its maps
// copies of the base game's (`sourceId`), so these helpers translate between the two.
import { useSearchParams } from "react-router-dom";
import { GAMES, getMap, mapPath, mapsForGame } from "./maps";

const startOf = (g) => (g.startsAt ? new Date(`${g.startsAt}Z`).getTime() : 0);
const endOf = (g) => (g.endsAt ? new Date(`${g.endsAt}Z`).getTime() : Infinity);

export const isSeason = (key) => GAMES[key]?.kind === "season";

// Running now.
export const isLive = (g, now = Date.now()) => Boolean(g?.startsAt) && startOf(g) <= now && endOf(g) > now;

// A game's seasons, newest first. Hidden ones only reach staff (the catalog leaves them out
// for everyone else) and are marked.
export const seasonsOf = (base) =>
  Object.values(GAMES)
    .filter((g) => g.kind === "season" && g.base === base)
    .sort((a, b) => startOf(b) - startOf(a));

// The season running now (else the latest one) of any game, for "Current season" links.
export function currentSeason(base = null) {
  const seasons = Object.values(GAMES).filter((g) => g.kind === "season" && !g.hidden && (!base || g.base === base));
  const byStart = (a, b) => startOf(b) - startOf(a);
  return seasons.filter((g) => isLive(g)).sort(byStart)[0] || seasons.sort(byStart)[0] || null;
}

// The season picked on a page of `base` (?season=), if it's one of that game's seasons.
export function useSeason(base) {
  const [params] = useSearchParams();
  const key = params.get("season");
  return key && GAMES[key]?.kind === "season" && GAMES[key].base === base ? key : null;
}

// A board key without its game prefix: "season-1-sp" -> "sp" (built-in games' keys are bare).
export const modeOf = (game, board) => (board.startsWith(`${game}-`) ? board.slice(game.length + 1) : board);

// The season's board for one of its base game's boards ("overall" stays), or null if it has none.
export function seasonBoard(season, base, baseBoard) {
  if (baseBoard === "overall") return "overall";
  const key = `${season}-${modeOf(base, baseBoard)}`;
  return GAMES[season]?.modes.includes(key) ? key : null;
}

// The base game's board for one of the season's ("season-1-sp" -> "sp", or "<game>-sp").
export function baseBoardOf(season, board) {
  const base = GAMES[season]?.base;
  if (!base || board === "overall") return board;
  const mode = modeOf(season, board);
  return GAMES[base]?.modes.find((m) => modeOf(base, m) === mode) || mode;
}

// The season's copy of a base map, and the base map of a season's copy.
export const seasonMap = (season, baseMapId) => mapsForGame(season).find((m) => m.sourceId === String(baseMapId)) || null;
export const baseMapOf = (map) => (map?.sourceId && GAMES[map.game]?.base ? getMap(map.sourceId, GAMES[map.game].base) : null);

// Adds (or with null removes) ?season= on a path, keeping its other parameters.
export function withSeason(path, season) {
  const [p, q = ""] = path.split("?");
  const params = new URLSearchParams(q);
  if (season) params.set("season", season);
  else params.delete("season");
  const s = params.toString();
  return s ? `${p}?${s}` : p;
}

// A map's page: a season's copy opens as its base map with the season picked.
export function mapLink(map) {
  const base = baseMapOf(map);
  return base ? withSeason(mapPath(base), map.game) : mapPath(map);
}

// Picker options: All-time, then the seasons (live ones tagged, hidden ones marked for staff).
export function seasonOptions(base) {
  const day = (ts) => String(ts).slice(0, 10);
  return [
    { value: "", label: "All-time" },
    ...seasonsOf(base).map((g) => ({
      value: g.id,
      label: `${g.label}${isLive(g) ? " · Live" : g.endsAt && endOf(g) < Date.now() ? ` · ended ${day(g.endsAt)}` : ""}${g.hidden ? " (hidden)" : ""}`,
    })),
  ];
}
