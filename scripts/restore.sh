#!/bin/bash
# restore.sh — Restore backup vào EC2 mới
# Usage: ./scripts/restore.sh ./backups/full-backup-YYYYMMDD-HHMMSS.tar.gz
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - Repo cloned to /opt/battleship
#   - Backup file uploaded to server

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/restore.sh <backup-file.tar.gz>"
  exit 1
fi

BACKUP_FILE="$1"
TEMP_DIR="./backups/restore-temp"

echo "=== Battleship Restore ==="
echo "From: ${BACKUP_FILE}"
echo ""

# Extract
mkdir -p "${TEMP_DIR}"
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# 1. Restore .env
if [ -f "${TEMP_DIR}/env.encrypted" ]; then
  echo "[1/3] Restoring .env..."
  cp "${TEMP_DIR}/env.encrypted" .env
  echo "      → .env restored (review and update CANONICAL_HOST/CALLBACK_URLs if domain changed)"
fi

# 2. Start fresh containers (DB empty)
echo "[2/3] Starting services..."
docker compose -f docker-compose.prod.yml up -d postgres redis
echo "      Waiting for PostgreSQL healthy..."
sleep 10

# 3. Restore Postgres
echo "[3/3] Restoring PostgreSQL..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U battleship -d battleship --clean --if-exists < "${TEMP_DIR}/postgres.dump" 2>/dev/null || true
echo "      → PostgreSQL restored"

# 4. Restore Redis (optional)
if [ -f "${TEMP_DIR}/redis.rdb" ]; then
  echo "      Restoring Redis..."
  docker compose -f docker-compose.prod.yml stop redis
  docker compose -f docker-compose.prod.yml cp "${TEMP_DIR}/redis.rdb" redis:/data/dump.rdb
  docker compose -f docker-compose.prod.yml start redis
  echo "      → Redis restored"
fi

# 5. Start app
echo ""
echo "Starting app..."
docker compose -f docker-compose.prod.yml up -d

# Cleanup
rm -rf "${TEMP_DIR}"

echo ""
echo "=== Restore complete ==="
echo ""
echo "Checklist:"
echo "  [ ] curl http://localhost/healthz → 200"
echo "  [ ] Update DNS nếu IP đổi"
echo "  [ ] Update OAuth callback URLs nếu domain đổi"
echo "  [ ] Chạy certbot nếu cần HTTPS mới"
echo "  [ ] Verify: docker compose -f docker-compose.prod.yml logs app"
