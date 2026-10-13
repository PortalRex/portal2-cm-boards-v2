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
