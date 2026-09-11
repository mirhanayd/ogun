# Ogun Admin — Faz 7 Durum Raporu

Tarih: 11 Eylül 2026

Faz 7 implementasyonu tamamlandı: PostgreSQL tabanlı job lease/history, durable SMS delivery claim'i, support ve subscription e-posta retry'sı, webhook receipt/idempotency, abonelik drift findings, health endpointleri ve `/sistem` admin yüzeyi eklendi.

Operasyonel kapanışta bir acceptance istisnası vardır: doğrulamanın ilk aşamasında yerel `DATABASE_URL` açıkça override edilmeden çalıştırılan migration komutu kök `.env` içindeki uzak Neon hedefinde `0037_cool_madripoor` migration'ını istemeden uyguladı. Aynı hata ile oluşturulan yalnızca `s7-*` test fixture'ları hedefli transaction ile silindi; business verisi silinmedi. Migration geri alınmadı. Bu nedenle “remote DB'ye migration otomatik uygulanmıyor” kriteri bu yürütmede ihlal edilmiştir ve Faz 7 bütünüyle kabul edilmiş olarak raporlanmamalıdır. Sonraki tüm DB işlemleri açıkça `127.0.0.1:55437/ogun_phase7` disposable PostgreSQL 16 hedefinde yürütüldü. `0038_backfill-provider-event-namespace` uzak DB'ye uygulanmadı.

## Architecture

- Canonical job'lar: `sms_reminders`, `email_retry`, `subscription_reconciliation`, `maintenance`.
- Atomik DB lease; expiry ve heartbeat ile serverless instance'lar arasında concurrency kontrolü sağlar. İkinci invocation `skipped/already_running` history üretir.
- Job sonuçları PII içermeyen count, safe error code ve metadata ile `operational_job_runs` içinde kalıcıdır.
- Vercel cron yüzeyi code-defined allowlist kullanır. `CRON_SECRET` yok/yanlışsa fail-closed; `OPERATIONAL_JOBS_ENABLED=true` olmadan kapalı; preview her koşulda kapalıdır.
- Production dışı gerçek provider delivery ayrıca açık opt-in gerektirir.

## SMS reminders

- Global job en fazla 100 uygun kliniği dörderli concurrency ile tarar.
- Provider çağrısından önce `(appointment_id, reminder_type)` unique durable claim alınır; external çağrı boyunca SQL transaction açık tutulmaz.
- Yakın-send recheck rıza, telefon, randevu durumu ve zaman penceresini yeniden doğrular.
- Retry yalnız canonical retryable sınıflarda, 1/5/30 dakika backoff ve dört attempt sınırıyla yapılır.
- Expired `processing` claim provider sonucu bilinmediği için `unknown` olur; blind retry yapılmaz.
- Başarılı delivery tek canonical `sms_logs.status='gönderildi'` satırı üretir. Failed attempt'ler kotaya girmez.

## Email retry

- Durable retry kapsamı support ve subscription outbox'larıdır.
- Her iki domain aynı 1 dakika / 5 dakika / 30 dakika / 2 saat policy'sini ve beş attempt sınırını kullanır.
- Claim token + expiry manual ve cron worker yarışını engeller; send transaction dışında yapılır.
- Reviewer invite ve password reset token/expiry semantiğini bozmamak için generic retry kapsamına alınmadı.

## Webhook and reconciliation

- iyzico HMAC doğrulaması korunur; invalid signature DB receipt veya business mutation üretmez.
- Receipt ve business event identity `(provider, providerEventId)` ile DB-level unique'tir. Raw payload yerine hash ve normalize güvenli alanlar saklanır.
- Yeni event sonrası gelen eski event history'ye alınır ama current subscription state'i geriletmez.
- `0038`, Faz 7 öncesi provider ID'li iyzico event'lerini namespace'e backfill ederek historical replay boşluğunu kapatır.
- Reconciliation en fazla 100 kliniği tarar, stable fingerprint ile finding upsert/dedupe eder ve kaybolan bulguları resolved yapar. Auto-repair yoktur.

## System Status and health

- `/sistem`, `/sistem/isler`, `/sistem/isler/[runId]` `system.read`; manual reconciliation ve finding acknowledgement `system.manage` ile server-side korunur.
- `super_admin` manage eder; `read_only`, `support` ve `billing_ops` read erişimi alır; clinical/food rolleri erişmez.
- Liveness DB/provider bağımsızdır. Readiness yalnız hafif DB `select 1` kontrolüdür; üçüncü taraf outage restart loop üretmez.
- Dashboard gerçek DB aggregate'lerini ve deployment label/SHA'yı gösterir; sahte uptime ve danışan sağlık verisi göstermez.

## Migration and disposable validation

- Schema migration: `0037_cool_madripoor.sql`.
- Historical data migration: `0038_backfill-provider-event-namespace.sql`.
- Temiz PostgreSQL 16 DB'de `0000 → 0038`: PASS, 39 migration kaydı.
- Seed + clinical ETL + RxNorm mapping + Ogun food ETL: PASS. Sonuçlar sırasıyla 63 nutrient/6 exchange group/7 source; 21.505 condition/90.259 alias; 4.541 worklist/3.548 candidate; 119 food/2.380 nutrient row/119 portion/708 ingredient ve 323 review task.

## Backup/restore drill

Disposable source `ogun_phase7`, custom-format `pg_dump`, yeni `ogun_phase7_restore` ve `pg_restore` akışı geçti. Kaynak/restore sayımları birebir eşleşti:

| Tablo | Kaynak | Restore |
| --- | ---: | ---: |
| users | 212 | 212 |
| clinics | 76 | 76 |
| foods | 124 | 124 |
| conditions | 21.505 | 21.505 |
| operational_job_runs | 18 | 18 |
| sms_reminder_deliveries | 12 | 12 |
| provider_webhook_receipts | 12 | 12 |

## Validation özeti

- `pnpm typecheck`: PASS — 10/10 task.
- `pnpm lint`: PASS — 3/3 task.
- Kök `pnpm test`: PASS — 10/10 task; 945 passed, 31 opt-in/packaged skip. Faz 7 DB testleri aktifti.
- Tüm DB write flag'leriyle `@ogun/db`: PASS — 127/127.
- Web production build: PASS (mevcut Sentry/Turbopack warnings non-fatal).
- Admin production build: PASS (ayrı geçici build-only auth secret ile).
- Canonical Playwright: PASS — 11 passed, 1 packaged Tauri skip.
- Faz 7 Playwright: PASS — 3/3.
- Cargo: `cargo check` PASS; `cargo test` PASS — 73/73.
- HTTP smoke: web/admin live ve ready 200; unauthorized cron 401; authorized safe reconciliation 200 + durable run ID; unauthenticated `/sistem` 307.
- In-app Browser smoke: NOT RUN — bu oturumda bağlı browser bulunamadı. Aynı UI gerçek Chromium Playwright ile doğrulandı.

Exact commit/push durumu kök `walktrough.md` içinde yer alır.
