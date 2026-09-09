# Ogun Operasyon / Admin Platform — Faz 4 Durum Raporu

Tarih: 9 Eylül 2026

## Mimari sınır

Reviewer yaşam döngüsü, davet, mesleki doğrulama, capability ve assignment operasyonları `apps/admin` altına taşındı. Reviewer çalışma alanı, atanmış görevler, klinik karar ve mevcut publish governance akışı `apps/web/src/app/clinical-review` altında kaldı. Admin uygulaması web kaynak kodunu import etmez; ortak sözleşmeler `@ogun/db`, `@ogun/etl` ve `@ogun/email` üzerinden kullanılır.

`clinical_admin` bir clinical reviewer rolüdür ve otomatik `platform_staff` değildir. Aynı şekilde `clinical_ops` platform personeli otomatik reviewer olmaz. Admin route/action'ları canonical `clinical.reviewers.*` ve `clinical.tasks.*` izinleriyle korunur; read-only personelde mutation yüzeyleri gösterilmez.

## Invitation lifecycle

Canonical stored durumlar `pending`, `accepted` ve `revoked` olarak tutulur; `pending + expiresAt <= now` UI/query katmanında `expired` türetilir. Davet oluşturma normalize e-posta üzerinde transaction advisory lock kullanır; geçerli duplicate daveti ve mevcut pending/verified/suspended reviewer profilini engeller. Mevcut kayıt bulunduğunda admin ilgili davet veya reviewer detayına yönlendirilir.

Token 32 byte kriptografik rastgele kaynaktan üretilir. Veritabanında yalnız SHA-256 hash'i saklanır; raw token admin projection, audit metadata veya loglara girmez. Varsayılan süre yedi gün, resend cooldown'ı 60 saniyedir. Resend yeni token/hash/expiry üretir ve eski linki anında geçersizleştirir. Revoke neden gerektirir; revoked/accepted kayıt resend veya accept edilemez.

## Hesap aktivasyonu ve mesleki doğrulama

Davet açılırken placeholder `users`/`accounts` kaydı veya admin tarafından parola üretilmez. Yeni kullanıcı, kilitli davet e-postasıyla Better Auth'ın resmi `authClient.signUp.email` akışında kendi parolasını oluşturur. Mevcut Ogun kullanıcısı aynı e-posta hesabıyla giriş yapar. Acceptance transaction'ı session e-postasını normalize davet e-postasıyla tekrar karşılaştırır; farklı hesap daveti kullanamaz.

Hesap aktivasyonu mesleki doğrulama değildir. Önceden doğrulanmış davet kabul edilince reviewer `verified + active`, diğer davet `pending + inactive` olur. Pending reviewer status ekranını görebilir fakat görev içeriği, queue ve karar action'larına erişemez. `pending → verified/rejected`, `verified → suspended`, `suspended → verified`, `rejected → pending` geçişleri server-side canonical graph ile uygulanır. Suspension geçmiş kararları ve assignment'ları silmez.

## Capability ve eligibility

Specialty yalnız açıklayıcı text metadata'dır. Atama yetkisi canonical capability seti, professional role, assignment role, task status ve mevcut `isReviewerEligibleForTask` policy'sinden türetilir. Yeni `isClinicalReviewTaskAssignable` helper terminal workflow durumlarını merkezi olarak kapatır. Admin filtreleri yalnız UX'tir; staging, materialization ve doğrudan/batch assignment her task için policy'yi transaction içinde yeniden çalıştırır.

Invitation capability değişikliği pending staging kayıtlarını yeniden doğrular ve uyumsuz olanları `invalidated` yapar. Accepted reviewer capability değişikliği mevcut atamaları sessizce silmez; uyumsuz aktif assignment sayısını admin'e bildirir.

## Pre-assignment ve materialization

`clinical_reviewer_invitation_assignments`, hesap oluşmadan önce seçilen taskları `pending`, `materialized`, `cancelled` veya `invalidated` durumuyla saklar. Batch seçiminde en fazla 100 benzersiz task server-side doğrulanır. Acceptance sırasında invitation ve tasklar kilitlenir; durum/capability/duplicate assignment koşulları yeniden kontrol edilir. Uygun kayıtlar canonical `clinical_review_assignments` satırlarına dönüşür; pending task optimistic version kontrolüyle `assigned` olur. Tek bir geçersiz task tüm acceptance'ı bozmaz, staging kaydı neden bilgisiyle invalidated kalır.

Accepted reviewer detayından batch assignment partial-result semantiğiyle çalışır; her task kendi transaction bütünlüğünü ve eligibility kontrolünü korur. Assignment iptali hard delete kullanmaz, `cancelled` durumunu ve geçmişi korur.

## Reviewer portal erişim modeli

Standart pharmacist/dietitian/physician reviewer yalnız `Bana Atanan İncelemeler` alanını görür. Global `/clinical-review/queue` yalnız verified `clinical_admin` governance rolüne açıktır. Eski self-claim action'ı ve “Havuzdan Aday Seç / Tüm Havuzu Gör” yüzeyleri kaldırıldı. Task detail, draft ve decision submit action'ları standart reviewer için aktif assignment'ı DB seviyesinde tekrar doğrular. Suspended veya inactive reviewer fail-closed reddedilir.

