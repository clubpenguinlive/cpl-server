#!/usr/bin/env bash
# Nightly DB backup (cron 03:30). Deployed to /opt/yukon/backup-db.sh on prod.
# Dumps to /opt/backups (keeps newest 14); Syncthing carries /opt/backups -> Zima RAID offsite
# (send-only, continuous, 1yr staggered versioning). Credentials come from /opt/backups/.my.cnf
# (gitignored, never in this repo).
set -euo pipefail
DIR=/opt/backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DIR/clubpenguinlive-$STAMP.sql.gz"
mysqldump --defaults-file="$DIR/.my.cnf" --single-transaction --quick --routines --triggers clubpenguinlive | gzip -9 > "$OUT"
# retention: keep newest 14, delete the rest
ls -1t "$DIR"/clubpenguinlive-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "$(date '+%Y-%m-%d %H:%M:%S') backup -> $OUT ($(du -h "$OUT" | cut -f1))"
