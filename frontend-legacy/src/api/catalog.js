// Loads the game catalog (games, seasons, chapters, maps) from the server before the app
// renders. Without it (API offline or sample data) the built-in Portal 2 / Mel lists are used.
import { applyCatalog, gameKey } from "../data/maps";
import { API_BASE, FORCE_MOCK, GAME_IDS } from "./config";

const TIMEOUT_MS = 4000;

export async function loadCatalog() {
  if (FORCE_MOCK) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(new URL(`${API_BASE}/catalog`, window.location.origin), { signal: controller.signal });
    if (!res.ok) return;
    const catalog = await res.json();
    applyCatalog(catalog);
    catalog.forEach((g) => {
      GAME_IDS[gameKey(g)] = g.id;
    });
  } catch {
    // Keep the built-in lists.
  } finally {
    clearTimeout(timer);
  }
}
