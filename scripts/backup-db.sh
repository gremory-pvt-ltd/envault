#!/usr/bin/env bash
#
# Encrypted SQLite backup for envault.
#
#   ENVAULT_AGE_RECIPIENT=age1... ./scripts/backup-db.sh
#
# Requires: sqlite3, age.
# The private age key must live OFF this server (password manager / offline).
set -euo pipefail

DB="${ENVAULT_DB:-/var/lib/envault/envault.db}"
DEST="${ENVAULT_BACKUP_DIR:-/var/backups/envault}"
RETENTION_DAYS="${ENVAULT_BACKUP_RETENTION:-30}"
RECIPIENT="${ENVAULT_AGE_RECIPIENT:-}"

if [[ -z "$RECIPIENT" ]]; then
  echo "error: set ENVAULT_AGE_RECIPIENT to an age public key" >&2
  exit 1
fi

if [[ ! -f "$DB" ]]; then
  echo "error: database not found at $DB" >&2
  exit 1
fi

install -d -m 700 "$DEST"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
TMP="$(mktemp "$DEST/.envault-backup.XXXXXX.db")"
trap 'rm -f "$TMP"' EXIT

echo "[backup] integrity check"
CHECK="$(sqlite3 "$DB" 'PRAGMA integrity_check;')"
if [[ "$CHECK" != "ok" ]]; then
  echo "error: integrity check failed: $CHECK" >&2
  exit 1
fi

echo "[backup] sqlite online backup -> $TMP"
sqlite3 "$DB" ".backup '$TMP'"

echo "[backup] encrypting with age"
age --encrypt --recipient "$RECIPIENT" --output "$DEST/envault-$STAMP.db.age" "$TMP"

echo "[backup] pruning older than ${RETENTION_DAYS} days"
find "$DEST" -maxdepth 1 -name 'envault-*.db.age' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] done: $DEST/envault-$STAMP.db.age"
