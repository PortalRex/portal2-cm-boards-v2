// Reads the end-of-run scoreboard (time and portal count) out of every demo in a directory,
// in parallel, and writes a CSV for db/dbscript/import_demo_stats.py:
//
//   changelog_id, map, time_score, portal_score, error
//
// Demo file names are <map>_<time>_<steamid>_<changelogid>.dem, as downloaded from the old
// boards; changelog_id is the old board's id. Subdirectories are searched too.
//
// Usage: node demo_stats.mjs <demo dir> <out.csv> [workers]
import { createWriteStream, readdirSync, readFileSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { NetMessages, ScoreboardTempUpdate, SourceDemo, SourceDemoParser } from "@nekz/sdp";

function scoreboard(path) {
  const data = readFileSync(path);
  const parser = SourceDemoParser.default();
  const buffer = parser.prepare(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const demo = SourceDemo.default();
  demo.readHeader(buffer);
  try {
    demo.readMessages(buffer);
  } catch {
    // Partial message data still leaves earlier messages usable.
  }
  try {
    demo.readPackets();
  } catch {
    // Best effort: the scoreboard may already have been read.
  }
  const found = demo.findPacket((m) => m instanceof NetMessages.SvcUserMessage && m.userMessage instanceof ScoreboardTempUpdate);
  return { map: demo.mapName ?? "", time: found?.userMessage?.timeScore ?? null, portals: found?.userMessage?.portalScore ?? null };
}

if (isMainThread) {
  const [dir, out, workersArg] = process.argv.slice(2);
  if (!dir || !out) {
    console.error("Usage: node demo_stats.mjs <demo dir> <out.csv> [workers]");
    process.exit(1);
  }
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.toLowerCase().endsWith(".dem")) files.push(p);
    }
  };
  walk(dir);
  const workers = Math.max(1, Number(workersArg) || Math.max(1, cpus().length - 1));
  const stream = createWriteStream(out);
  stream.write("changelog_id,map,time_score,portal_score,error\n");
  let done = 0;
  const started = Date.now();
  const chunk = Math.ceil(files.length / workers);
  let running = 0;
  for (let i = 0; i < workers; i++) {
    const part = files.slice(i * chunk, (i + 1) * chunk);
    if (!part.length) continue;
    running++;
    const w = new Worker(new URL(import.meta.url), { workerData: part });
    w.on("message", (rows) => {
      for (const r of rows) stream.write(`${r.id},${r.map},${r.time ?? ""},${r.portals ?? ""},${r.error ?? ""}\n`);
      done += rows.length;
      if (done % 2000 < rows.length) {
        const rate = done / ((Date.now() - started) / 1000);
        console.error(`${done}/${files.length} (${rate.toFixed(0)}/s)`);
      }
    });
    w.on("exit", () => {
      if (--running === 0) {
        stream.end();
        console.error(`done: ${done} demos in ${((Date.now() - started) / 1000).toFixed(0)}s`);
      }
    });
  }
} else {
  let batch = [];
  for (const path of workerData) {
    const name = path.split(/[\\/]/).pop().slice(0, -4);
    const id = name.split("_").pop();
    try {
      const s = scoreboard(path);
      batch.push({ id, map: s.map, time: s.time, portals: s.portals });
    } catch (e) {
      batch.push({ id, map: "", error: String(e?.message || e).replace(/[,\n]/g, " ").slice(0, 80) });
    }
    if (batch.length >= 200) {
      parentPort.postMessage(batch);
      batch = [];
    }
  }
  if (batch.length) parentPort.postMessage(batch);
}
