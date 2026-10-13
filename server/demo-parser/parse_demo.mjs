// Reads a submitted Portal 2 / Portal Stories: Mel demo and prints its metadata as JSON:
//
//   { "mapName", "gameDirectory", "clientName", "timeScore", "portalScore", "players": [{ "steamId", "name" }] }
//
// timeScore / portalScore come from the challenge mode scoreboard message the game sends at
// the end of a run (timeScore is the board time in centiseconds); they're null when the demo
// doesn't contain a finished run. players are read from the userinfo string table, plus a scan
// of the whole demo for player records, which also finds a co-op partner who joined after
// recording started. Uses @nekz/sdp, as board.portal2.sr's demo validator did.
//
// Usage: node parse_demo.mjs <demo path>
import { readFileSync } from "node:fs";
import { NetMessages, ScoreboardTempUpdate, SourceDemo, SourceDemoParser } from "@nekz/sdp";

const STEAM_BASE = 76561197960265728n;

const steamIdFromGuid = (guid) => {
  const m = /^STEAM_\d:([01]):(\d+)$/.exec(guid || "");
  return m ? (STEAM_BASE + BigInt(m[2]) * 2n + BigInt(m[1])).toString() : null;
};

// player_info_t records anywhere in the demo, at any bit alignment: a big-endian SteamID64
// followed 44 bytes later by the same ID as "STEAM_X:Y:Z".
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

const [path] = process.argv.slice(2);
if (!path) {
  console.error("Missing demo path.");
  process.exit(1);
}

try {
  const data = readFileSync(path);
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const parser = SourceDemoParser.default();
  const buffer = parser.prepare(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
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

  const scoreboard = demo.findPacket((m) => m instanceof NetMessages.SvcUserMessage && m.userMessage instanceof ScoreboardTempUpdate);
  const scores = scoreboard?.userMessage;

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
  for (const p of scanPlayers(bytes)) if (!players.has(p.steamId)) players.set(p.steamId, p);

  console.log(
    JSON.stringify({
      mapName: demo.mapName ?? null,
      gameDirectory: demo.gameDirectory ?? null,
      clientName: demo.clientName ?? null,
      timeScore: scores?.timeScore ?? null,
      portalScore: scores?.portalScore ?? null,
      players: [...players.values()],
    }),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
