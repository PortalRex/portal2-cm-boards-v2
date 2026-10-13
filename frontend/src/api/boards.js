// Game-aware entry points used by the pages. Both games are served by the v2 API.
import * as api from "./client";

export const fetchPreviews = (mode) => api.fetchMapPreviews(mode);

export const fetchBoard = (map) => api.fetchMapBoard(map);

export const fetchWrHistory = (map) => api.fetchWrHistory(map);

export const fetchMapChangelog = (map, filters = {}) => api.fetchChangelog({ ...filters, mapId: map.id, game: map.game });

// kind: overall | sp | coop for Portal 2; story | advanced | mel-overall for Mel.
export const fetchAggregatedBoard = (_game, kind) => api.fetchAggregated(kind);

export const fetchChangelogFor = (game, params) => api.fetchChangelog({ ...params, game });

// Latest runs (both games) of the followed players, newest first.
export async function fetchFollowingFeed(follows, count = 8) {
  const lists = await Promise.all(
    follows.slice(0, 20).flatMap((p) =>
      ["portal2", "mel"].map((game) => api.fetchChangelog({ profileNumber: p.profileNumber, limit: count, game }).catch(() => [])),
    ),
  );
  return lists
    .flat()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, count);
}
