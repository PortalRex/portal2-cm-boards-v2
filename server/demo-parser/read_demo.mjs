import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** A demo file's bytes; one stored compressed (`.dem.gz`) is unpacked. */
export function readDemo(path) {
  const data = readFileSync(path);
  return path.toLowerCase().endsWith(".gz") ? gunzipSync(data) : data;
}
