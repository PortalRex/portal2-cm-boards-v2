// Shared request helpers and per-source "using sample data" tracking.
import { FORCE_MOCK } from "./config";

const listeners = new Set();
const offline = new Set(FORCE_MOCK ? ["api"] : []);

// Sources currently served from sample data (only "api" today).
export const offlineSources = () => [...offline];
export function onOfflineChange(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function markOffline(source) {
  if (!offline.has(source)) {
    offline.add(source);
    listeners.forEach((fn) => fn([...offline]));
  }
}

export async function getJson(base, path, params) {
  const url = new URL(base + path, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => v != null && v !== "" && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.pathname}`);
  return res.json();
}

// Runs the live request, falling back to sample data when that source is down.
export async function withFallback(source, live, sample) {
  if (FORCE_MOCK) return sample();
  try {
    return await live();
  } catch (err) {
    console.warn(`[api:${source}] falling back to sample data:`, err.message);
    markOffline(source);
    return sample();
  }
}
