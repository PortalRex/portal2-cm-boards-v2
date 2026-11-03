// Tests for cm_time.mjs: node --test (npm test).
import assert from "node:assert/strict";
import { test } from "node:test";
import { Messages, MPMapCompletedData, NetMessages, SayText2, ScoreboardTempUpdate } from "@nekz/sdp";
import { base92Decode, centiseconds, finishedRun, readCmFlags, sarChatReader, sarFlagsTime } from "./cm_time.mjs";

// Chat lines from a real co-op Doors run (board changelog 359637) whose game lost its matchmaking
// session, so the demos have no scoreboard message: the host's SAR sent these at the flags.
const FLAGS_BLUE = "&^!$vaaaaR6Q:x;=NcBqmk,3wc%aaa"; // slot 0, 6.4667 s, not the end
const FLAGS_END = "&^!$vaaaaR6Q:x;=NcBm+haayc%aba"; // slot 1, 6.5000005 s, the end
const SRTIMER = "&^!$raaaaJih%y@_5ja0jjaaaa";

const make = (Class, fields) => Object.assign(Object.create(Class.prototype), fields);
const user = (userMessage) => make(NetMessages.SvcUserMessage, { userMessage });
const chat = (client, text) => user(make(SayText2, { client, messages: [text, "", "", ""] }));
const runStart = () => user(make(MPMapCompletedData, {}));
const leaderboardOpen = () => make(NetMessages.NetStringCmd, { command: "leaderboard_open 1" });
const packet = (serverTick, ...packets) => make(Messages.Packet, { packets: [make(NetMessages.NetTick, { tick: serverTick }), ...packets] });
const demoOf = (...messages) => ({
  messages,
  getIntervalPerTick: () => 1 / 60,
  findPacket: (match) => messages.flatMap((m) => m.packets ?? []).find(match),
});

// The 6.50 run as the host recorded it: the start at server tick 340, the flags at 728/729.
const lostSessionRun = (...end) =>
  demoOf(packet(112), packet(340, runStart()), packet(500, chat(1, SRTIMER)), packet(728, chat(1, FLAGS_BLUE)), packet(729, ...end));

test("decodes SAR's base92", () => {
  assert.deepEqual([...base92Decode("Jih%y@_5ja")], [0x73, 0x72, 0x74, 0x69, 0x6d, 0x65, 0x72, 0x00]); // "srtimer\0"
  assert.deepEqual([...base92Decode("aaba")], [0, 1]); // a short last group: 2 characters a byte
});

test("reads cm-flags messages, current and older SAR's", () => {
  const feed = sarChatReader();
  assert.equal(feed(SRTIMER).type, "srtimer");
  const first = readCmFlags(feed(FLAGS_BLUE).data);
  assert.deepEqual([first.slot, centiseconds(first.time), first.end], [0, 646, false]);
  const end = readCmFlags(feed(FLAGS_END).data);
  assert.equal(end.end, true);
  assert.equal(centiseconds(end.time), 650);
  const legacy = feed("!SAR:b:cm-flags:#01#AB#AA#EA#40#01");
  assert.equal(legacy.type, "cm-flags");
  assert.equal(centiseconds(readCmFlags(legacy.data).time), 733);
  assert.equal(feed("hello there"), null);
});

test("joins a message sent over several chat lines", () => {
  const feed = sarChatReader();
  // FLAGS_END's encoding split as SAR splits long ones: the first line has the length.
  assert.equal(feed("&^!$vaaaaR6Q:x;=Nc"), null);
  const msg = feed("&^?$Bm+haayc%aba");
  assert.equal(centiseconds(readCmFlags(msg.data).time), 650);
});

test("works out centiseconds in float32, as the game does", () => {
  assert.equal(centiseconds(Math.fround(7.33)), 733); // 7.3299999 in float32
  assert.equal(centiseconds(Math.fround(6.5000005)), 650);
});

test("uses SAR's time when the scoreboard is missing", () => {
  assert.deepEqual(finishedRun(lostSessionRun(chat(1, FLAGS_END), leaderboardOpen())), { timeScore: 650, portalScore: null, timeSource: "sar" });
  // Older SAR's message comes just after the game ends the run.
  assert.equal(sarFlagsTime(lostSessionRun(leaderboardOpen(), chat(1, FLAGS_END))), 650);
});

test("prefers the scoreboard", () => {
  const demo = lostSessionRun(chat(1, FLAGS_END), leaderboardOpen(), user(make(ScoreboardTempUpdate, { timeScore: 651, portalScore: 5 })));
  assert.deepEqual(finishedRun(demo), { timeScore: 651, portalScore: 5, timeSource: "scoreboard" });
});

test("takes SAR's time only when the demo backs it up", () => {
  // The partner (entity 2) typing blue's message.
  assert.equal(sarFlagsTime(lostSessionRun(chat(2, FLAGS_END), leaderboardOpen())), null);
  // Not the end of the run, or the game didn't end it.
  assert.equal(sarFlagsTime(lostSessionRun(chat(1, FLAGS_BLUE), leaderboardOpen())), null);
  assert.equal(sarFlagsTime(lostSessionRun(chat(1, FLAGS_END))), null);
  // A run restarted after the flags.
  const restarted = lostSessionRun(chat(1, FLAGS_END), leaderboardOpen()).messages;
  assert.equal(sarFlagsTime(demoOf(...restarted, packet(900, runStart()))), null);
  // Faster than the demo: 6.50 s claimed, 7.83 s of server ticks.
  const late = demoOf(packet(340, runStart()), packet(810, chat(1, FLAGS_END), leaderboardOpen()));
  assert.equal(sarFlagsTime(late), null);
  assert.deepEqual(finishedRun(late), { timeScore: null, portalScore: null, timeSource: null });
});

test("takes it from a demo that began after the run's start", () => {
  // A partner who loaded in late: no start message, the span from the demo's first tick fits.
  const demo = demoOf(make(Messages.SignOn, { packets: [make(NetMessages.NetTick, { tick: 60 })] }), packet(420), packet(729, chat(1, FLAGS_END), leaderboardOpen()));
  assert.equal(sarFlagsTime(demo), 650);
});
