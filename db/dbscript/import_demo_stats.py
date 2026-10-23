"""Load portal counts read from the archived board demos into changelog.portals.

Takes the CSVs written by server/demo-parser/demo_stats.mjs (one per game, from the demo
archives downloaded from the old boards):

  changelog_id, map, time_score, portal_score, error

changelog_id there is the old board's id; legacy_changelog_ids maps it to the run. A count is
only stored when the demo's scoreboard time matches the run's time, so a demo filed under the
wrong run can't attach its numbers to it.

Usage:
  python import_demo_stats.py --db postgresql://... --p2 demo_stats_p2.csv [--mel demo_stats_mel.csv]
"""
import argparse
import csv
import io

import psycopg2

P2_GAME = 1
MEL_GAME = 2


def rows(path, game):
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["portal_score"] and r["time_score"] and r["changelog_id"].isdigit():
                yield game, int(r["changelog_id"]), int(r["time_score"]), int(r["portal_score"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True)
    ap.add_argument("--p2")
    ap.add_argument("--mel")
    args = ap.parse_args()
    data = []
    if args.p2:
        data += rows(args.p2, P2_GAME)
    if args.mel:
        data += rows(args.mel, MEL_GAME)
    db = psycopg2.connect(args.db)
    cur = db.cursor()
    cur.execute("CREATE TEMP TABLE demo_stats (game_id integer, legacy_id bigint, time_score integer, portals integer)")
    buf = io.StringIO("".join(f"{g}\t{i}\t{t}\t{p}\n" for g, i, t, p in data))
    cur.copy_from(buf, "demo_stats")
    cur.execute(
        """
        UPDATE changelog AS cl SET portals = LEAST(s.portals, 32767)
        FROM demo_stats AS s JOIN legacy_changelog_ids AS l ON l.game_id = s.game_id AND l.legacy_id = s.legacy_id
        WHERE cl.id = l.changelog_id AND cl.score = s.time_score AND cl.portals IS DISTINCT FROM LEAST(s.portals, 32767)
        """
    )
    updated = cur.rowcount
    db.commit()
    print(f"{len(data)} demos with a scoreboard; portal counts stored for {updated} runs")


if __name__ == "__main__":
    main()
