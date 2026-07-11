#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_CONTAINER="${DB_CONTAINER:-xpenses-db}"
DB_USER="${DB_USER:-xpenses}"
DB_NAME="${DB_NAME:-xpenses}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="xpenses_${TIMESTAMP}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "Backing up ${DB_NAME} to ${FILEPATH}..."
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "${FILEPATH}"

FILE_SIZE=$(du -h "${FILEPATH}" | cut -f1)
echo "Backup complete: ${FILEPATH} (${FILE_SIZE})"

echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "xpenses_*.dump" -mtime +${RETENTION_DAYS} -delete

echo "Done. Current backups:"
ls -lh "${BACKUP_DIR}"/xpenses_*.dump 2>/dev/null | tail -10
