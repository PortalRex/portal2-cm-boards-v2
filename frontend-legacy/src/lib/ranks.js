// Rank number colours from the original board (Portal2Boards public/js/rank.js): a linear
// RGB blend across rank stops, pink for world records, grey past rank 500. "dark" is its
// dark-background scale, "light" the one for light backgrounds.
const TEXT_STOPS = [0, 10, 20, 50, 500];
const TEXT_SCALES = {
  dark: ["#ee82ee", "#add8e6", "#42ff42", "#ffa542", "#ff4242"],
  light: ["#9400d3", "#0000ff", "#006400", "#d67104", "#8b0000"],
};
export const WR_COLOR = "#d980ff";

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function blend(rank, colors) {
  const i = Math.max(0, TEXT_STOPS.findIndex((stop) => rank <= stop) - 1);
  const t = (rank - TEXT_STOPS[i]) / (TEXT_STOPS[i + 1] - TEXT_STOPS[i]);
  const [a, b] = [hexToRgb(colors[i]), hexToRgb(colors[i + 1])];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(", ")})`;
}

export function rankTextColor(rank, scale = "dark") {
  if (rank == null) return null;
  if (rank === 1) return WR_COLOR;
  if (rank > 500) return "#888888";
  return blend(rank, TEXT_SCALES[scale]);
}

// CSS variables carrying a rank's text colour for both themes; elements with the
// .rank-tint class use them for a tinted tile with the number in the rank colour.
export function rankVars(rank) {
  if (rank == null) return undefined;
  const r = Math.round(rank);
  return { "--rank-color": rankTextColor(r, "light"), "--rank-color-dark": rankTextColor(r, "dark") };
}

// The profile's rank tiles: a rainbow from the world record trophy's pink-purple, purple to
// rank 5, blue to 15, cyan to green by 40, then yellow and orange to red at rank 200 (red after
// that). Blended on a log scale between the stops, as ranks are closer together near the top.
const TILE_STOPS = [
  [1, 290],
  [5, 255],
  [15, 205],
  [40, 125],
  [75, 55],
  [125, 30],
  [200, 0],
];
function tileHue(rank) {
  const r = Math.min(Math.max(rank, 1), 200);
  const i = Math.max(0, TILE_STOPS.findIndex(([stop]) => r <= stop) - 1);
  const [[r0, h0], [r1, h1]] = [TILE_STOPS[i], TILE_STOPS[i + 1]];
  const t = (Math.log(r) - Math.log(r0)) / (Math.log(r1) - Math.log(r0));
  return h0 + (h1 - h0) * t;
}

// The same CSS variables as rankVars, from the rainbow (bright on dark, deeper on light). A world
// record is the trophy's own colour; the violets just after it are a little softer, as fully
// saturated violet glares next to the other hues.
export function rankTileVars(rank) {
  if (rank == null) return undefined;
  if (Math.round(rank) <= 1) return { "--rank-color": "var(--trophy)", "--rank-color-dark": "var(--trophy)" };
  const h = Math.round(tileHue(rank));
  const soften = Math.min(Math.max((h - 220) / 60, 0), 1);
  return { "--rank-color": `hsl(${h} ${Math.round(85 - 25 * soften)}% 34%)`, "--rank-color-dark": `hsl(${h} ${Math.round(90 - 25 * soften)}% ${Math.round(66 + 4 * soften)}%)` };
}
