#!/usr/bin/env bash
# GitHub issue #46 / Prompt 8.2, GÖREV 4 — "Günlük otomatik veritabanı
# yedeği." Sağlık verisi taşıyoruz; bu script'in tek işi DATABASE_URL'in
# gösterdiği Postgres'i pg_dump ile sıkıştırılmış özel formatta (-Fc, tek
# dosyadan seçici tablo/paralel restore imkânı sağlar) yedeklemek.
#
# KULLANIM:
#   DATABASE_URL="postgresql://..." ./scripts/backup-db.sh
#   BACKUP_DIR ve BACKUP_RETENTION_DAYS opsiyonel (.env.example'da açıklandı).
#
# SELF-HOSTED (docker-compose.prod.yml) İÇİN CRON ÖRNEĞİ — VPS'in kendi
# crontab'ına (konteyner İÇİNE değil, host'a) eklenir, bkz. docs/runbook.md:
#   0 3 * * * cd /opt/ogun && docker compose -f docker-compose.prod.yml exec -T postgres \
#     pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > /opt/ogun/backups/ogun-$(date +\%Y-\%m-\%d).dump
#   (yukarıdaki tek satır cron örneği, container İÇİNDEN pg_dump çalıştırır —
#   bu script ise host'ta pg_dump KURULUYSA DATABASE_URL ile DOĞRUDAN bağlanan
#   genel amaçlı sürümdür; Neon kullanan dağıtımlarda DATABASE_URL zaten
#   Neon'u gösterdiği için AYNI script hiçbir değişiklik olmadan çalışır.)
#
# NEON KULLANAN DAĞITIMLAR İÇİN NOT (bkz. docs/deployment.md "Neon
# kurulumu"): Neon "point-in-time restore" (PITR) özelliğini native olarak
# sunar (varsayılan saklama süresi plana göre 1-30 gün) — bu script'in Neon
# için birincil amacı PITR penceresi DIŞINA taşan, kendi kontrolümüzdeki
# uzun vadeli (aylık/yıllık) arşiv kopyalarını almaktır, Neon'un kendi
# mekanizmasının YERİNE GEÇMEZ.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "HATA: DATABASE_URL tanımlı değil." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_FILE="${BACKUP_DIR}/ogun-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[backup-db] Yedek alınıyor -> ${OUT_FILE}"
pg_dump "${DATABASE_URL}" -Fc -f "${OUT_FILE}"

SIZE_BYTES=$(stat -c%s "${OUT_FILE}" 2>/dev/null || stat -f%z "${OUT_FILE}")
if [[ "${SIZE_BYTES}" -lt 100 ]]; then
  echo "HATA: Üretilen yedek dosyası şüpheli derecede küçük (${SIZE_BYTES} bayt) — bozuk olabilir." >&2
  exit 1
fi
echo "[backup-db] Tamamlandı: ${OUT_FILE} (${SIZE_BYTES} bayt)"

# Eski yedekleri temizle (saklama süresi).
find "${BACKUP_DIR}" -name 'ogun-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete | while read -r removed; do
  echo "[backup-db] Süresi dolan yedek silindi: ${removed}"
done

echo "[backup-db] Bitti."
