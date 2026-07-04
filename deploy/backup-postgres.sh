#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/aleph-blog}"
BACKUP_DIR="${BACKUP_DIR:-/opt/aleph-blog/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$APP_DIR"

if [ -f .env ]; then
  env_file="$(mktemp)"
  chmod 600 "$env_file"
  sed 's/\r$//' .env > "$env_file"
  set -a
  # shellcheck disable=SC1091
  . "$env_file"
  set +a
  rm -f "$env_file"
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/aleph_blog_$timestamp.sql.gz"
tmp_sql="$BACKUP_DIR/.aleph_blog_$timestamp.sql"
trap 'rm -f "$tmp_sql"' EXIT

docker compose -f docker-compose.aliyun.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-aleph_blog}" "${POSTGRES_DB:-aleph_blog}" \
  > "$tmp_sql"

gzip -c "$tmp_sql" > "$file"
rm -f "$tmp_sql"
trap - EXIT

find "$BACKUP_DIR" -type f -name 'aleph_blog_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "$file"
