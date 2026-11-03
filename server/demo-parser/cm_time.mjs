// A demo's challenge mode result: the time (centiseconds) and portal count of a finished run.
//
// The game reports a run's result in a "ScoreboardTempUpdate" user message when it writes the
// leaderboard at the end of the run. In co-op it skips that write when the game has lost its
// matchmaking session (a Steam hiccup: the map keeps running), so neither player's demo has the
// message, and Steam never gets the time either.
//
// SAR still knows the time: when the last player reaches the flags, the host's SAR reads the
// game's challenge mode timer and sends it to the partner as a "cm-flags" message over chat,
// which both players' demos record (as chat from the host). That's the fallback here, taken only
// when the demo backs it up:
//   - sent by the host (blue, entity 1): the server tags chat with its sender, so the partner
//     can't send blue's messages,
//   - with the run's end flag set,
//   - with the game ending the run ("leaderboard_open 1"), both after the run's last start (the
//     game's "MPMapCompletedData" message) when the demo has it,
//   - and not faster than the demo shows: the server ticks from the start (or from the demo's
//     first tick, when it began after the start) to the flags fit in the time.
// The portal count isn't in it, so it's null then.
import { Messages, NetMessages, MPMapCompletedData, SayText2, ScoreboardTempUpdate } from "@nekz/sdp";

/**
 * Most server ticks the run's span may exceed SAR's time by. Genuine runs come within 16 (the start
 * message isn't exact); a span shorter than the time is normal (a partner gets the start late).
 */
const MAX_TICK_DRIFT = 20;

// SAR's chat messages (SourceAutoRecord src/Features/NetMessage.cpp): since April 2023 a
// 4-character prefix, then the length and the "type\0data" bytes in SAR's base92; before that
// "!SAR:<b|o>:<type>:<data>", the data's non-alphanumeric bytes as "#XX".
const INIT_BLUE = "&^!$";
const CONT_BLUE = "&^?$";
const LEGACY_BLUE = "!SAR:b:";
const BASE92 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%^&*-_=+()[]{}<>'@#~;:/?,.|\\";
const HOST_ENTITY = 1;

/**
 * The bytes encoded in SAR's base92: 5 characters per 4 bytes (little-endian), and 2 characters
 * per byte for a last group shorter than 4.
 */
export function base92Decode(text) {
  const digit = (i) => {
    const d = BASE92.indexOf(text[i]);
    if (d < 0) throw new Error("not base92");
    return d;
  };
  const out = [];
  let i = 0;
  let left = text.length;
  while (left > 6 || left === 5) {
    let value = 0;
    for (let j = 4; j >= 0; j--) value = value * 92 + digit(i + j);
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    i += 5;
    left -= 5;
  }
  while (left > 0) {
    out.push((digit(i) + digit(i + 1) * 92) & 0xff);
    i += 2;
    left -= 2;
  }
  return new Uint8Array(out);
}

/** A legacy message's data: "#XX" is a byte in hex, anything else itself. */
function legacyDecode(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "#") {
      out.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(text.charCodeAt(i));
    }
  }
  return new Uint8Array(out);
}

/**
 * Reads blue's SAR messages from chat lines in order: `feed(line)` returns `{ type, data }` when a
 * line completes one, else null. Long messages span several lines, the first carrying the length.
 */
export function sarChatReader() {
  let partial = null;
  let expected = 0;
  return (line) => {
    if (line.startsWith(LEGACY_BLUE)) {
      partial = null;
      const rest = line.slice(LEGACY_BLUE.length);
      const colon = rest.indexOf(":");
      return colon < 0 ? null : { type: rest.slice(0, colon), data: legacyDecode(rest.slice(colon + 1)) };
    }
    if (line.startsWith(INIT_BLUE)) {
      try {
        expected = new DataView(base92Decode(line.slice(4, 9)).buffer).getUint32(0, true);
      } catch {
        partial = null;
        return null;
      }
      partial = line.slice(9);
    } else if (line.startsWith(CONT_BLUE) && partial !== null) {
      partial += line.slice(4);
    } else {
      return null;
    }
    if (partial.length < expected) return null;
    const encoded = partial;
    partial = null;
    if (encoded.length !== expected) return null;
    let raw;
    try {
      raw = base92Decode(encoded);
    } catch {
      return null;
    }
    const nul = raw.indexOf(0);
    if (nul < 0) return null;
    return { type: new TextDecoder().decode(raw.subarray(0, nul)), data: raw.subarray(nul + 1) };
  };
}

