// Reads many demos in parallel (run by the server's demo parsing job, tools/demo_parse.rs) and
// prints one JSON line per demo:
//
//   { "id", "ok", "error", "mapName", "timeScore", "portalScore", "players": [{ "steamId", "name" }],
//     "hostSteamId", "sarVersion", "sarChecksum", "sarApproved", "segments", "checks" }
//
// - timeScore / portalScore: the end-of-run challenge mode scoreboard (null without a finished run).
// - players: the userinfo string table, plus (co-op maps) a scan of the whole demo for player
//   records, which also finds a partner who joined after recording started (as parse_demo.mjs).
// - hostSteamId: who hosted (and so played blue): the recording player when the demo's server is
//   "localhost", else the other player (as autorender and parse_demo_players.py tell).
// - sarVersion: SAR echoes its version into the console when it starts recording
//   (`echo "SAR 1.15.5 (Built ...)"`), and demos keep console commands. Older SAR doesn't.
// - sarChecksum: the CRC32 of the SAR binary that recorded it (sar.dll / sar.so, as on its GitHub
//   release), appended after the demo's stop message; sarApproved: true when it's on the old
//   boards' list of approved SAR builds (checks/sar_whitelist.txt, from their demo checker, mdp),
//   else null (the list ends at Oct 2025, so a newer build isn't known either way).
// - segments: SAR's speedrun timer splits, as autorender stores them ([{ name, ticks, splits }]).
// - checks: SAR's record of pauses (total ticks) and timescale cheats (the values), when the demo
//   has SAR data.
//
// Usage: node parse_batch.mjs <list file: "id<TAB>path" per line> [workers]
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { Messages, NetMessages, ScoreboardTempUpdate, SourceDemo, SourceDemoParser } from "@nekz/sdp";
import { isSarMessage, readSarMessages, SarDataType } from "@nekz/sdp/utils";

const here = dirname(fileURLToPath(import.meta.url));
const STEAM_BASE = 76561197960265728n;
const MAX_LISTED = 30;

const steamIdFromGuid = (guid) => {
  const m = /^STEAM_\d:([01]):(\d+)$/.exec(guid || "");
  return m ? (STEAM_BASE + BigInt(m[2]) * 2n + BigInt(m[1])).toString() : null;
};

const lines = (name) =>
  readFileSync(join(here, "checks", name), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// player_info_t records anywhere in the demo, at any bit alignment (see parse_demo.mjs).
function scanPlayers(bytes) {
  const found = new Map();
  const n = bytes.length - 1;
  const shifted = new Uint8Array(n);
  const decoder = new TextDecoder("utf-8");
  for (let shift = 0; shift < 8; shift++) {
    for (let i = 0; i < n; i++) shifted[i] = ((bytes[i] >> shift) | (bytes[i + 1] << (8 - shift))) & 0xff;
    for (let i = 0; i + 80 <= n; i++) {
      if (shifted[i] !== 0x01 || shifted[i + 1] !== 0x10 || shifted[i + 2] !== 0x00 || shifted[i + 3] !== 0x01) continue;
      let guid = "";
      for (let j = 44; j < 77 && shifted[i + j]; j++) guid += String.fromCharCode(shifted[i + j]);
      const fromGuid = steamIdFromGuid(guid);
      if (!fromGuid) continue;
      let xuid = 0n;
      for (let j = 0; j < 8; j++) xuid = (xuid << 8n) | BigInt(shifted[i + j]);
      if (xuid.toString() !== fromGuid || found.has(fromGuid)) continue;
      let end = i + 8;
      while (end < i + 40 && shifted[end]) end++;
      found.set(fromGuid, { steamId: fromGuid, name: decoder.decode(shifted.subarray(i + 8, end)), at: i * 8 + shift });
    }
  }
  return [...found.values()].sort((a, b) => a.at - b.at).map(({ steamId, name }) => ({ steamId, name }));
}

const hex32 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, "0");

// SAR appends its checksum after the demo's stop message, where the message reader doesn't go:
// v2 is [0xFE, sarSum, 64-byte signature], v1 [0xFF, demoSum, sarSum] (little-endian).
function tailChecksum(bytes) {
  const n = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (n > 69 && bytes[n - 69] === 0xfe) return hex32(view.getUint32(n - 68, true));
  if (n > 9 && bytes[n - 9] === 0xff) return hex32(view.getUint32(n - 4, true));
  return null;
}

