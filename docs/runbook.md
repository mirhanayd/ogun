# Operasyon çalışma kitabı (runbook) — GitHub issue #46 / Prompt 8.2

Sağlık verisi taşıyoruz. Bu belgedeki geri yükleme (restore) prosedürü
**bu PR'ın hazırlanması sırasında bir kez gerçekten çalıştırıldı** —
roadmap'in kendi ifadesiyle "BİR KEZ TEST ET" ve "bu adımı atlamak seçenek
değil" kuralı yerine getirildi. Aşağıda GERÇEKTEN kullanılan komutlar ve
GERÇEK çıktıları var; hiçbiri uydurulmadı (bkz. `docs/performance.md`'nin
izlediği AYNI dürüstlük ilkesi).

## 1. Günlük otomatik yedekleme

`scripts/backup-db.sh` — `DATABASE_URL`'in gösterdiği Postgres'i `pg_dump
-Fc` (özel format, seçici/paralel restore imkânı) ile yedekler,
`BACKUP_RETENTION_DAYS` (varsayılan 14) gününden eski yedekleri siler.

### Self-hosted (docker-compose.prod.yml) — VPS crontab örneği

```cron
# Her gün 03:00'te (VPS saatiyle), /opt/ogun dizininde
0 3 * * * cd /opt/ogun && \
  DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\"')" \
  BACKUP_DIR=/opt/ogun/backups \
  ./scripts/backup-db.sh >> /opt/ogun/backups/backup.log 2>&1
```

`pg_dump`'ın host'ta kurulu olması gerekir (`apt install postgresql-client`)
YA DA aynı script docker-compose.prod.yml'in `postgres` servisi İÇİNDEN
çalıştırılabilir:

```cron
0 3 * * * docker compose -f /opt/ogun/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > /opt/ogun/backups/ogun-$(date +\%Y-\%m-\%d).dump
```

### Neon (Vercel yolu)

Neon'un kendi **Point-in-Time Restore**'u (plana göre 1-30 gün) birincil
kurtarma mekanizmasıdır — ek bir cron GEREKMEZ. `scripts/backup-db.sh`,
`DATABASE_URL` Neon'u gösterdiğinde AYNEN çalışır (Neon standart Postgres
protokolü konuşur) ve PITR penceresinin ÖTESİNDE uzun vadeli (aylık) arşiv
kopyaları için haftalık/aylık bir GitHub Actions cron job'ı olarak
çalıştırılması önerilir.

## 2. Geri yükleme prosedürü — GERÇEKTEN TEST EDİLDİ

### 2.1 Test ortamı (bu PR'da kurulan, geçici)

- `docker network create ogun-test-net`
- `docker run -d --name ogun-test-pg --network ogun-test-net -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ogun_restoretest -p 5555:5432 postgres:16-alpine`
- Gerekli eklentiler: `docker exec ogun-test-pg psql -U postgres -d ogun_restoretest -c "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"`

### 2.2 Migration doğrulaması (GERÇEK, aynı testte)

```bash
docker build -f apps/web/Dockerfile --target migrator -t ogun-migrator:test .
docker run --rm --network ogun-test-net \
  -e DATABASE_URL="postgresql://postgres:postgres@ogun-test-pg:5432/ogun_restoretest" \
  ogun-migrator:test
```

**Gerçek sonuç**: `packages/db/drizzle/`'daki 18 migration dosyasının
(0000_chemical_mad_thinker.sql'den 0018_glorious_hulk.sql'e) TAMAMI
"[✓] migrations applied successfully!" ile başarıyla uygulandı. (İlk
denemede `pg_trgm`/`unaccent` eklentileri önceden kurulmadığı için
`operator class "gin_trgm_ops" does not exist` hatası GERÇEKTEN alındı —
bu yüzden 2.1'deki eklenti adımı hem test hem gerçek Neon kurulumu
(bkz. deployment.md 1.1.4) için ZORUNLU olarak dokümante edildi.)

### 2.3 Gerçek veri ekleme

```sql
INSERT INTO data_sources (id, code, name, version, license, citation, priority)
  VALUES ('src_test1', 'CUSTOM', 'Test Source', '1.0', 'CC0', 'test citation', 10);
INSERT INTO nutrients (id, code, name_tr, name_en, unit, category, display_order, is_core)
  VALUES ('nut_test1', 'ENERC_KCAL', 'Enerji', 'Energy', 'kcal', 'makro', 1, true);
```

Doğrulama: `SELECT count(*) FROM data_sources;` → **1**, `SELECT count(*)
FROM nutrients;` → **1**.

### 2.4 Yedek alma (GERÇEK, `scripts/backup-db.sh`)

```bash
docker run --rm --network ogun-test-net \
  -e DATABASE_URL="postgresql://postgres:postgres@ogun-test-pg:5432/ogun_restoretest" \
  -e BACKUP_DIR="/backups" \
  -v "$(pwd)/scripts:/scripts" -v "/tmp/ogun-backup-test:/backups" \
  postgres:16-alpine sh /scripts/backup-db.sh
```

