# Production Operations Runbook

Bu runbook Ogun web ve admin uygulamalarının production dağıtımı, zamanlanmış işler, health kontrolleri, migration ve olay müdahalesi içindir. Komutlarda secret değerlerini terminal geçmişine veya CI çıktısına yazdırmayın.

## Mimari ve güvenlik sınırı

Job tanımları kod içindedir; Redis veya genel amaçlı queue yoktur. Vercel ya da başka bir scheduler yalnızca `apps/web` içindeki `/api/internal/cron/<job>` endpoint'lerini çağırır. Her çalışma PostgreSQL'de expiring lease alır, `operational_job_runs` kaydı üretir ve provider çağrısı boyunca SQL transaction açık tutmaz. Aynı job'ın cron ve manuel çalıştırması aynı lock/policy yolunu kullanır.

Cron istekleri `Authorization: Bearer <CRON_SECRET>` ile doğrulanır. Secret yoksa veya yanlışsa endpoint fail-closed olarak `401` döner. `OPERATIONAL_JOBS_ENABLED=true` olmadan hiçbir job başlamaz; Vercel Preview bu bayrak yanlışlıkla kopyalansa bile kapalıdır. Production dışındaki gerçek e-posta/SMS teslimatı ayrıca `EXTERNAL_DELIVERY_ENABLED=true` gerektirir. Secret, response, log veya job metadata'sına yazılmaz.

## Job kataloğu ve UTC zamanlaması

| Endpoint                                         | Canonical job                 | Vercel cron (UTC) | Davranış                                                                                                 |
| ------------------------------------------------ | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `/api/internal/cron/sms-reminders`               | `sms_reminders`               | `*/15 * * * *`    | En fazla 100 uygun kliniği, dörderli concurrency ile tarar.                                              |
| `/api/internal/cron/email-retry`                 | `email_retry`                 | `*/5 * * * *`     | Destek ve abonelik outbox'larından 50'şer due kaydı tarar.                                               |
| `/api/internal/cron/subscription-reconciliation` | `subscription_reconciliation` | `0 * * * *`       | En fazla 100 kliniği tarar; yalnız bulgu üretir, düzeltme yapmaz.                                        |
| `/api/internal/cron/maintenance`                 | `maintenance`                 | `15 2 * * *`      | Expired admin session/auth verification ve 90 günden eski başarılı/atlanmış job telemetry'sini temizler. |

Business tarih karşılaştırmaları UTC timestamp ile yapılır; scheduler timezone'una güvenilmez. Business audit, support history, subscription events, clinical/food history maintenance tarafından silinmez.

## Gerekli ortam değişkenleri

- Web: mevcut production değişkenlerine ek `CRON_SECRET`, `OPERATIONAL_JOBS_ENABLED=true`.
- Admin: `ADMIN_BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_URL`, `OGUN_WEB_URL` ve aynı `DATABASE_URL`.
- Preview: `OPERATIONAL_JOBS_ENABLED=false`; production secret'ı preview'a kopyalamayın.
- `CRON_SECRET` için en az 32 byte kriptografik rastgele değer kullanın ve düzenli secret rotasyon sürecine dahil edin.

## Dağıtım

1. Hedef branch/SHA ve iki uygulamanın aynı schema beklentisinde olduğunu doğrulayın.
2. [Backup/restore runbook](./production-backup-restore.md) uyarınca backup/checkpoint alın.
3. Uygulanacak migration SQL'ini statik inceleyin. Production build içinde migration çalıştırmayın.
4. Neon direct `DATABASE_URL` değerini onaylı secret store'dan süreç ortamına açıkça enjekte edin; CLI hiçbir `.env` dosyasını kendiliğinden yüklemez.
5. `DB_WRITE_TARGET=production` ve `DB_ALLOW_REMOTE_WRITE=true` değerlerini açıkça verin.
6. `DB_EXPECTED_HOST` ile `DB_EXPECTED_DATABASE` değerlerini provider metadata'sı ve change record ile eşleştirin.
7. `pnpm --filter @ogun/db db:migrate:check` ile bağlantısız preflight çalıştırın.
8. Gösterilen sanitized target/fingerprint ikinci operatör tarafından doğrulandıktan sonra aynı fingerprint'i `DB_PRODUCTION_WRITE_CONFIRM` olarak verin ve preflight'ı yeniden başarılı çalıştırın.
9. Aynı onaylı süreç ortamında `pnpm --filter @ogun/db db:migrate` çalıştırın. Remote `db:push` ve seed komutları yasaktır; override yoktur.
10. Read-only migration journal/hash kontrolüyle beklenen migration state'ini doğrulayın. Faz 7 olayı için `pnpm --filter @ogun/db db:verify:phase7-incident` yalnız aggregate/schema sonucu verir.
11. Web ve admin uygulamalarını jobs kapalı olarak deploy edin; `/api/health/live` ve `/api/health/ready` yanıtlarını doğrulayın.
12. Admin `/sistem` ekranında Database/Admin durumunu, deployment label/SHA'yı ve mevcut bulguları kontrol edin.
13. Yetkili bir test isteğiyle reconciliation çalıştırın; job history'de bir satır oluştuğunu doğrulayın.
14. Yalnız production environment'ta `OPERATIONAL_JOBS_ENABLED=true` yapın ve ilk cron sonuçlarını izleyin.

