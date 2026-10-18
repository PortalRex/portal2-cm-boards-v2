// Autorender (https://github.com/p2sr/autorender): rendered videos of board runs. The SAR
// segments ("mtriggers") it reads from demos are imported into the boards' database
// (db/dbscript/import_autorender.py) and served by our API, see fetchSegments in ./client.
import { AUTORENDER, AUTORENDER_STORAGE } from "./config";

// BoardSource enum in autorender src/shared/models.ts.
const BOARD_SOURCE = { portal2: 1, mel: 2 };
const TICKS_PER_SECOND = 60;

export const renderRequestUrl = (game, changelogId) => `${AUTORENDER}/render/${game === "mel" ? "mel" : "portal2"}/${changelogId}`;

// Playback and page links for a rendered video, from its share id. Videos rendered before
// July 2026 sit in object storage as {share_id}.mp4; newer ones are served by autorender
// itself. Neither URL works for the other kind, so players get both, in that order.
export function videoLinks(shareId) {
  const sources = [`${AUTORENDER_STORAGE}/${shareId}.mp4`, `${AUTORENDER}/storage/videos/${shareId}`];
  return { src: sources[0], sources, page: `${AUTORENDER}/videos/${shareId}` };
}

// Share ids of rendered Portal 2 runs, by changelog id. Mel runs carry their share
// id (changelog.autorender_id) already. autorender only offers an existence check
// for Portal 2, then /video/{id}/video redirects to /storage/videos/{share_id}.
const shareIdCache = new Map();

async function resolveShareId(game, changelogId) {
  const res = await fetch(`${AUTORENDER}/api/v1/video/${changelogId}/video?source=${BOARD_SOURCE[game]}`, { method: "HEAD" });
  const match = res.url.match(/\/videos\/([\w-]{11})(?:$|[?#])/);
  return match ? match[1] : null;
}

export async function fetchShareIds(changelogIds, game = "portal2") {
  const ids = [...new Set(changelogIds.filter((id) => id != null).map(Number))];
  const unknown = ids.filter((id) => !shareIdCache.has(id));
  if (unknown.length && game === "portal2") {
    const res = await fetch(`${AUTORENDER}/api/v1/check-videos-exist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unknown }),
    });
    if (!res.ok) throw new Error(`autorender ${res.status}`);
    const { ids: found } = await res.json();
    const foundSet = new Set(found);
    unknown.filter((id) => !foundSet.has(id)).forEach((id) => shareIdCache.set(id, null));
    await Promise.all(
      found.map(async (id) => shareIdCache.set(id, await resolveShareId(game, id).catch(() => null))),
    );
  }
  return new Map(ids.filter((id) => shareIdCache.get(id)).map((id) => [id, shareIdCache.get(id)]));
}

const stripMapPrefix = (name, mapTitle) => {
  const prefix = `${mapTitle} - `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
};

// Display rows for a run's mtrigger segments ([{ name, ticks, splits }] as stored on the
// changelog): [{ name, seconds, ticks, total, totalTicks, splits }].
export function formatSegments(segments, mapTitle) {
  if (!segments?.length) return null;
  let totalTicks = 0;
  return segments.map((s) => {
    totalTicks += s.ticks;
    return {
      name: stripMapPrefix(s.name, mapTitle),
      ticks: s.ticks,
      seconds: s.ticks / TICKS_PER_SECOND,
      totalTicks,
      total: totalTicks / TICKS_PER_SECOND,
      splits: s.splits?.length > 1 ? s.splits.map((sp) => ({ name: stripMapPrefix(sp.name, mapTitle), ticks: sp.ticks })) : [],
    };
  });
}
