// Full-game (speedrun.com-style) boards from the v2 API (/fullgame/...), with a small
// generated sample when the API is offline.
import { API_BASE } from "./config";
import { getJson, withFallback } from "./http";
import { PLAYERS } from "./mock";

const get = (path, params) => getJson(API_BASE, `/fullgame${path}`, params);
const sample = (live, fallback) => withFallback("api", live, fallback);

export function fetchFgGames() {
  return sample(() => get("/games"), () => [{ ...SAMPLE.game, categories: SAMPLE.categories }]);
}

export function fetchFgGame(slug) {
  return sample(() => get(`/games/${slug}`), () => ({ game: SAMPLE.game, categories: SAMPLE.categories, levels: SAMPLE.levels }));
}

// selected: { [variableId]: valueSlug }
export function fetchFgBoard({ game, category, level, selected = {}, obsolete = false }) {
  const params = { ...Object.fromEntries(Object.entries(selected).map(([id, slug]) => [`v${id}`, slug])), obsolete: obsolete ? "true" : undefined };
  return sample(
    () => get(`/board/${game}/${category}${level ? `/${level}` : ""}`, params),
    () => sampleBoard(category, level, selected, obsolete),
  );
}

export function fetchFgRun(id) {
  return sample(() => get(`/runs/${id}`), () => sampleRun(Number(id)));
}

export function fetchFgRunner(id) {
  return sample(() => get(`/runners/${id}`), () => sampleRunner(Number(id)));
}

