import { useEffect, useState } from "react";

// Co-op players are shown blue (the host) first, orange second. Runs carry `players` in that
// order plus `rolesKnown`; when nobody knows who hosted, rows use a neutral tint.
// Admin role edits made on this page are kept here so every row showing the run updates.
const overrides = new Map(); // coopId -> host profile number, or null for unknown
const EVENT = "p2cm:coop-roles";

export function setRoleOverride(coopId, host) {
  overrides.set(coopId, host);
  window.dispatchEvent(new Event(EVENT));
}

export function useRoleOverrides() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, bump);
    return () => window.removeEventListener(EVENT, bump);
  }, []);
  return overrides;
}

// The run's players and whether their colours are known, after any admin edit.
export function coopRoles(run, overrideMap = overrides) {
  const players = run.players || [];
  if (run.coopId == null || !overrideMap.has(run.coopId)) return { players, rolesKnown: run.rolesKnown !== false };
  const host = overrideMap.get(run.coopId);
  if (host == null) return { players, rolesKnown: false };
  return { players: [...players].sort((a, b) => (b.profileNumber === host) - (a.profileNumber === host)), rolesKnown: true };
}

export const tintFor = (rolesKnown, index) => (rolesKnown ? (index === 0 ? "tint-blue" : "tint-orange") : "tint-neutral");
