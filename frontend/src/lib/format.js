// The API sends UTC timestamps without a zone suffix ("2026-10-12T15:59:13");
// read those as UTC rather than local time.
export function parseTimestamp(timestamp) {
  if (timestamp == null) return null;
  if (timestamp instanceof Date || typeof timestamp === "number") return new Date(timestamp);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`);
}

// Scores are stored as integer centiseconds (e.g. 34530 -> 5:45.30).
export function formatScore(cs) {
  if (cs == null) return "";
  const negative = cs < 0;
  const abs = Math.abs(Math.round(cs));
  const minutes = Math.floor(abs / 6000);
  const seconds = Math.floor((abs % 6000) / 100);
  const hundredths = abs % 100;
  const hh = String(hundredths).padStart(2, "0");
  const text = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${hh}`
    : `${seconds}.${hh}`;
  return negative ? `-${text}` : text;
}

// Signed delta in seconds, e.g. 12 -> "+0.12", -42 -> "-0.42".
export function formatDelta(cs, suffix = "") {
  if (cs == null) return "";
  const sign = cs > 0 ? "+" : cs < 0 ? "-" : "±";
  return `${sign}${formatScore(Math.abs(cs))}${suffix}`;
}

// Long aggregated times (hours of play) e.g. 319851 -> "53:18.51".
export function formatLongScore(cs) {
  return formatScore(cs);
}

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(timestamp, now = Date.now()) {
  if (!timestamp) return "";
  const seconds = Math.max(0, (now - parseTimestamp(timestamp).getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function formatDate(timestamp) {
  if (!timestamp) return "";
  // Plain dates ("2026-09-25") have no time zone; show them as-is.
  if (typeof timestamp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const d = parseTimestamp(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ordinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
}

export function formatPoints(points) {
  if (points == null) return "";
  return Math.round(points).toString();
}
