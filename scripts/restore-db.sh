#!/usr/bin/env bash
# Replaces the board's database with a dump, then restarts the web server.
#   ./scripts/restore-db.sh path/to/p2boards.dump   (pg_dump -Fc custom format, or a plain .sql file)
set -euo pipefail

dump=${1:?usage: $0 <dump file (.dump or .sql)>}
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 1; }
dump=$(realpath "$dump")
cd "$(dirname "$0")/.."

read -r -p "This deletes everything in the p2boards database and loads $dump. Continue? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }

psql() { docker compose exec -T db psql -U docker -d p2boards -v ON_ERROR_STOP=1 -q "$@"; }

docker compose up -d --wait db
docker compose stop server
psql -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
if [ "$(head -c 5 "$dump")" = "PGDMP" ]; then
  docker compose exec -T db pg_restore -U docker -d p2boards --no-owner --no-privileges < "$dump"
else
  psql < "$dump"
fi
# pg_restore doesn't collect planner statistics; without them some pages take seconds to load.
psql -c "ANALYZE;"
docker compose up -d
echo "Restored $dump."
