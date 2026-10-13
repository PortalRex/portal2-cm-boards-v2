// Filter options shared by Score Updates and a map's Chamber History.
export const RUN_LIMITS = ["100", "200", "500"];

export const RUN_TOGGLES = [
  ["wr", "World records"],
  ["video", "Has video"],
  ["demo", "Has demo"],
  ["pending", "Pending"],
];

// Rank the run reached when it was set, and how recent it is.
export const RANK_OPTIONS = [
  { value: "", label: "Any rank" },
  ...["10", "25", "50", "100", "200"].map((n) => ({ value: n, label: `Top ${n}` })),
];

export const TIME_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "365", label: "Last year" },
];

export const BANNED_OPTIONS = [
  { value: "hide", label: "Hide banned" },
  { value: "show", label: "Include banned" },
  { value: "only", label: "Only banned" },
];
