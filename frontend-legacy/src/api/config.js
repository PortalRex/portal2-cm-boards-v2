// Backend locations. All can be overridden with REACT_APP_* environment variables.
const trim = (url) => url.replace(/\/$/, "");

// Rust web server for the Portal 2 boards.
export const API_BASE = trim(process.env.REACT_APP_API_URL || "http://localhost:8080/api/v1");

// games.id values in the v2 database. Portal Stories: Mel is imported as its own game.
export const GAME_IDS = {
  portal2: 1,
  mel: Number(process.env.REACT_APP_MEL_GAME_ID || 2),
};

// Autorender (rendered videos and demo mtriggers). Its API allows cross-origin requests.
export const AUTORENDER = trim(process.env.REACT_APP_AUTORENDER_URL || "https://autorender.portal2.sr");

// Where autorender's video files live (<share_id>.mp4); production uses object storage.
export const AUTORENDER_STORAGE = trim(process.env.REACT_APP_AUTORENDER_STORAGE_URL || "https://portal2.fsn1.your-objectstorage.com");

export const FORCE_MOCK = process.env.REACT_APP_USE_MOCK === "true";
