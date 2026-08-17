#!/usr/bin/env bash
# GitHub issue #46 / Prompt 8.2, GÖREV 4 — "Yedekten geri dönme
# prosedürü ... BİR KEZ TEST ET." Bu script, docs/runbook.md'de anlatılan ve
# gerçekten çalıştırılıp doğrulanan geri yükleme prosedürünün script'e
# dökülmüş hâlidir (bkz. o dosyadaki "gerçekten çalıştırılan komutlar" kaydı).
#
# GÜVENLİK: hedef veritabanını DROP edip yeniden oluşturur — YANLIŞLIKLA
# üretim veritabanını hedeflemeyi ZORLAŞTIRMAK için --yes bayrağı OLMADAN
# çalışmaz ve hedef DATABASE_URL'i ekrana basıp onay ister.
#
# KULLANIM:
#   ./scripts/restore-db.sh ./backups/ogun-2026-08-17T12-00-00Z.dump --yes
#
# DATABASE_URL, geri yüklenecek (var olan verisi SİLİNECEK) veritabanını
# gösterir. Postgres'in KENDİSİNE (bir veritabanına değil "postgres" idle
# veritabanına) bağlanabilmek için DATABASE_ADMIN_URL de gerekebilir (DROP/
# CREATE DATABASE, o veritabanına bağlıyken çalıştırılamaz) — verilmezse
# DATABASE_URL'den türetilir (dbname "postgres" ile değiştirilir).

set -euo pipefail

DUMP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "KULLANIM: $0 <yedek-dosyasi.dump> --yes" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "HATA: DATABASE_URL tanımlı değil (geri yüklenecek hedef)." >&2
  exit 1
fi

if [[ "${CONFIRM_FLAG}" != "--yes" ]]; then
  echo "UYARI: Bu işlem hedef veritabanındaki TÜM veriyi SİLER ve yedekten değiştirir."
  echo "Hedef: ${DATABASE_URL}"
  echo "Onaylamak için --yes bayrağıyla tekrar çalıştırın."
  exit 1
fi

# postgresql://user:pass@host:port/dbname -> dbname'i ayıkla, admin bağlantısı
# için "postgres" veritabanına bağlanan bir URL türet.
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${DATABASE_ADMIN_URL:-${DATABASE_URL%/*}/postgres}"

echo "[restore-db] Hedef veritabanı: ${DB_NAME}"
echo "[restore-db] Aktif bağlantılar sonlandırılıyor..."
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"

echo "[restore-db] Veritabanı yeniden oluşturuluyor (DROP + CREATE)..."
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\";"

echo "[restore-db] Yedekten geri yükleniyor: ${DUMP_FILE}"
pg_restore --no-owner --no-privileges -d "${DATABASE_URL}" "${DUMP_FILE}"

echo "[restore-db] Tamamlandı. Doğrulama önerisi: bir kaç tablonun satır sayısını kontrol edin, bkz. docs/runbook.md."