## Post-deploy smoke

```text
GET /api/health/live                -> 200
GET /api/health/ready               -> 200
GET /api/internal/cron/maintenance  -> 401 (Authorization olmadan)
GET /api/internal/cron/subscription-reconciliation
  Authorization: Bearer <secret>    -> 200 ve safe runId/status
GET admin /sistem                   -> auth redirect veya yetkili ekranda 200
```

SMS/e-posta smoke için gerçek alıcı kullanmayın. Test fixture sender veya production dışı delivery-disable kuralı kullanılmalıdır.

## Sağlık ve izleme

Liveness yalnız process'in yanıt verdiğini gösterir; DB'ye veya sağlayıcılara gitmez. Readiness yalnız hafif `select 1` ile DB'yi doğrular. Resend, SMS sağlayıcısı veya iyzico outage'ı readiness'i doğrudan düşürmez ve restart loop üretmez. Provider durumu `/sistem` ekranında son başarılı/başarısız kendi operasyon kayıtlarımızdan gözlenir; sahte uptime yüzdesi yoktur.

Structured job logları yalnız `jobName`, `runId`, `status`, `durationMs` ve aggregate counts taşır. Telefon, e-posta, isim, mesaj gövdesi, token, authorization header veya raw webhook payload loglanmaz. Mevcut PII scrub ve Sentry abstraction korunur.

## Migration ve rollback

Migration öncesi hedef hostname/database adı ikinci kişi veya change record ile doğrulanır. Guard ayrıntıları ve local akış [Database Write Safety](./database-write-safety.md) belgesindedir. Preflight çıktısında credential bulunmaz; full URL'yi log veya ticket'a kopyalamayın. `0037` additive tablolar ve nullable/default kolonlar ekler; index değişimini içerir. `0038`, eski iyzico webhook event'lerine provider namespace'i backfill eder ve tekrar çalıştırıldığında ek değişiklik üretmez. Migration sonrası health ve `/sistem` kontrol edilir. Uygulama rollback'i eski build'e dönmekle yapılabilir; DB kolonlarını aceleyle düşürmeyin. Veri yazılmış migration'larda destructive rollback yerine forward-fix migration hazırlayın. Remote/Neon migration yalnız yetkili operatör tarafından guarded akışla uygulanır.

## Olay müdahalesi

1. Duplicate/yanlış teslimat riski varsa `OPERATIONAL_JOBS_ENABLED=false` yapın; webhook signature doğrulamasını kapatmayın.
2. `/sistem` job run, delivery aggregate ve findings kayıtlarını inceleyin. PII'yi olay kanalına kopyalamayın.
3. `unknown` SMS'i otomatik veya tek tıkla retry etmeyin; provider lookup yoksa manuel inceleyin.
4. Terminal e-posta için neden kodu/configuration'ı düzeltin; max-attempt limitini topluca sıfırlamayın.
5. Subscription drift için önce neden analizi yapın; reconciliation auto-repair yapmaz.
6. DB olayıysa izole restore prosedürüne geçin. Production üzerine doğrudan restore yasaktır.

Rollback sonrası cron'un eski ve yeni deployment'ı aynı anda çağırmadığını doğrulayın. DB lease duplicate job çalışmasını engeller; yine de scheduler config tek authoritative kaynak olmalıdır.
