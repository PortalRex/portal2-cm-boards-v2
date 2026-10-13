import chamberImages from "../scenes/global/ChamberImages";
import BSP_NAMES from "./bspNames";

// Chapters and maps in game order. Single player chapters come first, then the
// co-op courses. Each map entry is [steam leaderboard id, title].
const SP_CHAPTERS = [
  {
    number: 1,
    name: "The Courtesy Call",
    maps: [
      ["62761", "Container Ride"],
      ["62758", "Portal Carousel"],
      ["47458", "Portal Gun"],
      ["47455", "Smooth Jazz"],
      ["47452", "Cube Momentum"],
      ["47106", "Future Starter"],
      ["62763", "Secret Panel"],
      ["62759", "Wakeup"],
      ["47735", "Incinerator"],
    ],
  },
  {
    number: 2,
    name: "The Cold Boot",
    maps: [
      ["62765", "Laser Intro"],
      ["47736", "Laser Stairs"],
      ["47738", "Dual Lasers"],
      ["47742", "Laser Over Goo"],
      ["62767", "Catapult Intro"],
      ["47744", "Trust Fling"],
      ["47465", "Pit Flings"],
      ["47746", "Fizzler Intro"],
    ],
  },
  {
    number: 3,
    name: "The Return",
    maps: [
      ["47748", "Ceiling Catapult"],
      ["47751", "Ricochet"],
      ["47752", "Bridge Intro"],
      ["47755", "Bridge The Gap"],
      ["47756", "Turret Intro"],
      ["47759", "Laser Relays"],
      ["47760", "Turret Blocker"],
      ["47763", "Laser Vs Turret"],
      ["47764", "Pull The Rug"],
    ],
  },
  {
    number: 4,
    name: "The Surprise",
    maps: [
      ["47766", "Column Blocker"],
      ["47768", "Laser Chaining"],
      ["47770", "Triple Laser"],
      ["47773", "Jail Break"],
      ["47774", "Escape"],
    ],
  },
  {
    number: 5,
    name: "The Escape",
    maps: [
      ["47776", "Turret Factory"],
      ["47779", "Turret Sabotage"],
      ["47780", "Neurotoxin Sabotage"],
      ["62771", "Core"],
    ],
  },
  {
    number: 6,
    name: "The Fall",
    maps: [
      ["47783", "Underground"],
      ["47784", "Cave Johnson"],
      ["47787", "Repulsion Intro"],
      ["47468", "Bomb Flings"],
      ["47469", "Crazy Box"],
      ["47472", "PotatOs"],
    ],
  },
  {
    number: 7,
    name: "The Reunion",
    maps: [
      ["47791", "Propulsion Intro"],
      ["47793", "Propulsion Flings"],
      ["47795", "Conversion Intro"],
      ["47798", "Three Gels"],
    ],
  },
  {
    number: 8,
    name: "The Itch",
    maps: [
      ["88350", "Test"],
      ["47800", "Funnel Intro"],
      ["47802", "Ceiling Button"],
      ["47804", "Wall Button"],
      ["47806", "Polarity"],
      ["47808", "Funnel Catch"],
      ["47811", "Stop The Box"],
      ["47813", "Laser Catapult"],
      ["47815", "Laser Platform"],
      ["47817", "Propulsion Catch"],
      ["47819", "Repulsion Polarity"],
    ],
  },
  {
    number: 9,
    name: "The Part Where...",
    maps: [
      ["62776", "Finale 1"],
      ["47821", "Finale 2"],
      ["47824", "Finale 3"],
      ["47456", "Finale 4"],
    ],
  },
];

