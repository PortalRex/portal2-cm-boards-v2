#!/usr/bin/env python3
"""Import the boards this project replaces into the v2 Postgres schema.

Sources (MySQL/MariaDB, same layout - melboard is a fork of the old board):
  * board.portal2.sr  ("iverborg_leaderboard": changelog, scores, usersnew, maps, ...)  -> game 1, Portal 2
  * mel board         ("board": changelog, scores, users, maps, ...)                    -> game 2, Portal Stories: Mel

The target must be an empty database created from schema.sql (or an older one
with migrations/20261012000000_multi_game.sql applied).

Usage:
  python import_boards.py \
      --p2  mysql://user:pass@host:3306/iverborg_leaderboard \
      --mel mysql://user:pass@host:3306/board \
      --pg  postgresql://user:pass@host:5432/p2boards \
      [--demo-players demo_players.csv]

--demo-players takes the output of parse_demo_players.py (the players read from the co-op
demos). With it, a co-op run is paired with the partner its demo shows: with that
partner's matching run (same map and score, nearest in time) when there is one, otherwise
with the partner alone (filler run, real partner). Partners without an account on either
board get one named from the demo. Runs without demo data fall back to time matching.
The demos also show who hosted, and so played blue (Atlas); that's stored as
coop_bundled.p1_is_host.

Portal 2 rows keep their changelog IDs (autorender and old links refer to them).
Mel changelog IDs are shifted past the Portal 2 range; legacy_changelog_ids maps
every source ID to its new ID for both games.

The Portal 2 transformation follows pgscript.py (any% category per map, demo rows
for runs with demos, co-op runs bundled by matching time/score with a filler
partner for unmatched runs) but uses batched inserts and also carries
autorender_id. Requires mysql-connector-python and psycopg2.
"""
import argparse
import csv
import datetime
import os
import re
import sys
from collections import defaultdict
from urllib.parse import unquote, urlparse

import mysql.connector
import psycopg2
from psycopg2.extras import execute_values

P2_GAME, MEL_GAME = 1, 2
GAMES = [(P2_GAME, "Portal 2", "portal2", 1), (MEL_GAME, "Portal Stories: Mel", "mel", 2)]
FILLER_USER = "N/A"
BATCH = 5000
INT_MAX = 2**31 - 1

# Category order used by pgscript.py: co-op maps first, then single player.
COOP_MAP_IDS = [
    47741, 47825, 47828, 47829, 45467, 46362, 47831, 47833, 47835, 47837, 47840, 47841, 47844, 47845, 47848, 47849,
    47854, 47856, 47858, 47861, 52642, 52660, 52662, 52663, 52665, 52667, 52671, 52687, 52689, 52691, 52777, 52694,
    52711, 52714, 52715, 52717, 52735, 52738, 52740, 49341, 49343, 49345, 49347, 49349, 49351, 52757, 52759, 48287,
]
SP_MAP_IDS = [
    47458, 47455, 47452, 47106, 47735, 47736, 47738, 47742, 47744, 47465, 47746, 47748, 47751, 47752, 47755, 47756,
    47759, 47760, 47763, 47764, 47766, 47768, 47770, 47773, 47774, 47776, 47779, 47780, 47783, 47784, 47787, 47468,
    47469, 47472, 47791, 47793, 47795, 47798, 47800, 47802, 47804, 47806, 47808, 47811, 47813, 47815, 47817, 47819,
    47821, 47824, 47456, 62761, 62758, 62763, 62759, 62765, 62767, 62771, 88350, 62776,
]
# board.portal2.sr's matching window when the two co-op halves were logged at different times.
COOP_TIME_WINDOW = datetime.timedelta(hours=3)


def log(msg):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {msg}", flush=True)


def mysql_connect(url):
    u = urlparse(url)
    return mysql.connector.connect(
        host=u.hostname, port=u.port or 3306, user=unquote(u.username or "root"),
        password=unquote(u.password or ""), database=u.path.lstrip("/"), charset="utf8mb4",
        # A collation both MySQL 8 and MariaDB know (the connector defaults to MySQL-only utf8mb4_0900_ai_ci).
        collation="utf8mb4_general_ci",
    )