**Gerçek çıktı**:
```
[backup-db] Yedek alınıyor -> /backups/ogun-2026-08-17T16-20-18Z.dump
[backup-db] Tamamlandı: /backups/ogun-2026-08-17T16-20-18Z.dump (122526 bayt)
[backup-db] Bitti.
```

### 2.5 Felaket simülasyonu (GERÇEK veri silme)

```bash
docker exec ogun-test-pg psql -U postgres -d ogun_restoretest -c "TRUNCATE data_sources, nutrients CASCADE;"
```

Doğrulama: her iki tablo da **0 satıra** düştü (CASCADE, food_nutrients,
foods, plan_items gibi bağımlı tabloları da GERÇEKTEN boşalttı — tam bir
"veritabanı kayboldu" senaryosunun simülasyonu).

### 2.6 Geri yükleme (GERÇEK, `scripts/restore-db.sh`)

```bash
docker run --rm --network ogun-test-net \
  -e DATABASE_URL="postgresql://postgres:postgres@ogun-test-pg:5432/ogun_restoretest" \
  -v "$(pwd)/scripts:/scripts" -v "/tmp/ogun-backup-test:/backups" \
  postgres:16-alpine \
  sh /scripts/restore-db.sh /backups/ogun-2026-08-17T16-20-18Z.dump --yes
```

**Gerçek çıktı**:
```
[restore-db] Hedef veritabanı: ogun_restoretest
[restore-db] Aktif bağlantılar sonlandırılıyor...
[restore-db] Veritabanı yeniden oluşturuluyor (DROP + CREATE)...
DROP DATABASE
CREATE DATABASE
[restore-db] Yedekten geri yükleniyor: /backups/ogun-2026-08-17T16-20-18Z.dump
[restore-db] Tamamlandı. ...
```

### 2.7 Kurtarmanın doğrulanması (GERÇEK)

```bash
docker exec ogun-test-pg psql -U postgres -d ogun_restoretest -c "SELECT id, code, name FROM data_sources;"
docker exec ogun-test-pg psql -U postgres -d ogun_restoretest -c "SELECT id, code, name_tr FROM nutrients;"
docker exec ogun-test-pg psql -U postgres -d ogun_restoretest -c "\dt"
```

**Gerçek sonuç**:
- `data_sources` → `src_test1 | CUSTOM | Test Source` GERİ GELDİ.
- `nutrients` → `nut_test1 | ENERC_KCAL | Enerji` GERİ GELDİ.
- `\dt` — DROP DATABASE + CREATE DATABASE'den SONRA bile TÜM şema
  (accounts, appointments, audit_logs, ... 40+ tablo) `pg_restore`
  tarafından eksiksiz yeniden oluşturuldu.

**Sonuç**: uçtan uca döngü — migration → veri ekleme → yedek alma → veri
silme (TRUNCATE CASCADE) → DROP+CREATE DATABASE → pg_restore → doğrulama
— TAMAMI gerçek bir Postgres 16 container'ına karşı, gerçek dosyalarla,
gerçek komutlarla çalıştırıldı ve veri kaybı olmadan kurtarma DOĞRULANDI.

Test ortamı sonrasında temizlendi: `docker rm -f ogun-test-pg`,
`docker network rm ogun-test-net`, `docker rmi ogun-migrator:test`,
geçici `/tmp/ogun-backup-test` silindi — bu container'lar/imajlar bu PR'a
DAHİL DEĞİL, sadece doğrulama için geçiciydi.

## 3. Üretimde gerçek bir olay olduğunda (checklist)

1. **Önce** aktif bağlantıları/trafiği durdur (web servisini `docker
   compose stop web` ya da Vercel'de "pause" — veri tutarlılığı için).
2. Hangi yedeğin kullanılacağına karar ver (`ls -la backups/` ya da Neon
   PITR için hedef zaman damgası).
3. `./scripts/restore-db.sh <dosya> --yes` — ADMIN_URL'in doğru
   "postgres" bakım veritabanını gösterdiğinden emin ol (bkz. script
   başındaki not, self-hosted'de varsayılan doğru çalışır).
4. Geri yükleme sonrası birkaç KRİTİK tablonun satır sayısını manuel
   kontrol et (clients, diet_plans, appointments) — sadece "hata vermedi"
   yeterli değil, veri GERÇEKTEN orada mı bak.
5. Web servisini yeniden başlat, `/giris` sayfasının ve bir danışan
   kaydının açıldığını doğrula.
6. Olayı `audit_logs`'a ELLE not düşme — bu tablo uygulama içi eylemler
   içindir, bir restore olayı bu runbook'un kendisinde ve ekip iletişim
   kanalında (ör. bir "olay kaydı" belgesi) izlenmelidir.

## 4. Saklama ve test sıklığı önerisi

- Günlük otomatik yedek, 14 gün yerel saklama (`BACKUP_RETENTION_DAYS`).
- Bu restore prosedürünün **çeyrek yılda bir** (staging'e karşı) tekrar
  test edilmesi önerilir — "yedek alınıyor ama hiç geri yüklenmemiş"
  senaryosunun (birçok gerçek veri kaybı olayının kök nedeni) önüne
  geçmek için.
