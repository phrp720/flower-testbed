#!/usr/bin/env bash
# Fails when scripts/schema/schema.sql (the production DDL artifact, mounted into
# postgres as docker-entrypoint-initdb.d) has drifted from the Drizzle schema.
#
# Development uses `pnpm db:push`, which never touches schema.sql, so the two can
# diverge silently. Run this in CI.
set -euo pipefail

cd "$(dirname "$0")/.."

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cp -R lib/db/migrations "$TMP_DIR/migrations-backup" 2>/dev/null || true
rm -rf lib/db/migrations

npx drizzle-kit generate >/dev/null 2>&1

GENERATED=$(ls -t lib/db/migrations/*.sql | head -1)

if diff -u scripts/schema/schema.sql "$GENERATED" > "$TMP_DIR/diff.txt"; then
  echo "schema.sql is in sync with lib/db/schema.ts"
  STATUS=0
else
  echo "ERROR: scripts/schema/schema.sql has drifted from lib/db/schema.ts" >&2
  echo "Regenerate it with: rm -rf lib/db/migrations && npx drizzle-kit generate && cp \$(ls -t lib/db/migrations/*.sql | head -1) scripts/schema/schema.sql" >&2
  echo >&2
  cat "$TMP_DIR/diff.txt" >&2
  STATUS=1
fi

rm -rf lib/db/migrations
if [ -d "$TMP_DIR/migrations-backup" ]; then
  cp -R "$TMP_DIR/migrations-backup" lib/db/migrations
fi

exit $STATUS
