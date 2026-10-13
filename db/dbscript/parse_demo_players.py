#!/usr/bin/env python3
"""Read the players out of Portal 2 co-op board demos.

Co-op runs on the old board were often submitted by one player only, so the run has no
partner on record. The demo knows both: the engine's "userinfo" string table holds a
player_info_t record per connected player (SteamID, name). This writes, per co-op demo:

  changelog_id, file_steam_id, map, steam_id1, name1, steam_id2, name2, players, host_steam_id, error

`players` is how many distinct players the demo contains (2 for a normal co-op run).
`host_steam_id` is the player who hosted the game, who always plays blue (Atlas): the demo
header names the recording player and the server, which is "localhost" when the recorder
hosted and the host's address when they joined. Blank when the recorder can't be identified.
Demo file names are <map>_<time>_<steamid>_<changelogid>.dem (as downloaded from the board).

How it's fast: single-player demos are skipped after the 1 KB header. In a co-op demo the
player records sit in bit-packed network data (the tick-0 string tables, and a later table
update when the partner joins after recording starts), so instead of decoding the net
protocol the raw bytes are searched at each of the 8 bit alignments for the start of a
record: a big-endian SteamID64 (01 10 00 01 ...) followed, 44 bytes in, by the same ID as
"STEAM_X:Y:Z". Requiring the two to match rules out chance hits. Files run in parallel.

Usage:
  python parse_demo_players.py --demos H:/Board-Demos/demos --out demo_players.csv [--workers 16]
"""
import argparse
import csv
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor

HEADER = 1072
NAME_RE = re.compile(r"^(.*)_(\d+)_(\d{17})_(\d+)\.dem$")
STEAM_BASE = 76561197960265728
RECORD_START = re.compile(rb"\x01\x10\x00\x01")
GUID_RE = re.compile(rb"STEAM_\d:([01]):(\d+)")
RECORD_LEN = 80  # xuid (8) + name (32) + userID (4) + guid (33) + padding


def players_in(data):
    """Distinct (steam_id, name) player records in `data`, in order of first appearance."""
    whole = int.from_bytes(data, "little")
    found = {}
    for shift in range(8):
        aligned = (whole >> shift).to_bytes(len(data), "little")
        for m in RECORD_START.finditer(aligned):
            rec = aligned[m.start():m.start() + RECORD_LEN]
            if len(rec) < RECORD_LEN:
                continue
            guid = GUID_RE.fullmatch(rec[44:77].split(b"\0")[0])
            if not guid:
                continue
            steam_id = int.from_bytes(rec[:8], "big")
            if steam_id != STEAM_BASE + int(guid.group(2)) * 2 + int(guid.group(1)):
                continue
            bit = m.start() * 8 + shift
            if steam_id not in found or bit < found[steam_id][0]:
                found[steam_id] = (bit, rec[8:40].split(b"\0")[0].decode("utf-8", "replace"))
    return [(str(sid), name) for sid, (_, name) in sorted(found.items(), key=lambda kv: kv[1][0])]


def parse(path):
    m = NAME_RE.match(os.path.basename(path))
    if not m:
        return None
    _, _, file_steam, changelog_id = m.groups()
    row = [changelog_id, file_steam, "", "", "", "", "", 0, "", ""]
    try:
        with open(path, "rb") as f:
            head = f.read(HEADER)
            if len(head) < HEADER or head[:8] != b"HL2DEMO\0":
                row[9] = "not a demo"
                return row
            server = head[16:276].split(b"\0")[0].decode("latin-1")
            recorder = head[276:536].split(b"\0")[0].decode("utf-8", "replace")
            map_name = head[536:796].split(b"\0")[0].decode("latin-1")
            if not map_name.startswith("mp_coop"):
                return None  # single player
            data = f.read()
    except OSError as e:
        row[9] = str(e)
        return row
    row[2] = map_name
    players = players_in(data)
    row[7] = len(players)
    for i, (sid, name) in enumerate(players[:2]):
        row[3 + i * 2] = sid
        row[4 + i * 2] = name
    if len(players) < 2:
        row[9] = "partner not found"
        return row
    if file_steam not in (players[0][0], players[1][0]):
        row[9] = "file name steam id not among players"
    # The recorder is the player the header names; with no unique name match the host stays unknown.
    recording = [sid for sid, name in players[:2] if name == recorder]
    if len(recording) == 1:
        hosted = server.startswith(("localhost", "loopback"))
        row[8] = recording[0] if hosted else next(sid for sid, _ in players[:2] if sid != recording[0])
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demos", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--workers", type=int, default=os.cpu_count())
    parser.add_argument("--limit", type=int, help="only the first N files (for testing)")
    args = parser.parse_args()

    files = sorted(e.path for e in os.scandir(args.demos) if e.name.endswith(".dem"))
    if args.limit:
        files = files[:args.limit]
    started = time.time()
    rows = problems = 0
    with open(args.out, "w", newline="", encoding="utf-8") as out, ProcessPoolExecutor(args.workers) as pool:
        w = csv.writer(out)
        w.writerow(["changelog_id", "file_steam_id", "map", "steam_id1", "name1", "steam_id2", "name2", "players", "host_steam_id", "error"])
        for i, row in enumerate(pool.map(parse, files, chunksize=64), 1):
            if row:
                rows += 1
                problems += bool(row[9])
                w.writerow(row)
            if i % 20000 == 0:
                print(f"  {i}/{len(files)} files, {rows} co-op, {problems} with problems, {time.time() - started:.0f}s", file=sys.stderr)
    print(f"{len(files)} files, {rows} co-op demos (or unreadable files), {problems} with problems, {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