Web'deki eski reviewer management sayfası salt bilgilendirme/migration sayfasına çevrildi; parola, capability, verification ve assignment yönetimi yalnız Ogun Operasyon'dadır. `canPublish` Faz 4'te read-only bırakıldı ve mevcut `requirePublisherAdmin` güvenlik sınırı değiştirilmedi.

## Admin operasyon yüzeyleri

- `/clinical-inceleme`: bekleyen davet, aktif reviewer, doğrulama bekleyen, atanmamış P1/P2 ve aktif review gerçek DB sayaçları.
- `/clinical-inceleme/davetler`: status/email-failure filtreli, 25/50/100 server-side pagination'lı liste.
- `/clinical-inceleme/davetler/yeni` ve `/davetler/[inviteId]`: role, specialty, açık capability seçimi, pre-verification, resend/revoke ve batch staging.
- `/clinical-inceleme/hakemler` ve `/hakemler/[userId]`: reviewer lifecycle, capability, workload, son aktivite, batch assignment, soft cancellation ve tamamlanmış karar geçmişi.
- `/clinical-inceleme/gorevler`: priority, status, capability, subject, confidence, assigned/unassigned ve reviewer filtreleri.

## Audit

Privileged admin mutationları `platform_audit_logs`; clinical workflow tarihçesi `clinical_review_audit_log` üretir. Gerekli mutationlarda iki kayıt business değişikliğiyle aynı transaction'dadır. Yeni semantik eventler reviewer invite/accept/verify/reject/suspend/reactivate/capability change ve assignment cancellation olaylarını doğru adla kaydeder. Capability değişimi veya rejection artık `reviewer_verified` olarak yazılmaz. Invite accept staff action olmadığı için uydurma platform actor üretilmez.

## E-posta

Invitation önce DB'ye commit edilir, ardından `@ogun/email` sender ile gönderilir. Provider hatası daveti rollback etmez; delivery state ve hata admin detayında tutulur. Davet e-postası meslek, uzmanlık, yedi günlük/tek kullanımlık link bilgisini içerir; task veya clinical evidence içermez. `verified` geçişinden sonra erişim e-postası commit dışından gönderilir; başarısızlık mesleki doğrulamayı geri almaz. Link origin'leri yalnız server-side `OGUN_WEB_URL` değerinden üretilir.

## Migration ve yerel doğrulama

Canonical generated migration `packages/db/drizzle/0034_old_vampiro.sql` iki invitation tablosunu, FK/CHECK/unique constraint'leri, operasyon index'lerini ve clinical audit event genişlemesini ekler. Destructive DDL içermez.

Disposable PostgreSQL 16 üzerinde `pg_trgm` sonrası `0000 → 0034` tam zinciri geçti. Ardından ana seed, clinical catalog ETL (21.505 condition), RxNorm mapping (4.541 worklist / 3.548 candidate), Ogun food ETL (119 yemek / 2.380 değer) ve E2E fixture'ları uygulandı. Uzak/Neon veritabanına migration uygulanmadı.

## Test/runbook

Yerel tam doğrulama için:

```powershell
$env:DATABASE_URL = 'postgresql://ogun:ogun@localhost:55436/ogun_phase4'
pnpm --filter @ogun/db db:migrate
pnpm --filter @ogun/db db:seed
pnpm --filter @ogun/etl etl:clinical
pnpm --filter @ogun/etl etl:rxnorm-mappings
pnpm --filter @ogun/etl etl:ogun
pnpm --filter @ogun/e2e seed
pnpm typecheck
pnpm lint
pnpm test

$env:CLINICAL_REVIEWER_WRITE_TESTS = '1'
pnpm --filter @ogun/db exec vitest run src/queries/clinical-reviewer-operations.test.ts

pnpm --filter @ogun/e2e seed:clinical-review
pnpm --filter @ogun/e2e test:clinical-review
```

Browser UI bağlantısı bu oturumda mevcut değildi. Buna karşılık üretim admin/web build'leri üzerinde gerçek Chromium Playwright akışı; MFA enrollment, invite, iki task staging, yeni hesap, mevcut hesap, yanlış hesap, replay ve revoke kontrolleriyle geçti.

## Nihai doğrulama sonucu

```text
pnpm typecheck
  PASS — 9/9 Turbo task

pnpm lint
  PASS — 3/3 Turbo task

DATABASE_URL=<disposable PostgreSQL 16> pnpm test
  PASS — 9/9 Turbo task
  920 passed, 24 skipped (canonical Playwright dahil)

CLINICAL_REVIEWER_WRITE_TESTS=1 vitest clinical-reviewer-operations.test.ts
  PASS — 9/9

pnpm --filter @ogun/e2e test:clinical-review
  PASS — 1/1 gerçek Chromium

Canonical Playwright
  PASS — 11 passed, 1 packaged-Tauri testi skipped

Web production build
  PASS — mevcut Sentry/Turbopack external uyarıları non-fatal

Admin production build
  PASS

Cargo
  PASS — 73/73

Browser UI smoke
  NOT RUN — bağlı tarayıcı yok

HTTP / production-server smoke
  PASS — admin reviewer list, invite-create permission ve reviewer portal auth gate
```

Test sırasında kök `.env` içindeki harici ve eski şemalı veritabanı özellikle migrate edilmedi. Entegrasyon matrisi, yalnız disposable PostgreSQL 16 üzerindeki güncel `0000 → 0034` şemasıyla çalıştırıldı.
