#!/usr/bin/env python3
"""Copy run data held by autorender (autorender.portal2.sr) into the v2 changelog.

autorender renders board demos and keeps, per video, the board changelog ID it came from,
the SAR mtrigger segments it read from the demo, and the share ID the video is served
under. This fills, for each run autorender has a video of:

  changelog.segments       the demo's mtrigger segments (replaced on every run of the script)
  changelog.autorender_id  the video's share ID

autorender is the source of truth for its videos, so autorender_id values that don't name a
live autorender video are cleared: the boards being replaced kept IDs of videos autorender
has since removed, which would otherwise show as broken players.

Runs are matched through legacy_changelog_ids (filled by import_boards.py), so import the
boards first. Share IDs come only from live, finished videos. Segments describe the demo, not
the video, so they're also taken from videos autorender has since deleted (its cleanup of
broken videos and non-PB runs), except ones deleted because the demo itself was broken.

Usage:
  python import_autorender.py \
      --source mysql://user:pass@host:3306/p2render \
      --pg     postgresql://user:pass@host:5432/p2boards

Requires mysql-connector-python and psycopg2.
"""
import argparse
import json
from urllib.parse import unquote, urlparse

import mysql.connector
import psycopg2
from psycopg2.extras import execute_values

# autorender's videos.board_source -> games.id here.
BOARD_GAMES = {1: 1, 2: 2}  # 1 = board.portal2.sr (Portal 2), 2 = Mel board


def mysql_connect(url):
    u = urlparse(url)
    return mysql.connector.connect(
        host=u.hostname, port=u.port or 3306, user=unquote(u.username or "root"),
        password=unquote(u.password or ""), database=u.path.lstrip("/"), charset="utf8mb4",
        collation="utf8mb4_general_ci",
    )


def segments_from(metadata):
    """Keep only the segment list (name / ticks / splits) from videos.demo_metadata."""
    if not metadata:
        return None
    try:
        segments = json.loads(metadata).get("segments")
    except (ValueError, AttributeError):
        return None
    if not segments:
        return None
    return [
        {
            "name": s.get("name", ""),
            "ticks": int(s.get("ticks") or 0),
            "splits": [{"name": sp.get("name", ""), "ticks": int(sp.get("ticks") or 0)} for sp in s.get("splits") or []],
        }
        for s in segments
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True, help="mysql://user:pass@host:port/db of autorender")
    parser.add_argument("--pg", required=True, help="postgresql://user:pass@host:port/db (v2 schema)")
    args = parser.parse_args()

    src = mysql_connect(args.source)
    s = src.cursor()
    s.execute(
        """
        SELECT board_source, board_changelog_id, demo_metadata, demo_tickrate,
               CASE WHEN deleted_at IS NULL AND pending = 0 AND video_url IS NOT NULL THEN share_id END AS live_share_id
          FROM videos
         WHERE board_source IN (%s) AND board_changelog_id IS NOT NULL
           AND (deleted_reason IS NULL OR deleted_reason NOT LIKE 'Demo is broken%%')
        """ % ", ".join(str(k) for k in BOARD_GAMES)
    )
    rows = s.fetchall()
    s.execute("SELECT share_id FROM videos WHERE share_id IS NOT NULL AND deleted_at IS NULL AND pending = 0 AND video_url IS NOT NULL")
    live_share_ids = [(r[0],) for r in s.fetchall()]
    src.close()

    pg = psycopg2.connect(args.pg)
    cur = pg.cursor()
    cur.execute("SELECT game_id, legacy_id, changelog_id FROM legacy_changelog_ids")
    by_legacy = {(g, l): c for g, l, c in cur.fetchall()}

    updates, unmatched, other_tickrate = [], 0, 0
    for board_source, legacy_id, metadata, tickrate, share_id in rows:
        changelog_id = by_legacy.get((BOARD_GAMES[board_source], legacy_id))
        if changelog_id is None:
            unmatched += 1
            continue
        segments = segments_from(metadata)
        # The boards show segments at 60 ticks/s; anything else would display wrong.
        if segments and tickrate not in (None, 60):
            other_tickrate += 1
            segments = None
        updates.append((changelog_id, share_id, json.dumps(segments) if segments else None))

    try:
        cur.execute("CREATE TEMP TABLE ar_import (changelog_id bigint PRIMARY KEY, share_id varchar(11), segments jsonb)")
        execute_values(cur, "INSERT INTO ar_import VALUES %s", updates, page_size=5000)
        cur.execute(
            """
            UPDATE changelog AS cl SET segments = a.segments
              FROM ar_import AS a
             WHERE cl.id = a.changelog_id AND a.segments IS NOT NULL
            """
        )
        with_segments = cur.rowcount
        cur.execute(
            """
            UPDATE changelog AS cl SET autorender_id = a.share_id
              FROM ar_import AS a
             WHERE cl.id = a.changelog_id AND a.share_id IS NOT NULL
               AND cl.autorender_id IS DISTINCT FROM a.share_id
            """
        )
        set_ids = cur.rowcount
        cur.execute("CREATE TEMP TABLE ar_live (share_id varchar(11) PRIMARY KEY)")
        execute_values(cur, "INSERT INTO ar_live VALUES %s ON CONFLICT DO NOTHING", live_share_ids, page_size=10000)
        cur.execute(
            """
            UPDATE changelog AS cl SET autorender_id = NULL
             WHERE cl.autorender_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM ar_live AS l WHERE l.share_id = cl.autorender_id)
            """
        )
        cleared_ids = cur.rowcount
        pg.commit()
    except Exception:
        pg.rollback()
        raise
    finally:
        pg.close()

    print(f"  videos read: {len(rows)}")
    print(f"  matched to runs: {len(updates)} (no matching run: {unmatched})")
    print(f"  runs with segments: {with_segments}" + (f" (skipped {other_tickrate} at another tickrate)" if other_tickrate else ""))
    print(f"  autorender ids set or corrected: {set_ids}")
    print(f"  autorender ids cleared (no live video): {cleared_ids}")


if __name__ == "__main__":
    main()
