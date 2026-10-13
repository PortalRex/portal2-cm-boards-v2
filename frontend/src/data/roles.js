// Community roles with a points requirement, lowest first, from the role manager's official list
// (github.com/p2sr/role-manager, official-roles-25-10-28.json5). Each board's threshold is one
// way to qualify; roles also have other requirements (speedrun.com ranks and times, and Legends
// is granted by hand), which these bars don't cover. Roles without a threshold for a board skip it.
export const POINT_ROLES = [
  { name: "Beginner", sp: 250, coop: 1000 },
  { name: "Amateur", sp: 1500, coop: 2000 },
  { name: "Intermediate", sp: 3000, coop: 3000 },
  { name: "Advanced", sp: 5000, coop: 4500 },
  { name: "Expert", sp: 7000, coop: 6000, overall: 12500 },
  { name: "Professional", sp: 10000, coop: 8000, overall: 17250 },
  { name: "Elite", sp: 11500, coop: 9300, overall: 20300 },
  { name: "Legends", sp: 11700, coop: 9450, overall: 21000 },
];

// Progress on a board (`sp`, `coop` or `overall`) toward the next role: { next, target, missing,
// percent } or, past the highest threshold, { reached, percent: 100 }.
export function roleProgress(board, points) {
  const steps = POINT_ROLES.filter((r) => r[board] != null);
  const next = steps.find((r) => points < r[board]);
  if (!next) return { reached: steps[steps.length - 1]?.name, percent: 100 };
  const target = next[board];
  return { next: next.name, target, missing: Math.ceil(target - points), percent: Math.floor((points / target) * 100) };
}