// Milliseconds -> "1:02:03.456" / "2:03.456" / "3.456".
export function formatRunTime(ms) {
  if (ms == null) return "";
  const fraction = String(ms % 1000).padStart(3, "0");
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${fraction}`;
  if (m > 0) return `${m}:${pad(s)}.${fraction}`;
  return `${s}.${fraction}`;
}

// --- sample data ---------------------------------------------------------------

const SAMPLE = (() => {
  const game = { id: 1, slug: "portal-2", name: "Portal 2", sort: 0 };
  const cat = (id, slug, name, type, players, misc = false) => ({
    id, game_id: 1, slug, name, type, players, rules: "Sample rules. Full rules: rules.portal2.sr.", demo_rank: 10, video_required: false, miscellaneous: misc, sort: id,
  });
  const categories = [
    cat(1, "single-player", "Single Player", "full_game", 1),
    cat(2, "cooperative-game", "Cooperative Game", "full_game", 2),
    cat(3, "single-player-il", "Single Player IL", "per_level", 1),
  ];
  const levels = ["The Courtesy Call", "The Cold Boot", "The Return"].map((name, i) => ({ id: i + 1, game_id: 1, slug: `chapter-${i + 1}`, name: `Chapter ${i + 1} - ${name}`, sort: i }));
  const variables = [
    { id: 7, game_id: 1, category_id: 1, level_id: null, name: "Singleplayer Category", scope: "global", is_subcategory: true, mandatory: true, sort: 0, values: [{ id: 1, variable_id: 7, label: "No SLA", slug: "no-sla", sort: 0 }, { id: 2, variable_id: 7, label: "SLA", slug: "sla", sort: 1 }] },
    { id: 6, game_id: 1, category_id: null, level_id: null, name: "Quicksaves", scope: "full_game", is_subcategory: false, mandatory: false, sort: 1, values: [{ id: 3, variable_id: 6, label: "Yes", slug: "yes", sort: 0 }, { id: 4, variable_id: 6, label: "No", slug: "no", sort: 1 }] },
  ];
  const runners = PLAYERS.map((p, i) => ({ id: i + 1, name: p.name, profile_number: p.profileNumber, avatar: p.avatar }));
  const runs = [];
  let id = 1;
  for (const c of categories) {
    const lvls = c.type === "per_level" ? levels : [null];
    for (const l of lvls) {
      const subs = c.id === 1 ? variables[0].values : [null];
      for (const sub of subs) {
        const base = c.id === 2 ? 1_520_000 : c.type === "per_level" ? 180_000 : sub?.slug === "sla" ? 3_100_000 : 3_290_000;
        for (let i = 0; i < 25; i++) {
          const team = c.players > 1 ? [runners[i % runners.length], runners[(i + 5) % runners.length]] : [runners[i % runners.length]];
          const values = [];
          if (sub) values.push({ variable_id: 7, variable: "Singleplayer Category", is_subcategory: true, value_id: sub.id, label: sub.label, slug: sub.slug });
          if (c.type === "full_game") values.push({ variable_id: 6, variable: "Quicksaves", is_subcategory: false, value_id: 3, label: "Yes", slug: "yes" });
          runs.push({
            id: id++, category_id: c.id, level_id: l?.id ?? null, time_ms: base + i * 4_321 + (i % 3) * 17, run_date: `2026-0${1 + (i % 9)}-1${i % 9}`,
            submitted_at: "2026-10-11T00:00:00", status: "verified", examiner_name: "Sample Mod", examined_at: null, reject_reason: null,
            comment: i % 4 === 0 ? "gg" : null, video_url: i % 2 === 0 ? "https://www.youtube.com/watch?v=sample" : null, demo_url: null, has_demo_file: i < 10,
            category_name: c.name, category_slug: c.slug, players: c.players, category_type: c.type, game_id: 1, game_name: "Portal 2", game_slug: "portal-2",
            level_name: l?.name ?? null, level_slug: l?.slug ?? null, runners: team, values, rank: null, obsolete: false,
          });
        }
      }
    }
  }
  return { game, categories, levels, variables, runners, runs };
})();

const variablesFor = (category) =>
  SAMPLE.variables.filter((v) => (v.category_id == null || v.category_id === category.id) && !(v.scope === "full_game" && category.type === "per_level"));

function rankRuns(runs) {
  let rank = 0;
  let prev = null;
  return runs.map((r, i) => {
    if (r.time_ms !== prev) rank = i + 1;
    prev = r.time_ms;
    return { ...r, rank };
  });
}

function sampleBoard(categorySlug, levelSlug, selected) {
  const category = SAMPLE.categories.find((c) => c.slug === categorySlug) || SAMPLE.categories[0];
  const levels = category.type === "per_level" ? SAMPLE.levels : [];
  const level = category.type === "per_level" ? levels.find((l) => l.slug === levelSlug) || levels[0] : null;
  const variables = variablesFor(category);
  const chosen = {};
  variables.filter((v) => v.is_subcategory).forEach((v) => {
    chosen[v.id] = (v.values.find((x) => x.slug === selected[v.id]) || v.values[0]).slug;
  });
  const runs = SAMPLE.runs
    .filter((r) => r.category_id === category.id && r.level_id === (level?.id ?? null))
    .filter((r) => Object.entries(chosen).every(([vid, slug]) => r.values.some((v) => v.variable_id === Number(vid) && v.slug === slug)))
    .sort((a, b) => a.time_ms - b.time_ms);
  return { game: SAMPLE.game, category, level, levels, variables, selected: chosen, runs: rankRuns(runs) };
}

function sampleRun(id) {
  const run = SAMPLE.runs.find((r) => r.id === id) || SAMPLE.runs[0];
  const board = sampleBoard(run.category_slug, run.level_slug, Object.fromEntries(run.values.filter((v) => v.is_subcategory).map((v) => [v.variable_id, v.slug])));
  const placed = board.runs.find((r) => r.id === run.id);
  return { ...run, rank: placed?.rank ?? null, events: [{ action: "imported", note: "Sample data", created_at: "2026-10-11T23:53:18", actor_name: null }] };
}

function sampleRunner(id) {
  const runner = SAMPLE.runners.find((r) => r.id === id) || SAMPLE.runners[0];
  const runs = SAMPLE.runs.filter((r) => r.runners.some((x) => x.id === runner.id)).map((r) => sampleRun(r.id));
  return { runner: { ...runner, src_user_id: null, src_guest_name: null }, runs };
}
