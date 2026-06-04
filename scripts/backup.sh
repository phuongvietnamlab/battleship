#!/bin/bash
# backup.sh — Backup Postgres + Redis data cho migration sang EC2 khác
# Usage: ./scripts/backup.sh
# Output: ./backups/full-backup-YYYYMMDD-HHMMSS.tar.gz

set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEMP_DIR="${BACKUP_DIR}/temp-${TIMESTAMP}"

mkdir -p "${TEMP_DIR}"

echo "=== Battleship Backup — ${TIMESTAMP} ==="

# 1. Postgres dump
echo "[1/3] Dumping PostgreSQL..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U battleship --format=custom --compress=6 battleship \
  > "${TEMP_DIR}/postgres.dump"
echo "      → postgres.dump ($(du -h ${TEMP_DIR}/postgres.dump | cut -f1))"

# 2. Redis dump (trigger BGSAVE then copy)
echo "[2/3] Dumping Redis..."
docker compose -f docker-compose.prod.yml exec -T redis \
  redis-cli -a "${REDIS_PASSWORD}" BGSAVE > /dev/null 2>&1
sleep 2
docker compose -f docker-compose.prod.yml cp redis:/data/dump.rdb "${TEMP_DIR}/redis.rdb" 2>/dev/null || echo "      (no Redis dump.rdb — empty data)"

# 3. Copy .env (secrets — encrypted lưu riêng, nhưng cần cho restore)
echo "[3/3] Copying .env..."
cp .env "${TEMP_DIR}/env.encrypted"

# Package
echo ""
echo "Packaging..."
ARCHIVE="${BACKUP_DIR}/full-backup-${TIMESTAMP}.tar.gz"
tar -czf "${ARCHIVE}" -C "${TEMP_DIR}" .
rm -rf "${TEMP_DIR}"

echo ""
echo "=== Backup complete ==="
echo "File: ${ARCHIVE} ($(du -h ${ARCHIVE} | cut -f1))"
echo ""
echo "Để restore trên EC2 mới, xem: scripts/restore.sh"