def rows(conn, sql):
    cur = conn.cursor(dictionary=True)
    cur.execute(sql)
    out = cur.fetchall()
    cur.close()
    return out


def trunc(value, length, counter, key):
    if value is not None and len(value) > length:
        counter[key] += 1
        return value[:length]
    return value


class Importer:
    def __init__(self, pg, p2, mel, demo_players=None, demo_hosts=None):
        self.pg, self.p2, self.mel = pg, p2, mel
        # Portal 2 changelog id -> [(steam_id, name), ...] read from the run's co-op demo,
        # and -> steam id of the player who hosted (and so played blue).
        self.demo_players = demo_players or {}
        self.demo_hosts = demo_hosts or {}
        # Players banned on the mel board but not on board.portal2.sr: their account stays
        # unbanned and only their Mel runs are banned (one account covers both games).
        self.mel_only_bans = set()
        self.cur = pg.cursor()
        self.report = defaultdict(int)
        self.next_demo_id = 1
        self.categories = {}  # steam_id -> category id
        self.map_names = {}  # steam_id -> name

    def insert(self, table, columns, values):
        if values:
            execute_values(self.cur, f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s", values, page_size=BATCH)

    # --- reference data -------------------------------------------------------

    def reference(self):
        log("games, countries, evidence requirements")
        self.insert("games", ["id", "game_name", "slug", "sort_order"], GAMES)
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "countries.sql"), encoding="utf-8") as fp:
            self.cur.execute(fp.read())
        evidence = rows(self.p2, "SELECT * FROM evidence_requirements")
        self.insert(
            "evidence_requirements", ["id", "rank", "demo", "video", "active", "timestamp", "closed_timestamp"],
            [(e["id"], e["rank"], bool(e["demo"]), bool(e["video"]), bool(e["active"]), e["timestamp"], e["closed_timestamp"]) for e in evidence],
        )

    # --- chapters, maps, categories --------------------------------------------

    def add_category(self, steam_id, category_id):
        self.insert("category_rules", ["id", "is_active"], [(category_id, True)])
        self.insert("categories", ["id", "name", "map_id", "rules_id"], [(category_id, "any%", str(steam_id), category_id)])
        self.categories[str(steam_id)] = category_id

    def p2_structure(self):
        log("Portal 2 chapters, maps, categories")
        chapters = rows(self.p2, "SELECT * FROM chapters ORDER BY id")
        self.insert(
            "chapters", ["id", "chapter_name", "is_multiplayer", "game_id", "game_mode"],
            [(c["id"], c["chapter_name"], bool(c["is_multiplayer"]), P2_GAME, "coop" if c["is_multiplayer"] else "sp") for c in chapters],
        )
        maps = rows(self.p2, "SELECT * FROM maps ORDER BY id")
        self.insert(
            "maps", ["id", "steam_id", "lp_id", "name", "chapter_id", "is_public"],
            [(m["id"], m["steam_id"], m["lp_id"], m["name"], m["chapter_id"], bool(m["is_public"])) for m in maps],
        )
        for m in maps:
            self.map_names[m["steam_id"]] = m["name"]
        for i, steam_id in enumerate(COOP_MAP_IDS + SP_MAP_IDS, start=1):
            self.add_category(steam_id, i)
        self.coop_maps = {m["steam_id"] for m in maps if m["is_coop"]}

    def mel_structure(self):
        log("Mel chapters, maps, categories")
        self.cur.execute("SELECT COALESCE(MAX(id), 0) FROM chapters")
        chapter_base = self.cur.fetchone()[0]
        self.cur.execute("SELECT COALESCE(MAX(id), 0) FROM maps")
        map_base = self.cur.fetchone()[0]
        maps = rows(self.mel, "SELECT * FROM maps ORDER BY id")
        # melboard reuses maps.is_coop to mark Advanced Mode maps.
        advanced_chapters = {m["chapter_id"] for m in maps if m["is_coop"]}
        # The Mel board has an empty Advanced "1952" chapter (Advanced mode starts at Extended
        # Relaxation); chapters without maps are left out.
        used = {m["chapter_id"] for m in maps}
        chapters = [c for c in rows(self.mel, "SELECT * FROM chapters ORDER BY id") if c["id"] in used]
        self.mel_chapter_ids = {c["id"]: chapter_base + i for i, c in enumerate(chapters, start=1)}
        self.insert(
            "chapters", ["id", "chapter_name", "is_multiplayer", "game_id", "game_mode"],
            [
                (self.mel_chapter_ids[c["id"]], c["chapter_name"], False, MEL_GAME, "advanced" if c["id"] in advanced_chapters else "story")
                for c in chapters
            ],
        )
        self.insert(
            "maps", ["id", "steam_id", "lp_id", "name", "chapter_id", "is_public"],
            [
                (map_base + i, m["steam_id"], m["lp_id"], m["name"], self.mel_chapter_ids[m["chapter_id"]], bool(m["is_public"]))
                for i, m in enumerate(maps, start=1)
            ],
        )
        self.cur.execute("SELECT COALESCE(MAX(id), 0) FROM categories")
        category_base = self.cur.fetchone()[0]
        for i, m in enumerate(maps, start=1):
            self.map_names[m["steam_id"]] = m["name"]
            self.add_category(m["steam_id"], category_base + i)
        self.mel_maps = {m["steam_id"] for m in maps}

    def default_categories(self):
        self.cur.execute("UPDATE maps SET default_cat_id = categories.id FROM categories WHERE categories.map_id = maps.steam_id")

    # --- users --------------------------------------------------------------------

    def users(self, extra_profiles):
        log("users")
        merged = {}
        fill = ["boardname", "steamname", "avatar", "twitch", "youtube", "title", "donation_amount", "auth_hash"]
        for u in rows(self.p2, "SELECT * FROM usersnew"):
            merged[u["profile_number"]] = dict(u)
        for u in rows(self.mel, "SELECT * FROM users"):
            existing = merged.get(u["profile_number"])
            if existing is None:
                merged[u["profile_number"]] = dict(u)
                self.report["users only on mel board"] += 1
            else:
                self.report["users on both boards"] += 1
                for key in fill:
                    if existing.get(key) in (None, "") and u.get(key) not in (None, ""):
                        existing[key] = u[key]
                if u["banned"] and not existing["banned"]:
                    self.mel_only_bans.add(u["profile_number"])
                    self.report["players banned on the mel board only (Mel runs banned, account kept)"] += 1
                existing["admin"] = max(existing["admin"], u["admin"])
        for pn in extra_profiles - merged.keys():
            # Referenced by changelog rows but missing from the source users tables.
            merged[pn] = {"profile_number": pn, "banned": 0, "registered": 0, "admin": 0}
            self.report["placeholder users for orphaned runs"] += 1
        merged.setdefault(FILLER_USER, {"profile_number": FILLER_USER, "banned": 0, "registered": 0, "admin": 0})
        for players in self.demo_players.values():
            for steam_id, name in players:
                if steam_id not in merged:
                    # A co-op partner who never had an account on either board.
                    merged[steam_id] = {"profile_number": steam_id, "steamname": name or None, "banned": 0, "registered": 0, "admin": 0}
                    self.report["users added from co-op demos"] += 1
        t = self.report
        self.insert(
            "users",
            ["profile_number", "board_name", "steam_name", "banned", "registered", "avatar", "twitch", "youtube", "title", "admin", "donation_amount", "auth_hash"],
            [
                (
                    u["profile_number"], trunc(u.get("boardname"), 50, t, "board names truncated to 50"),
                    trunc(u.get("steamname"), 50, t, "steam names truncated to 50"), bool(u.get("banned")), u.get("registered") or 0,
                    u.get("avatar"), u.get("twitch"), u.get("youtube"), u.get("title"), u.get("admin") or 0, u.get("donation_amount"), u.get("auth_hash"),
                )
                for u in merged.values()
            ],
        )
        self.banned_users = {pn for pn, u in merged.items() if u.get("banned")}
        # The old boards' admins become admins in the staff tiers.
        self.cur.execute("UPDATE users SET role = 'admin' WHERE admin > 0")

    # --- changelog ---------------------------------------------------------------

    def demo_for(self, row, new_id, verified):
        if not row["has_demo"]:
            return None
        demo_id = self.next_demo_id
        self.next_demo_id += 1
        name = (self.map_names.get(row["map_id"]) or row["map_id"]).replace(" ", "")
        self.demo_rows.append((demo_id, f"{name}_{row['score']}_{row['profile_number']}_{demo_id}.dem", None, verified, None, new_id))
        return demo_id

    def convert(self, source_rows, game_id, valid_maps, id_of, banned_players=frozenset()):
        scores = {r["id"]: r["score"] for r in source_rows}
        out, legacy = [], []
        for r in source_rows:
            if r["map_id"] not in valid_maps:
                self.report[f"game {game_id}: runs on maps not on the board (skipped)"] += 1
                continue
            new_id = id_of(r["id"])
            verified = not r["pending"]
            previous = r["previous_id"]
            score_delta = r["score"] - scores[previous] if previous in scores else None
            if score_delta is not None and not -INT_MAX <= score_delta <= INT_MAX:
                # Some old rows carry INT_MIN as a junk score; their delta doesn't fit an integer.
                self.report[f"game {game_id}: score deltas dropped (overflow)"] += 1
                score_delta = None
            out.append((
                new_id, r["time_gained"], r["profile_number"], r["score"], r["map_id"], self.demo_for(r, new_id, verified),
                bool(r["banned"]) or r["profile_number"] in banned_players, r["youtube_id"], id_of(previous) if previous in scores else None, None, r["post_rank"],
                r["pre_rank"], r["submission"], unescape_note(r["note"]), self.categories[r["map_id"]], score_delta, verified, None,
                r["autorender_id"],
            ))
            legacy.append((game_id, r["id"], new_id))
        return out, legacy

    CHANGELOG_COLUMNS = [
        "id", "timestamp", "profile_number", "score", "map_id", "demo_id", "banned", "youtube_id", "previous_id", "coop_id",
        "post_rank", "pre_rank", "submission", "note", "category_id", "score_delta", "verified", "admin_note", "autorender_id",
    ]

    def changelogs(self):
        log("reading changelogs")
        self.p2_rows = rows(self.p2, "SELECT * FROM changelog ORDER BY id")
        mel_rows = rows(self.mel, "SELECT * FROM changelog ORDER BY id")
        self.mel_offset = max((r["id"] for r in self.p2_rows), default=0)
        profiles = {r["profile_number"] for r in self.p2_rows} | {r["profile_number"] for r in mel_rows}
        self.users(profiles)

        self.demo_rows = []
        p2_out, p2_legacy = self.convert(self.p2_rows, P2_GAME, set(self.map_names) - self.mel_maps, lambda i: i)
        mel_out, mel_legacy = self.convert(mel_rows, MEL_GAME, self.mel_maps, lambda i: self.mel_offset + i, self.mel_only_bans)
        log(f"inserting {len(self.demo_rows)} demos")
        self.insert("demos", ["id", "file_id", "partner_name", "parsed_successfully", "sar_version", "cl_id"], self.demo_rows)
        log(f"inserting {len(p2_out)} Portal 2 and {len(mel_out)} Mel changelog rows")
        self.insert("changelog", self.CHANGELOG_COLUMNS, p2_out + mel_out)
        self.insert("legacy_changelog_ids", ["game_id", "legacy_id", "changelog_id"], p2_legacy + mel_legacy)
        self.report["Portal 2 runs imported"] = len(p2_out)
        self.report["Mel runs imported"] = len(mel_out)
        self.report["runs with autorender videos"] = sum(1 for r in p2_out + mel_out if r[-1])

    # --- co-op bundling ---------------------------------------------------------

    def coop(self):
        """Pair each Portal 2 co-op run with its partner's run. Runs whose demo shows the
        partner are paired with that partner's matching run (see coop_halves_match), or
        with the partner alone when they have none. The rest are matched as pgscript.py
        did (same map and score, logged at the same time, else within COOP_TIME_WINDOW).
        Runs without a partner run are paired with a per-map filler entry."""
        log("bundling co-op runs")
        valid = [
            r for r in self.p2_rows
            if r["map_id"] in self.coop_maps and not r["banned"] and r["profile_number"] not in self.banned_users
        ]
        # Time matching needs a timestamp; a demo identifies the partner without one.
        eligible = [r for r in valid if r["time_gained"] is not None]
        by_key = defaultdict(list)
        for r in eligible:
            by_key[(r["map_id"], r["score"])].append(r)
        by_player_map = defaultdict(list)
        for r in valid:
            by_player_map[(r["profile_number"], r["map_id"])].append(r)
        done = set()
        bundles = []  # (p_id1, p_id2, cl_id1, cl_id2)
        ordered = sorted(eligible, key=lambda x: (x["time_gained"], x["id"]))
        undated = sorted((r for r in valid if r["time_gained"] is None), key=lambda x: x["id"])

        # First, the partners the demos show.
        for r in ordered + undated:
            partner_id = self.demo_partner(r)
            if r["id"] in done or partner_id is None:
                continue
            runs = [o for o in by_player_map[(partner_id, r["map_id"])] if o["id"] not in done and coop_halves_match(r, o)]
            if runs:
                partner = min(runs, key=lambda o: (abs(o["score"] - r["score"]), time_apart(r, o)))
                bundles.append((r["profile_number"], partner_id, r["id"], partner["id"]))
                done.update((r["id"], partner["id"]))
                self.report["co-op runs paired from demos"] += 2
            else:
                # The partner never submitted this run; record them with the filler run.
                bundles.append((r["profile_number"], partner_id, r["id"], None))
                done.add(r["id"])
                self.report["co-op runs given their demo partner (partner has no run)"] += 1

        # Then time matching for runs without demo data.
        for r in ordered:
            if r["id"] in done:
                continue
            others = [o for o in by_key[(r["map_id"], r["score"])] if o["id"] != r["id"] and o["id"] not in done and o["profile_number"] != r["profile_number"]]
            exact = [o for o in others if o["time_gained"] == r["time_gained"]]
            near = exact or [o for o in others if abs(o["time_gained"] - r["time_gained"]) <= COOP_TIME_WINDOW]
            if len(near) == 1:
                partner = near[0]
                bundles.append((r["profile_number"], partner["profile_number"], r["id"], partner["id"]))
                done.update((r["id"], partner["id"]))
            elif not near:
                bundles.append((r["profile_number"], None, r["id"], None))
                done.add(r["id"])
            else:
                # Several candidate partners; pgscript logged these to Invalid.txt and left them unbundled.
                self.report["co-op runs with ambiguous partners (left unbundled)"] += 1
                done.add(r["id"])

        # Filler entries for unmatched runs.
        self.cur.execute("SELECT MAX(id) FROM changelog")
        next_id = self.cur.fetchone()[0]
        filler = {}
        filler_rows = []
        for steam_id in sorted(self.coop_maps):
            next_id += 1
            filler[steam_id] = next_id
            filler_rows.append((next_id, FILLER_USER, 0, True, steam_id, self.categories[steam_id]))
        self.insert("changelog", ["id", "profile_number", "score", "verified", "map_id", "category_id"], filler_rows)
        map_of = {r["id"]: r["map_id"] for r in valid}

        bundle_rows, links = [], []
        for i, (p1, p2, cl1, cl2) in enumerate(bundles, start=1):
            partner_has_run = cl2 is not None
            if not partner_has_run:
                cl2 = filler[map_of[cl1]]
                if p2 is None:
                    p2 = FILLER_USER
                    self.report["co-op runs paired with filler"] += 1
            else:
                self.report["co-op runs paired"] += 2
            bundle_rows.append((i, p1, p2, self.p1_is_host(p1, p2, cl1, cl2 if partner_has_run else None), cl1, cl2))
            links.append((cl1, i))
            if partner_has_run:
                links.append((cl2, i))
        self.insert("coop_bundled", ["id", "p_id1", "p_id2", "p1_is_host", "cl_id1", "cl_id2"], bundle_rows)
        self.cur.execute("CREATE TEMP TABLE coop_links (cl_id bigint PRIMARY KEY, coop_id bigint) ON COMMIT DROP")
        self.insert("coop_links", ["cl_id", "coop_id"], links)
        self.cur.execute("UPDATE changelog SET coop_id = coop_links.coop_id FROM coop_links WHERE changelog.id = coop_links.cl_id")

    def p1_is_host(self, p1, p2, cl1, cl2):
        """Whether p1 hosted (played blue), from either half's demo; None when unknown."""
        host = self.demo_hosts.get(cl1) or self.demo_hosts.get(cl2)
        if host == p1:
            self.report["co-op pairs with host known from demos"] += 1
            return True
        if host == p2:
            self.report["co-op pairs with host known from demos"] += 1
            return False
        return None

    def demo_partner(self, run):
        """The other player in the run's demo, if the demo shows the submitter and one partner."""
        players = [sid for sid, _ in self.demo_players.get(run["id"], [])]
        if run["profile_number"] not in players:
            return None
        others = [sid for sid in players if sid != run["profile_number"]]
        return others[0] if len(others) == 1 else None

    def map_bsp_names(self):
        """Map file names for matching submitted demos (see migrations/20261020000000_map_bsp_names.sql)."""
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations", "20261020000000_map_bsp_names.sql")
        with open(path, encoding="utf-8") as f:
            self.cur.execute(f.read())

    def reset_sequences(self):
        for table in ["changelog", "demos", "categories", "category_rules", "chapters", "maps", "coop_bundled", "games", "countries", "evidence_requirements"]:
            self.cur.execute("SELECT pg_get_serial_sequence(%s, 'id')", (table,))
            seq = self.cur.fetchone()[0]
            if seq:
                self.cur.execute(f"SELECT setval(%s, COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)", (seq,))

    def run(self):
        self.reference()
        self.p2_structure()
        self.mel_structure()
        self.default_categories()
        self.map_bsp_names()
        self.changelogs()
        self.coop()
        self.reset_sequences()