const COOP_CHAPTERS = [
  {
    number: 1,
    name: "Team Building",
    maps: [
      ["47741", "Doors"],
      ["47825", "Buttons"],
      ["47828", "Lasers"],
      ["47829", "Rat Maze"],
      ["45467", "Laser Crusher"],
      ["46362", "Behind the Scenes"],
    ],
  },
  {
    number: 2,
    name: "Mass and Velocity",
    maps: [
      ["47831", "Flings"],
      ["47833", "Infinifling"],
      ["47835", "Team Retrieval"],
      ["47837", "Vertical Flings"],
      ["47840", "Catapults"],
      ["47841", "Multifling"],
      ["47844", "Fling Crusers"],
      ["47845", "Industrial Fan"],
    ],
  },
  {
    number: 3,
    name: "Hard Light",
    maps: [
      ["47848", "Cooperative Bridges"],
      ["47849", "Bridge Swap"],
      ["47854", "Fling Block"],
      ["47856", "Catapult Block"],
      ["47858", "Bridge Fling"],
      ["47861", "Turret Walls"],
      ["52642", "Turret Assassin"],
      ["52660", "Bridge Testing"],
    ],
  },
  {
    number: 4,
    name: "Excursion Funnels",
    maps: [
      ["52662", "Cooperative Funnels"],
      ["52663", "Funnel Drill"],
      ["52665", "Funnel Catch"],
      ["52667", "Funnel Laser"],
      ["52671", "Cooperative Polarity"],
      ["52687", "Funnel Hop"],
      ["52689", "Advanced Polarity"],
      ["52691", "Funnel Maze"],
      ["52777", "Turret Warehouse"],
    ],
  },
  {
    number: 5,
    name: "Mobility Gels",
    maps: [
      ["52694", "Repulsion Jumps"],
      ["52711", "Double Bounce"],
      ["52714", "Bridge Repulsion"],
      ["52715", "Wall Repulsion"],
      ["52717", "Propulsion Crushers"],
      ["52735", "Turret Ninja"],
      ["52738", "Propulsion Retrieval"],
      ["52740", "Vault Entrance"],
    ],
  },
  {
    number: 6,
    name: "Art Therapy",
    maps: [
      ["49341", "Separation"],
      ["49343", "Triple Axis"],
      ["49345", "Catapult Catch"],
      ["49347", "Bridge Gels"],
      ["49349", "Maintenance"],
      ["49351", "Bridge Catch"],
      ["52757", "Double Lift"],
      ["52759", "Gel Maze"],
      ["48287", "Crazier Box"],
    ],
  },
];

// Portal Stories: Mel chapters from p2sr/melboard (docker/initdb/_populate.sql).
// Map ids are the Mel board's own ids. Advanced Mode maps 23-26 are not on the board.
// Entries are [board id, title, BSP name].
const MEL_STORY_CHAPTERS = [
  { number: 1, name: "1952", maps: [["1", "Tramride", "st_a1_tramride"], ["2", "Mel Intro", "st_a1_mel_intro"], ["3", "Lift", "st_a1_lift"], ["4", "Garden", "st_a1_garden"]] },
  {
    number: 2,
    name: "Extended Relaxation",
    maps: [
      ["5", "Destroyed Garden", "st_a2_garden_de"], ["6", "Underbounce", "st_a2_underbounce"], ["7", "Once Upon", "st_a2_once_upon"],
      ["8", "Past Power", "st_a2_past_power"], ["9", "Ramp", "st_a2_ramp"], ["10", "Firestorm", "st_a2_firestorm"],
    ],
  },
  {
    number: 3,
    name: "The Ascent",
    maps: [
      ["11", "Junkyard", "st_a3_junkyard"], ["12", "Concepts", "st_a3_concepts"], ["13", "Paint Fling", "st_a3_paint_fling"],
      ["14", "Faith Plate", "st_a3_faith_plate"], ["15", "Transition", "st_a3_transition"],
    ],
  },
  {
    number: 4,
    name: "Organic Complications",
    maps: [
      ["16", "Overgrown", "st_a4_overgrown"], ["17", "Funnel Over Goo", "st_a4_tb_over_goo"], ["18", "Two Of A Kind", "st_a4_two_of_a_kind"],
      ["19", "Destroyed", "st_a4_destroyed"], ["20", "Factory", "st_a4_factory"],
    ],
  },
  { number: 5, name: "Intrusion", maps: [["21", "Core Access", "st_a4_core_access"], ["22", "Finale", "st_a4_finale"]] },
];

