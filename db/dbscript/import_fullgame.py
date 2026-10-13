#!/usr/bin/env python3
"""Copy the full-game boards from a PortalRex/fullgame-boards database into the v2 schema.

fullgame-boards keeps speedrun.com data (imported there by util/importSrc.php) in fg_*
tables next to the old board's tables. This copies those tables one-to-one, keeping IDs so
run and runner links stay the same, then resets the Postgres sequences.

Usage:
  python import_fullgame.py \
      --source mysql://user:pass@host:3306/iverborg_leaderboard \
      --pg     postgresql://user:pass@host:5432/p2boards

The target's fg_* tables must be empty (schema.sql or migrations/20261013000000_fullgame.sql).
Requires mysql-connector-python and psycopg2.
"""
import argparse
import sys
from urllib.parse import unquote, urlparse

import mysql.connector
import psycopg2
from psycopg2.extras import execute_values

# Parents before children. Columns are listed explicitly so the copy fails loudly if either
# schema drifts.
TABLES = [
    ("fg_games", ["id", "slug", "name", "src_id", "sort"]),
    ("fg_categories", ["id", "game_id", "slug", "name", "type", "players", "rules", "demo_rank", "video_required", "miscellaneous", "src_id", "sort"]),
    ("fg_levels", ["id", "game_id", "slug", "name", "src_id", "sort"]),
    ("fg_variables", ["id", "game_id", "category_id", "level_id", "name", "scope", "is_subcategory", "mandatory", "src_id", "sort"]),
    ("fg_variable_values", ["id", "variable_id", "label", "slug", "src_id", "sort"]),
    ("fg_runners", ["id", "profile_number", "src_user_id", "src_guest_name", "name"]),
    ("fg_runs", [
        "id", "category_id", "level_id", "time_ms", "run_date", "submitted_at", "submitted_by", "status", "examiner",
        "examiner_name", "examined_at", "reject_reason", "comment", "video_url", "demo_url", "demo_file", "demo_file_bytes", "src_id",
    ]),
    ("fg_run_runners", ["run_id", "runner_id", "position"]),
    ("fg_run_values", ["run_id", "variable_id", "value_id"]),
    ("fg_moderators", ["id", "profile_number", "game_id", "category_id"]),
    ("fg_run_events", ["id", "run_id", "action", "actor", "note", "created_at"]),
    ("fg_admin_events", ["id", "game_id", "actor", "action", "detail", "created_at"]),
]
# MySQL TINYINT(1) columns that are booleans in Postgres.
BOOLEANS = {"video_required", "miscellaneous", "is_subcategory", "mandatory"}


def mysql_connect(url):
    u = urlparse(url)
    return mysql.connector.connect(
        host=u.hostname, port=u.port or 3306, user=unquote(u.username or "root"),
        password=unquote(u.password or ""), database=u.path.lstrip("/"), charset="utf8mb4",
        collation="utf8mb4_general_ci",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True, help="mysql://user:pass@host:port/db of fullgame-boards")
    parser.add_argument("--pg", required=True, help="postgresql://user:pass@host:port/db (v2 schema)")
    args = parser.parse_args()

    src = mysql_connect(args.source)
    pg = psycopg2.connect(args.pg)
    cur = pg.cursor()
    cur.execute("SELECT COUNT(*) FROM fg_runs")
    if cur.fetchone()[0]:
        sys.exit("Target fg_runs is not empty; import into empty full-game tables.")

    try:
        for table, columns in TABLES:
            s = src.cursor()
            s.execute(f"SELECT {', '.join(columns)} FROM {table}")
            rows = [
                tuple(bool(v) if columns[i] in BOOLEANS and v is not None else v for i, v in enumerate(row))
                for row in s.fetchall()
            ]
            s.close()
            if rows:
                execute_values(cur, f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s", rows, page_size=5000)
            print(f"  {table}: {len(rows)}")
            if "id" in columns:
                cur.execute(
                    f"SELECT setval(pg_get_serial_sequence(%s, 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)",
                    (table,),
                )
        pg.commit()
    except Exception:
        pg.rollback()
        raise
    print("done")


if __name__ == "__main__":
    main()