# The two halves of a co-op run can be logged a tick or two apart.
COOP_SCORE_TOLERANCE = 3  # centiseconds
COOP_TOLERANT_WINDOW = datetime.timedelta(days=1)
FAR = datetime.timedelta(days=100000)


def time_apart(a, b):
    if a["time_gained"] is None or b["time_gained"] is None:
        return FAR
    return abs(a["time_gained"] - b["time_gained"])


def coop_halves_match(run, other):
    """Whether `other` (the demo partner's run) can be the other half of `run`: the same
    score, or within COOP_SCORE_TOLERANCE when logged within COOP_TOLERANT_WINDOW."""
    diff = abs(run["score"] - other["score"])
    return diff == 0 or (diff <= COOP_SCORE_TOLERANCE and time_apart(run, other) <= COOP_TOLERANT_WINDOW)


NOTE_ESCAPE = re.compile(r"""\\(['"\\])""")


def unescape_note(note):
    """The old boards stored submission comments PHP-escaped (a backslash before quotes and
    backslashes); store them as typed."""
    return NOTE_ESCAPE.sub(r"\1", note) if note else note


def load_demo_players(path):
    """For demos with two players: changelog id -> [(steam_id, name), ...], and
    changelog id -> host steam id (where the host is known)."""
    players, hosts = {}, {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["steam_id1"] and row["steam_id2"]:
                cl_id = int(row["changelog_id"])
                players[cl_id] = [(row["steam_id1"], row["name1"]), (row["steam_id2"], row["name2"])]
                if row.get("host_steam_id"):
                    hosts[cl_id] = row["host_steam_id"]
    log(f"demo players for {len(players)} co-op runs ({len(hosts)} with the host known)")
    return players, hosts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--p2", required=True, help="mysql://user:pass@host:port/db of board.portal2.sr")
    parser.add_argument("--mel", required=True, help="mysql://user:pass@host:port/db of the mel board")
    parser.add_argument("--pg", required=True, help="postgresql://user:pass@host:port/db (empty v2 schema)")
    parser.add_argument("--demo-players", help="CSV from parse_demo_players.py: co-op partners read from demos")
    args = parser.parse_args()

    pg = psycopg2.connect(args.pg)
    p2, mel = mysql_connect(args.p2), mysql_connect(args.mel)
    importer = Importer(pg, p2, mel, *(load_demo_players(args.demo_players) if args.demo_players else ()))
    importer.cur.execute("SELECT COUNT(*) FROM changelog")
    if importer.cur.fetchone()[0]:
        sys.exit("Target changelog is not empty; import into a fresh database.")
    try:
        importer.run()
        pg.commit()
    except Exception:
        pg.rollback()
        raise
    log("done")
    for key, value in sorted(importer.report.items()):
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
