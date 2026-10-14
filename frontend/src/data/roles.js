// Community roles with a points requirement, lowest first, from the role manager's official list
// (github.com/p2sr/role-manager, official-roles-25-10-28.json5). Each board's threshold is one
// way to qualify; roles also have other requirements (speedrun.com ranks and times, and Legends
// is granted by hand), which these bars don't cover. Roles without a threshold for a board skip it.
// Colours are the community's role colours (from the boards planning notes).
export const POINT_ROLES = [
  { name: "Beginner", color: "#fefa8d", sp: 250, coop: 1000 },
  { name: "Amateur", color: "#92d8a3", sp: 1500, coop: 2000 },
  { name: "Intermediate", color: "#2a806a", sp: 3000, coop: 3000 },
  { name: "Advanced", color: "#ffb200", sp: 5000, coop: 4500 },
  { name: "Expert", color: "#cd01ec", sp: 7000, coop: 6000, overall: 12500 },
  { name: "Professional", color: "#73faff", sp: 10000, coop: 8000, overall: 17250 },
  { name: "Elite", color: "#ee362e", sp: 11500, coop: 9300, overall: 20300 },
  { name: "Legends", color: "#0074d9", sp: 11700, coop: 9450, overall: 21000 },
];

// The role's icon (public/roles/<name>.png).
export function roleIcon(role) {
  return role ? `${process.env.PUBLIC_URL || ""}/roles/${role.name.toLowerCase()}.png` : null;
}

// The highest role a player's points qualify for: any one board meeting a role's threshold is
// enough (each threshold is an alternative requirement). Null below Beginner. Legends can't be
// lost: `keptLegends` (the server's record that their peak reached it) or a peak (`{ sp: { points },
// ... }`, from /profile/points_peak) that ever reached it keeps it.
export function playerRole(points = {}, peak = null, keptLegends = false) {
  const legends = POINT_ROLES[POINT_ROLES.length - 1];
  if (keptLegends || (peak && ["sp", "coop", "overall"].some((b) => legends[b] != null && (peak[b]?.points || 0) >= legends[b]))) {
    const now = ["sp", "coop", "overall"].some((b) => legends[b] != null && (points[b] || 0) >= legends[b]);
    return now ? legends : { ...legends, fromPeak: true };
  }
  for (let i = POINT_ROLES.length - 1; i >= 0; i--) {
    const role = POINT_ROLES[i];
    if (["sp", "coop", "overall"].some((b) => role[b] != null && (points[b] || 0) >= role[b])) return role;
  }
  return null;
}

// Progress on a board (`sp`, `coop` or `overall`) toward the next role: { next, target, missing,
// percent, current } or, past the highest threshold, { reached, percent: 100, current }.
// `current` is the highest role already reached on this board (null below the first).
export function roleProgress(board, points) {
  const steps = POINT_ROLES.filter((r) => r[board] != null);
  const current = [...steps].reverse().find((r) => points >= r[board]) || null;
  const next = steps.find((r) => points < r[board]);
  if (!next) return { reached: steps[steps.length - 1]?.name, percent: 100, current };
  const target = next[board];
  return { next: next.name, target, missing: Math.ceil(target - points), percent: Math.floor((points / target) * 100), current };
}
