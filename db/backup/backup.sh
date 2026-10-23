#!/usr/bin/env bash
# Daily dumps of the board's database into /backups, in pg_dump's custom format (restore with pg_restore, as in
# README.md). Runs at BACKUP_AT (UTC) every day, and once at start when there's no dump from today yet. Keeps the
# KEEP_DAILY newest dumps, plus the first dump of each month for KEEP_MONTHLY months.
set -uo pipefail

export PGPASSWORD="$POSTGRES_PASSWORD"
HOST="${POSTGRES_HOST:-db}"
AT="${BACKUP_AT:-04:00}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') backup: $*"; }

dump() {
    local file="/backups/p2boards-$(date -u +%Y-%m-%d_%H%M).dump"
    if pg_dump -h "$HOST" -U "$POSTGRES_USER" -Fc --no-owner --no-privileges -f "$file.part" p2boards; then
        mv "$file.part" "$file"
        log "saved $file ($(du -h "$file" | cut -f1))"
    else
        rm -f "$file.part"
        log "FAILED, the previous dumps are kept" >&2
        return
    fi
    # Newest first: the KEEP_DAILY newest, and of each month only its first dump, for KEEP_MONTHLY months.
    mapfile -t all < <(ls -1 /backups/p2boards-*.dump 2>/dev/null | sort -r)
    local keep
    keep=$(
        printf '%s\n' "${all[@]:0:$KEEP_DAILY}"
        printf '%s\n' "${all[@]}" | sort | awk -F'[-_]' '!seen[$2 "-" $3]++' | sort -r | head -n "$KEEP_MONTHLY"
    )
    for f in "${all[@]}"; do
        grep -qxF "$f" <<<"$keep" || { rm -f "$f"; log "removed old $f"; }
    done
}

until pg_isready -q -h "$HOST" -U "$POSTGRES_USER"; do sleep 5; done
ls /backups/p2boards-"$(date -u +%Y-%m-%d)"_*.dump > /dev/null 2>&1 || dump

while true; do
    now=$(date -u +%s)
    next=$(date -u -d "today $AT" +%s)
    [ "$next" -le "$now" ] && next=$(date -u -d "tomorrow $AT" +%s)
    log "next at $(date -u -d "@$next" '+%Y-%m-%d %H:%M') UTC"
    sleep $((next - now))
    dump
done