const MEL_ADVANCED_CHAPTERS = [
  {
    number: 2,
    name: "Extended Relaxation",
    maps: [
      ["27", "Destroyed Garden", "sp_a2_garden_de"], ["28", "Underbounce", "sp_a2_underbounce"], ["29", "Once Upon", "sp_a2_once_upon"],
      ["30", "Past Power", "sp_a2_past_power"], ["31", "Ramp", "sp_a2_ramp"], ["32", "Firestorm", "sp_a2_firestorm"],
    ],
  },
  {
    number: 3,
    name: "The Ascent",
    maps: [
      ["33", "Junkyard", "sp_a3_junkyard"], ["34", "Concepts", "sp_a3_concepts"], ["35", "Paint Fling", "sp_a3_paint_fling"],
      ["36", "Faith Plate", "sp_a3_faith_plate"], ["37", "Transition", "sp_a3_transition"],
    ],
  },
  {
    number: 4,
    name: "Organic Complications",
    maps: [
      ["38", "Overgrown", "sp_a4_overgrown"], ["39", "Funnel Over Goo", "sp_a4_tb_over_goo"], ["40", "Two Of A Kind", "sp_a4_two_of_a_kind"],
      ["41", "Destroyed", "sp_a4_destroyed"], ["42", "Factory", "sp_a4_factory"],
    ],
  },
  { number: 5, name: "Intrusion", maps: [["43", "Core Access", "sp_a4_core_access"], ["44", "Finale", "sp_a4_finale"]] },
];

export const GAMES = {
  portal2: { id: "portal2", label: "Portal 2", gameDir: "portal2", modes: ["sp", "coop"] },
  mel: { id: "mel", label: "Portal Stories: Mel", gameDir: "portal_stories", modes: ["story", "advanced"] },
};

export const MODE_LABELS = {
  sp: "Singleplayer",
  coop: "Cooperative",
  story: "Story Mode",
  advanced: "Advanced Mode",
};

export const gameForMode = (mode) => (mode === "story" || mode === "advanced" ? "mel" : "portal2");

const toChapters = (chapters, mode) =>
  chapters.map((chapter) => {
    const game = gameForMode(mode);
    return {
      ...chapter,
      mode,
      game,
      maps: chapter.maps.map(([id, title, bsp]) => ({
        id,
        title,
        mode,
        game,
        bsp: bsp || BSP_NAMES[id],
        chapter: chapter.name,
        chapterNumber: chapter.number,
        // No Mel chamber images are bundled yet (melboard's are GPL/CC BY-NC).
        image: game === "mel" ? null : chamberImages[id],
      })),
    };
  });

export const spChapters = toChapters(SP_CHAPTERS, "sp");
export const coopChapters = toChapters(COOP_CHAPTERS, "coop");
export const storyChapters = toChapters(MEL_STORY_CHAPTERS, "story");
export const advancedChapters = toChapters(MEL_ADVANCED_CHAPTERS, "advanced");

const CHAPTERS_BY_MODE = { sp: spChapters, coop: coopChapters, story: storyChapters, advanced: advancedChapters };

// Portal 2 maps only; Mel maps are looked up with getMap(id, "mel").
export const allMaps = [...spChapters, ...coopChapters].flatMap((c) => c.maps);
export const melMaps = [...storyChapters, ...advancedChapters].flatMap((c) => c.maps);

const mapsByKey = Object.fromEntries([...allMaps, ...melMaps].map((m) => [`${m.game}:${m.id}`, m]));

export const getMap = (id, game = "portal2") => mapsByKey[`${game}:${id}`];

export const chaptersFor = (mode) => CHAPTERS_BY_MODE[mode] || spChapters;

export const mapsForMode = (mode) => chaptersFor(mode).flatMap((c) => c.maps);

export const mapPath = (map) => `/map/${map.mode}/${map.id}`;

// Portal 2 chapters' ids in the database: co-op courses are 1-6, singleplayer chapters 7-15.
export const chapterDbId = (chapter) => (chapter.mode === "coop" ? chapter.number : chapter.number + 6);
export const p2Chapters = [...spChapters, ...coopChapters];
export const p2ChapterByDbId = (id) => p2Chapters.find((c) => chapterDbId(c) === Number(id));