function parse(path, lists) {
  const data = readFileSync(path);
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const buffer = SourceDemoParser.default().prepare(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const demo = SourceDemo.default();
  demo.readHeader(buffer);
  try {
    demo.readMessages(buffer);
  } catch {
    // Partial message data still leaves the header and earlier messages usable.
  }
  try {
    demo.readPackets();
  } catch {
    // Best effort: the scoreboard may already have been read.
  }
  const scores = demo.findPacket((m) => m instanceof NetMessages.SvcUserMessage && m.userMessage instanceof ScoreboardTempUpdate)?.userMessage;

  const players = new Map();
  try {
    demo.readStringTables();
    const table = demo.messages.find((m) => m.stringTables)?.stringTables?.find((t) => t.name === "userinfo");
    for (const entry of table?.entries || []) {
      const id = steamIdFromGuid(entry.data?.guid);
      if (id && !entry.data.fakePlayer && !entry.data.isHltv) players.set(id, { steamId: id, name: entry.data.name });
    }
  } catch {
    // Fall back to the scan below.
  }
  const coop = (demo.mapName || "").startsWith("mp_coop");
  if (coop && players.size < 2) for (const p of scanPlayers(bytes)) if (!players.has(p.steamId)) players.set(p.steamId, p);
  const list = [...players.values()];

  // The recorder hosted when the server is "localhost"; the host plays blue.
  let hostSteamId = null;
  if (coop && list.length === 2) {
    const recorder = list.find((p) => p.name === demo.clientName);
    if (recorder) hostSteamId = (demo.serverName || "").startsWith("localhost") ? recorder.steamId : list.find((p) => p !== recorder).steamId;
  }

  let sarVersion = null;
  for (const m of demo.messages) {
    if (!(m instanceof Messages.ConsoleCmd)) continue;
    const v = /^echo\s+"?SAR\s+v?(\d+\.\d+[^\s"]*)/i.exec(m.command || "");
    if (v) {
      sarVersion = v[1];
      break;
    }
  }
  let sarChecksum = tailChecksum(bytes);
  let segments = null;
  const checks = { pauseTicks: 0, timescale: [] };
  let sar = [];
  try {
    sar = readSarMessages(demo);
  } catch {
    sar = [];
  }
  for (const m of sar) {
    if ((m.type === SarDataType.ChecksumV2 || m.type === SarDataType.Checksum) && m.sarSum != null) {
      sarChecksum ??= hex32(m.sarSum);
    } else if (m.type === SarDataType.Pause && m.pauseTicks) {
      checks.pauseTicks += m.pauseTicks;
    } else if (m.type === SarDataType.TimescaleCheat) {
      if (checks.timescale.length < MAX_LISTED) checks.timescale.push(m.timescale);
    }
  }
  const speedrun = sar.find(isSarMessage(SarDataType.SpeedrunTime));
  if (speedrun?.splits?.length) {
    segments = speedrun.splits.map((split) => {
      const splits = (split.segs || []).map((s) => ({ name: s.name, ticks: s.ticks }));
      return { name: split.name, ticks: splits.reduce((a, s) => a + s.ticks, 0), splits };
    });
  }

  return {
    ok: true,
    mapName: demo.mapName ?? null,
    timeScore: scores?.timeScore ?? null,
    portalScore: scores?.portalScore ?? null,
    players: list,
    hostSteamId,
    sarVersion,
    sarChecksum,
    sarApproved: sarChecksum && lists.sar.has(sarChecksum) ? true : null,
    segments,
    checks: sar.length ? checks : null,
  };
}

if (isMainThread) {
  const [listFile, workersArg] = process.argv.slice(2);
  if (!listFile) {
    console.error("Usage: node parse_batch.mjs <list file> [workers]");
    process.exit(1);
  }
  const items = readFileSync(listFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [id, ...rest] = l.split("\t");
      return { id: Number(id), path: rest.join("\t") };
    });
  const workers = Math.max(1, Math.min(items.length, Number(workersArg) || Math.max(1, cpus().length - 2)));
  // A closed stdout (the reader went away) ends the run quietly.
  process.stdout.on("error", () => process.exit(0));
  let running = 0;
  for (let w = 0; w < workers; w++) {
    const part = items.filter((_, i) => i % workers === w);
    if (!part.length) continue;
    running++;
    const worker = new Worker(new URL(import.meta.url), { workerData: part });
    worker.on("message", (row) => process.stdout.write(`${JSON.stringify(row)}\n`));
    worker.on("error", (e) => console.error(String(e?.message || e)));
    worker.on("exit", () => {
      running--;
    });
  }
} else {
  const lists = { sar: new Set(lines("sar_whitelist.txt").map((l) => l.toUpperCase())) };
  for (const { id, path } of workerData) {
    try {
      parentPort.postMessage({ id, ...parse(path, lists) });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e?.message || e).slice(0, 190) });
    }
  }
}
