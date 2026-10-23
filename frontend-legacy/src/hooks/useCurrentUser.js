import { useEffect, useState } from "react";
import { fetchMe } from "../api/client";
import { offlineSources, onOfflineChange } from "../api/http";
import { PLAYERS } from "../api/mock";

// The signed-in user ({ profileNumber, name, avatar, admin, banned }) or null. Loaded once
// from /auth/me and shared; signing out clears it everywhere. With the API offline (sample
// data) the first sample player stands in so the signed-in UI can still be developed.
let current; // undefined until loaded
let pending = null;
const listeners = new Set();

function publish(user) {
  current = user;
  listeners.forEach((fn) => fn(user));
}

export function reloadCurrentUser() {
  pending = fetchMe()
    .then(publish)
    .catch(() => publish(null))
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function clearCurrentUser() {
  publish(null);
}

// Staff can view the site as a regular player (saved in this browser): the user is then given
// without a role, so every staff tool and link is hidden; `staffRole` keeps the real one for
// the switch in Settings. The server still allows what the role allows.
const VIEW_KEY = "p2cm.viewAsPlayer";
let viewAsPlayer = (() => {
  try {
    return localStorage.getItem(VIEW_KEY) === "1";
  } catch {
    return false;
  }
})();
const viewListeners = new Set();

export function setViewAsPlayer(on) {
  viewAsPlayer = on;
  try {
    if (on) localStorage.setItem(VIEW_KEY, "1");
    else localStorage.removeItem(VIEW_KEY);
  } catch {
    // Not saved; it still applies until the page is reloaded.
  }
  viewListeners.forEach((fn) => fn(on));
}

const asViewed = (user, asPlayer) => (asPlayer && user?.role ? { ...user, role: null, staffRole: user.role } : user);

export const ROLE_LABELS = { verifier: "Verifier", moderator: "Moderator", admin: "Admin" };

// Staff (any tier: verifier, moderator, admin) can use the staff tools; admins also manage roles.
export const isStaff = (user) => Boolean(user?.role) && !user.sample && !user.banned;
export const isRoleAdmin = (user) => isStaff(user) && user.role === "admin";

export default function useCurrentUser() {
  const [user, setUser] = useState(current ?? null);
  const [offline, setOffline] = useState(offlineSources());
  const [asPlayer, setAsPlayer] = useState(viewAsPlayer);
  useEffect(() => onOfflineChange(setOffline), []);
  useEffect(() => {
    viewListeners.add(setAsPlayer);
    return () => viewListeners.delete(setAsPlayer);
  }, []);
  useEffect(() => {
    listeners.add(setUser);
    if (current === undefined && !pending) reloadCurrentUser();
    return () => listeners.delete(setUser);
  }, []);
  if (offline.length && !user) return { ...PLAYERS[0], admin: 0, sample: true };
  return asViewed(user, asPlayer);
}