/** A "cm-flags" message's data: [slot, time (float32, seconds), end of the run]. */
export function readCmFlags(data) {
  if (data.length !== 6) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { slot: data[0], time: view.getFloat32(1, true), end: data[5] !== 0 };
}

/** Centiseconds as the game and SAR work them out: in float32, rounded down (7.3299999 → 733). */
export const centiseconds = (seconds) => Math.floor(Math.fround(Math.fround(seconds) * 100));

/** The chat text of a SayText2 message (sdp's field names are off by one, so look at all). */
const chatText = (msg) =>
  [...(msg.messages ?? []), msg.messageText, msg.text].find((t) => typeof t === "string" && (t.startsWith("&^") || t.startsWith("!SAR:"))) ?? null;

/** The run's time from SAR's "cm-flags" message, checked as described above, else null. */
export function sarFlagsTime(demo) {
  return checkSarFlags(demo).time;
}

/** `{ time }` from SAR's "cm-flags" message, or `{ time: null, reason }` why there's none. */
export function checkSarFlags(demo) {
  let ipt;
  try {
    ipt = demo.getIntervalPerTick();
  } catch {
    return { time: null, reason: "no ticks" };
  }
  const feed = sarChatReader();
  let serverTick = null;
  let start = null; // the run's start, or the demo's first tick until it's seen
  let flags = null;
  let ended = false;
  for (const message of demo.messages) {
    const packets = message.packets ?? [];
    // The server tick a packet is for (it isn't always the packet's first message).
    serverTick = packets.find((p) => p instanceof NetMessages.NetTick)?.tick ?? serverTick;
    // (SignOn packets are the loading before it.)
    if (start === null && serverTick !== null && message instanceof Messages.Packet && !(message instanceof Messages.SignOn)) start = serverTick;
    for (const packet of packets) {
      if (packet instanceof NetMessages.NetStringCmd) {
        if (packet.command?.trim() === "leaderboard_open 1") ended = true;
      } else if (packet instanceof NetMessages.SvcUserMessage) {
        const um = packet.userMessage;
        if (um instanceof MPMapCompletedData) {
          start = serverTick;
          flags = null;
          ended = false;
        } else if (um instanceof SayText2 && um.client === HOST_ENTITY) {
          const text = chatText(um);
          const sar = text && feed(text);
          if (sar?.type !== "cm-flags") continue;
          const read = readCmFlags(sar.data);
          if (read?.end) flags = { ...read, tick: serverTick };
        }
      }
    }
  }
  if (!flags || flags.tick === null || start === null) return { time: null, reason: "no flags message" };
  if (!ended) return { time: null, reason: "run not ended" };
  const over = flags.tick - start - flags.time / ipt;
  if (over > MAX_TICK_DRIFT) return { time: null, reason: `faster than the demo by ${Math.round(over)} ticks` };
  return { time: centiseconds(flags.time) };
}

/**
 * The finished run's `{ timeScore, portalScore, timeSource }`: the scoreboard's ("scoreboard"),
 * else SAR's time ("sar", no portal count), else all null.
 */
export function finishedRun(demo) {
  const scores = demo.findPacket((m) => m instanceof NetMessages.SvcUserMessage && m.userMessage instanceof ScoreboardTempUpdate)?.userMessage;
  if (scores) return { timeScore: scores.timeScore ?? null, portalScore: scores.portalScore ?? null, timeSource: "scoreboard" };
  let time = null;
  try {
    time = sarFlagsTime(demo);
  } catch {
    // An unreadable demo has no fallback time either.
  }
  return time === null ? { timeScore: null, portalScore: null, timeSource: null } : { timeScore: time, portalScore: null, timeSource: "sar" };
}
