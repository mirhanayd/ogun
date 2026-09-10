# Ogun Operasyon / Admin Platform — Faz 4 Walkthrough ve Son Rapor

Tarih: 9 Eylül 2026

Bu bölüm Faz 4'ün nihai raporudur. Faz 3, Faz 2 ve Faz 1 raporları aşağıda tarihsel kayıt olarak korunmuştur.

## Architecture

Reviewer yaşam döngüsü, davet, mesleki doğrulama, capability ve assignment operasyonlarının canonical yönetim yüzeyi `apps/admin` altına taşındı. Reviewer'ın çalışma alanı ve klinik karar akışı `apps/web/src/app/clinical-review` altında kaldı. `clinical_admin` bir reviewer governance rolüdür; otomatik platform personeli değildir. `clinical_ops` ise platform personelidir; otomatik reviewer değildir. Admin route ve action'ları `clinical.reviewers.*` ile `clinical.tasks.*` izinleriyle fail-closed korunur.

## Invitation lifecycle

Davet akışı `create → send → resend/revoke → accept` biçimindedir. Canonical durumlar `pending`, `accepted`, `revoked`; expiry ise `pending + expiresAt` üzerinden türetilir. Normalize e-posta için transaction advisory lock duplicate davet yarışını önler. Resend 60 saniye cooldown sonrasında yeni token ve expiry üretir, eski linki geçersiz kılar. Revoke neden gerektirir ve pending staging kayıtlarını iptal eder.

Raw token 32 byte kriptografik rastgele kaynaktan üretilir; DB'de yalnız SHA-256 hash'i saklanır. Admin projection, audit metadata, e-posta delivery error ve loglar token hash/raw token döndürmez.

## Account activation

Davet sırasında placeholder Better Auth kullanıcısı veya admin tarafından parola oluşturulmaz. Yeni kullanıcı kilitli davet e-postasıyla resmi Better Auth `signUp.email` akışında kendi parolasını belirler. Mevcut Ogun kullanıcısı kendi hesabıyla giriş yapar. Session e-postası davet e-postasıyla server-side tekrar karşılaştırılır; yanlış hesap kabul edemez. Acceptance tek kullanımlı ve replay-safe transaction'dır.

Browser auth istemcisi web ortamında çalışma anındaki `window.location.origin` değerini kullanır. Böylece farklı production/E2E portlarında build-time URL'nin yanlış origin'e gömülmesi engellenir; native shell cloud origin davranışı korunur.

## Verification

Hesap aktivasyonu ile professional verification ayrıdır. Preverified davet `verified + active`, normal davet `pending + inactive` profil üretir. Canonical geçişler `pending → verified/rejected`, `verified → suspended`, `suspended → verified`, `rejected → pending` olarak server-side uygulanır. Suspension geçmiş kararları ve assignment'ları silmez. Verification DB commit'inden sonra bildirim e-postası gönderilir; provider hatası doğrulamayı rollback etmez.

## Capability model

Specialty açıklayıcı metadata'dır. Atanabilirlik; professional role, canonical capability seti, assignment role, task durumu ve mevcut `isReviewerEligibleForTask` policy'siyle hesaplanır. Admin filtreleri güvenlik sınırı değildir: staging, materialization ve doğrudan/batch assignment sırasında her görev transaction içinde yeniden doğrulanır. Capability değişimi uyumsuz staged kayıtları `invalidated` yapar; mevcut gerçek assignment'ları sessizce silmez.

## Pre-assignment ve materialization

`clinical_reviewer_invitation_assignments`, hesap oluşmadan seçilen görevleri `pending/materialized/cancelled/invalidated` durumlarıyla saklar. Acceptance sırasında invitation ve task satırları kilitlenir; eligibility, terminal status ve duplicate assignment koşulları tekrar kontrol edilir. Uygun kayıtlar canonical `clinical_review_assignments` satırlarına dönüşür; uygun olmayanlar neden bilgisiyle invalidated kalır. Bir geçersiz staged görev tüm davet kabulünü bozmaz.

Accepted reviewer detayında uygun görevler batch seçilebilir; sonuç assigned/rejected adetlerini ayrı bildirir. Assignment iptali hard delete yerine `cancelled` durumu kullanır.

## Reviewer portal

Standart reviewer yalnız kendisine atanmış görevleri görür. Global queue yalnız verified `clinical_admin` governance rolüne açıktır. Eski self-claim action'ı ve “Havuzdan Aday Seç” yüzeyi kaldırıldı. Task detail, draft ve submit action'ları aktif assignment'ı DB seviyesinde tekrar doğrular. Pending, suspended veya inactive reviewer klinik görev içeriğine erişemez. Existing publish policy ve `requirePublisherAdmin` sınırı korunmuştur.

## Legacy reviewer admin

Web'deki eski reviewer management mutation/table yüzeyi kaldırıldı; sayfa Ogun Operasyon'a yönlendiren salt bilgilendirme yüzeyi olarak bırakıldı. Parola yönetimi reviewer operasyon ekranına taşınmadı. Admin'deki reviewer detayında profil, capabilities, assignment geçmişi, tamamlanmış karar geçmişi, clinical status ve permission-aware mutation'lar bulunur.

## Audit

Privileged staff mutation'ları `platform_audit_logs`, klinik workflow olayları `clinical_review_audit_log` üretir. Invite, accept, verify, reject, suspend, reactivate, capability change, assign ve cancel olayları doğru semantik event adlarıyla kaydedilir. Capability update veya rejection yanlışlıkla `reviewer_verified` yazmaz. Raw token ve klinik içerik audit metadata'ya kopyalanmaz.

## Email

Invitation önce DB'ye commit edilir, sonra `@ogun/email` üzerinden gönderilir. Provider hatasında davet korunur ve delivery state `failed` olur. Resend token'ı döndürür ve yeni e-posta üretir. Davet e-postasında rol, uzmanlık, yedi günlük/tek kullanımlık bağlantı bulunur; task/evidence detayı bulunmaz. Verify bildirimi ayrı template ile gönderilir. Testlerde gerçek Resend çağrısı yerine enjekte edilen sender kullanıldı.

## Migration

Canonical migration `packages/db/drizzle/0034_old_vampiro.sql` ile iki invitation/preassignment tablosu, CHECK/FK/unique constraint'ler, operasyon index'leri ve audit event genişlemesi eklendi. Disposable PostgreSQL 16 üzerinde `pg_trgm` sonrasında `0000 → 0034` tam zinciri geçti. Ana seed, clinical ETL, RxNorm mapping, Ogun food ETL ve E2E fixture'ları başarıyla uygulandı. Uzak/Neon DB'ye migration uygulanmadı.

## Tests

```text
pnpm typecheck
  PASS — 9/9 Turbo task

pnpm lint
  PASS — 3/3 Turbo task

DATABASE_URL=<disposable PostgreSQL 16>
CLINICAL_WRITE_TESTS=1
PLATFORM_OPERATION_WRITE_TESTS=1
SUPPORT_WRITE_TESTS=1
CLINICAL_REVIEWER_WRITE_TESTS=1
pnpm test
  PASS — 9/9 Turbo task
  942 passed, 2 skipped

clinical-reviewer-operations.test.ts
  PASS — 9/9 gerçek PostgreSQL transaction testi

Web production build
  PASS — mevcut Sentry/Turbopack external uyarıları non-fatal

Admin production build
  PASS

Cargo
  PASS — 73/73
```

Kök `.env` içindeki eski şemalı harici DB özellikle migrate edilmedi. Entegrasyon testleri yalnız disposable PostgreSQL 16 üzerinde çalıştırıldı.

## Playwright

```text
Canonical suite: 11 passed, 1 skipped
  Skip: yalnız packaged Tauri native release round trip

Faz 4 reviewer suite: 1 passed, 0 skipped
  Gerçek Chromium + production admin/web server
  MFA, invite, iki task preassignment, yeni hesap, mevcut hesap,
  yanlış hesap, replay ve revoke durumları doğrulandı.
```

## Browser smoke

```text
Browser: NOT RUN — bağlı in-app browser yoktu.
HTTP: PASS — admin reviewer list, invite-create permission ve reviewer portal auth gate
       production serverlar üzerindeki gerçek Chromium akışında doğrulandı.
```

## Commits

Faz 4 implementation ve doğrulama commit listesi:

```text
83db804 | feat(db): add clinical reviewer invitation lifecycle
3299f80 | feat(email): add clinical reviewer invitation notifications
c90ef0c | feat(admin): add reviewer onboarding and assignment operations
60fccea | feat(web): add secure reviewer invitation activation flow
0d69539 | refactor(clinical): restrict reviewer queue to assigned work
1c7db39 | test(clinical): cover reviewer onboarding and assignment security
66ab9ae | docs(admin): document phase four reviewer operations
15c66f7 | test(clinical): include reviewer writes in root validation
```

Bu dosyayı ekleyen son dokümantasyon commit'i, içerik üretildikten sonra oluştuğu için yukarıdaki implementation listesine dahil değildir.

## Push

```text
Branch: master
Range: cfdb043..HEAD
Force push: kullanılmadı
Result: PASS — origin/master güncellendi
```

## Final state

```text
## master...origin/master
```

---

# Faz 6 Final Walkthrough — Abonelik Operasyonları

## Architecture

Plan kataloğu, limitler, fiyat sunumu, status policy, downgrade kontrolü ve drift detector `@ogun/subscription-core` ortak package'ına taşındı. Web ve admin bu kaynağı kullanır. Current state `clinics` + tek canonical `subscriptions` satırında, history append-only `subscription_events` içinde kalır. Web plan/iptal ve provider webhook yazımları transaction-aware ortak DB servislerine bağlandı.

## Subscription list/detail

Admin navigasyonundaki Abonelikler aktif edildi. `/abonelikler`, `subscriptions.read` ile server-side 25/50/100 pagination; search, plan, status, billing cycle, provider, cancel, trial-soon ve drift URL filtreleri sunar. Detail; klinik, plan, durum, dönem, masked provider referansları, usage, event timeline ve consistency sonucunu gösterir. `checkoutToken` platform projection'a girmez.

## SaaS vs clinic finance boundary

Bu yüzey yalnız Ogun → Klinik SaaS aboneliğidir. Danışan ödemeleri, seans paketleri, klinik gelir/gideri, MRR iddiası, card charge, refund, invoice ve payment-method operasyonu eklenmedi.

## Plans and limits

Canonical planlar `başlangıç`, `klinik`, `kurumsal` olarak korundu. Fiyat/limitler DB-editable yapılmadı. Kurumsal sıfır katalog fiyatı “Ücretsiz” değil “Özel fiyatlandırma” gösterilir. Downgrade, aktif danışan ve aktif kullanıcı limiti aşılırsa reddedilir; force downgrade yoktur.

## Usage

Aktif danışanlar soft-delete ve `aktif` status koşuluyla; kullanıcılar canonical clinic membership üzerinden; SMS mevcut subscription period içindeki `gönderildi` logları üzerinden hesaplanır. Üçü de ortak plan limitleriyle yan yana sunulur.

## Reconciliation

Injectable clock kullanan policy aktif klinik/eksik subscription, expired trial, süresi geçmiş cancel-pending aktif abonelik ve eksik manuel reference durumlarını açık mesajlarla raporlar. Generic “fix all” yoktur.

## Manual operations

`subscriptions.manage` altında ayrı actions: 1–90 gün trial uzatma, plan değişimi, billing-cycle değişimi, manuel aktivasyon, dönem sonu iptal, iptal reversal ve explicit state-machine kontrollü status correction. Her action 5–500 karakter gerekçe ister.

## External providers

Iyzico/PayTR için unsafe DB-only admin mutation server-side reddedilir; UI açıklayıcı fail-closed bildirim gösterir ve butonları sunmaz. Provider veya provider ID edit alanı yoktur. Provider webhook gerçek event ID'sini nullable unique idempotency alanında kullanır; sahte ID üretilmez.

## Event history

Event source değerleri `clinic_user`, `platform_staff`, `provider`, `system`; actor user/staff ve nullable unique provider event ID alanları eklendi. Timeline actor/source gösterir. Recursive secret redaction ve safe event projection raw payload sızıntısını engeller.

## Notifications

Anlamlı admin değişikliklerinde deterministic tek owner için transaction içinde outbox satırı açılır. Gönderim transaction sonrasındadır; provider failure business state'i geri almaz, delivery `failed` kalır ve retry ile `sent` olabilir. İçerik allow-list üzerinden üretildiği için provider secret/ID içermez.

## Audit

Business state + subscription event + platform audit aynı transaction'dadır. Event failure ve audit failure ayrı ayrı enjekte edilerek plan state rollback doğrulandı. Trial, plan, billing, cancel/reversal ve status action'ları ayrı audit isimleri taşır.

## Migration

```text
PostgreSQL: 16-alpine
Extensions: pg_trgm, unaccent
Migration: 0000 → 0036_cold_glorian
Result: PASS
Remote migration: NOT RUN
```

Ana seed, clinical ETL, RxNorm mapping ve OGUN food ETL aynı disposable veritabanında geçti. Container finalde durdurulup kaldırıldı.

## Tests

```text
pnpm typecheck: PASS — 10/10 Turbo task
pnpm lint: PASS — 3/3 Turbo task
pnpm test (all integration flags): PASS — 960 passed, 2 skipped
subscription DB integration: PASS — 5/5
subscription e-mail integration: PASS — 1/1
admin build: PASS
web build: PASS — existing Sentry/Turbopack warnings non-fatal
cargo check: PASS
cargo test: PASS — 73/73
```

İki root skip mevcut analytics ortam vakası ve packaged-Tauri release senaryosudur; test kapatılmadı.

## Playwright

```text
Canonical Chromium: PASS — 11 passed, 1 packaged-Tauri skipped
Faz 6 subscription Chromium: PASS — 1/1
```

Faz 6 akışı billing_ops login + MFA, subscription navigation/list/filter/detail, trial extension/event, activation, plan upgrade/limit sunumu, cancel/reversal, Iyzico mutation-button exclusion ve ayrı support-role permission denial'ını production admin build üzerinde doğruladı.

## Browser smoke

```text
Browser UI: NOT RUN — bağlı in-app browser bulunmadı.
HTTP/UI: PASS — list, detail, permission denied ve safe manual mutations gerçek Chromium production-server akışında doğrulandı.
```

## Commits

Faz 6 implementation ve status commit'leri (bu walkthrough handoff güncellemesi hariç):

```text
89a2659 | refactor(subscription): share plan definitions and policies
c48f1e5 | feat(db): add atomic subscription operations and history
ac1254c | feat(email): notify clinic owners about subscription operations
107c104 | feat(admin): add subscription operations dashboard
0a6092a | test(subscription): cover billing operations and provider safety
fe35b28 | test(subscription): isolate rollback and pagination coverage
66ed22d | docs(admin): document phase six subscription operations
```

## Push

```text
branch: master
range: 2ddec34..66ed22d
method: normal fast-forward
result: PASS — origin/master güncellendi
force push: no
```

## Final state

Final docs commit'i ve normal push sonrasında hedef durum:

```text
## master...origin/master
```

Bu walkthrough handoff güncellemesi ayrıca normal fast-forward push ile gönderilir; kesin hash'i kullanıcıya verilen son mesajdaki commit listesinde yer alır.

---

# Ogun Operasyon / Admin Platform — Faz 3 Walkthrough ve Son Rapor

Tarih: 9 Eylül 2026

Bu bölüm Faz 3'ün nihai raporudur. Faz 2 ve Faz 1 raporları aşağıda tarihsel kayıt olarak korunmuştur.

## Architecture

Destek sistemi ayrı bir clinic-level domain olarak kuruldu. Ticket kapsamı yalnız `clinicId` ve `requesterUserId`; danışan, tanı, ölçüm, laboratuvar veya diyet planı bağı yoktur. Klinik web uygulaması owner-scoped query/action'ları, admin uygulaması platform permission kontrollü operasyon query/action'larını kullanır. `apps/admin` ile `apps/web/src` arasında cross-app import oluşturulmadı.

## Database

Dokuz canonical PostgreSQL enum'u ve dört tablo eklendi:

- `support_tickets`: okunabilir `SUP-XXXXXXXX` referans, clinic/requester scope, type, area, reported impact, yalnız adminin belirlediği nullable priority, status ve assignment.
- `support_ticket_messages`: public/internal thread, ticket + client request idempotency ve exactly-one-author CHECK.
- `support_ticket_events`: append-only business history.
- `support_email_notifications`: requester snapshot'lı `pending`/`sent`/`failed` outbox state'i.

Queue, clinic activity, assignment, message/event chronology ve notification delivery kullanımlarına uygun index'ler; reference ve request idempotency unique constraint'leri eklendi. Ticket açıklaması ayrı bir description alanında tekrarlanmaz; ilk public mesaj canonical kaynaktır. Ticket/message silme veya düzenleme action'ı yoktur.

## Clinic workflow

Owner, `/ayarlar` içindeki **Destek & Geri Bildirim** kartından `/ayarlar/destek` sayfasına ulaşır. Tür, başlık, uygulama alanı, bildirilen etki ve 20–5000 karakter açıklamayla ticket oluşturur. P1–P4 seçimi gösterilmez. Açık ve geçmiş listeleri ayrıdır; detail sayfası public konuşmayı, durum ve insan-okunur referansı gösterir. Owner açık ticket'a yanıt verebilir ve resolved ticket'ta **Sorun devam ediyor** ile reopen yapabilir. Dietitian ve assistant hem UI hem DB action seviyesinde reddedilir.

Create/reply formları server-generated client request id ile idempotenttir. Eşzamanlı double-submit unique constraint yarışı gerçek PostgreSQL testiyle doğrulandı; mevcut ticket döner, ikinci ticket oluşmaz.

## Admin workflow

Admin sidebar'daki Destek aktif olarak `/destek` route'una bağlandı. Queue `tickets.read` gerektirir; arama, status, priority, type, area, clinic, assigned staff ve triage edilmemiş filtreleri URL query params ile server-side uygulanır. Pagination varsayılan 25, seçenekler 25/50/100'dür. Varsayılan sıra triage bekleyenleri, sonra açık P1–P4 talepleri son aktiviteye göre öne alır.

Detail ekranı priority, kendine/yetkili personele assignment, assignment kaldırma, canonical status geçişleri, public reply, belirgin internal note, zorunlu public açıklamalı resolve, close/reopen ve failed-email retry işlemlerini sunar. Mutasyonlar `tickets.manage` gerektirir; assignment hedefi active ve canonical permission matrix'e göre `tickets.manage` sahibi olmalıdır.

## State machine

Tek canonical helper tarafından server-side uygulanan graph:

```text
submitted          → triaged | in_progress | waiting_for_clinic | resolved
triaged            → in_progress | waiting_for_clinic | resolved
in_progress        → waiting_for_clinic | resolved
waiting_for_clinic → in_progress | resolved
resolved           → closed | reopened
closed             → reopened
reopened           → triaged | in_progress | waiting_for_clinic | resolved
```

Admin resolve geçişi yalnız zorunlu public çözüm action'ıyla yapılır. Klinik owner yalnız `resolved → reopened` yapabilir; closed ticket'ı reopen edemez. `waiting_for_clinic` ticket'a klinik yanıtı aynı transaction içinde `in_progress` durumu, activity timestamp'i ve event oluşturur. Mutation row'ları `FOR UPDATE` ile kilitlenerek eşzamanlı durum yarışları sıralanır.

## Privacy

Klinik sorguları `clinicId` zorunlu olacak şekilde ayrıdır; cross-clinic IDOR testi geçti. Clinic projection'ı priority, assignment, platform audit, delivery error veya internal metadata seçmez. Public mesaj sorgusu `visibility = 'public'` filtresini DB'de uygular; internal note RSC props/HTML/hydration/email'e taşınmaz. Form sağlık verisi ve kimlik bilgisi paylaşmama uyarısı gösterir. Attachment, upload ve client-health context yoktur.

## Email delivery

Ticket create, admin public reply, waiting-for-clinic, resolved, closed ve reopened olayları requester için transactional outbox kaydı oluşturur. Internal note, priority, assignment ve salt triage mail üretmez. DB commit sonrası mevcut `@ogun/email` sender ve Türkçe HTML/text template kullanılır; link origin'i server-side `OGUN_WEB_URL`'dir.

Provider hatası ticket'ı rollback etmez, notification `failed` olur. Atomic claim attempt count'i artırır; admin aynı failed kaydı retry edebilir, `sent` kayıt yeniden claim edilemez. Bu akış gerçek DB + enjekte edilen fake `EmailSender` ile, gerçek Resend API'sine çıkmadan doğrulandı.

## Audit

`support_ticket_events` ticket'ın business history'sidir; `platform_audit_logs` privileged staff operasyon audit'idir. Priority, assignment/unassignment, status, public reply ve internal note mutasyonları business değişikliği + event + success platform audit'i aynı transaction'da yazar. Harici e-posta bu transaction'ın dışındadır. Audit metadata mesaj body'lerini kopyalamaz; yalnız message/ticket kimlikleri ve from/to değerleri tutulur.

## Migration

Canonical migration: `packages/db/drizzle/0033_wakeful_odin.sql`.

Docker `postgres:16-alpine` disposable container'ında `pg_trgm` sonrası `0000`–`0033` zinciri geçti. Ana seed, clinical ETL (21.505 condition), RxNorm mapping (4.541 worklist / 3.548 candidate), Ogun food ETL (119 yemek / 2.380 değer) ve E2E seed başarılı oldu. Migration destructive `DROP`/`TRUNCATE` içermez. Uzak/Neon veritabanına migration uygulanmadı.

## Tests

```text
pnpm typecheck
  PASS — 9/9 Turbo task

pnpm lint
  PASS — 3/3 Turbo task

CLINICAL_WRITE_TESTS=1 PLATFORM_OPERATION_WRITE_TESTS=1 SUPPORT_WRITE_TESTS=1 pnpm test
  PASS — 9/9 Turbo task
  925 passed, 2 skipped toplamı

pnpm --filter @ogun/db exec vitest run src/queries/support.test.ts src/support-domain.test.ts
  PASS — 30/30

pnpm --filter @ogun/e2e test:admin-http
  PASS — 1/1

pnpm --filter web build
  PASS — mevcut Sentry/Turbopack external uyarıları non-fatal

pnpm --filter admin build
  PASS

pnpm --filter desktop test:production
  PASS — 2/2

cargo check
  PASS

cargo test
  PASS — 73/73
```

Yoğun paralel ilk koşuda mevcut Tanita PDF ve clinical search testleri 5 saniyelik varsayılan sınırı birer kez aştı; ikisi de tekil koşuda hızlıca geçti. Mevcut testleri kapatmadan, Faz 2'deki offline-index stabilizasyonuyla aynı yaklaşımla bu iki I/O testi 15 saniyelik workspace-load sınırına alındı; tam kök komut sonrası geçti.

## Playwright

```text
pnpm --filter @ogun/e2e test
  PASS — 11 passed, 1 packaged-Tauri release testi skipped

support-flow.spec.ts
  PASS — owner Settings → create → SUP reference/list → admin fixture priority/public/internal/resolve → clinic public-only thread
```

Admin UI'nin MFA'lı authenticated browser fixture'ı mevcut değildir; admin mutation zinciri real-DB integration seviyesinde, admin route/auth sınırı ayrı production HTTP smoke seviyesinde doğrulandı.

## Browser smoke

```text
Browser UI: NOT RUN — bu Codex oturumunda in-app Browser bağlantısı boş döndü.
HTTP: PASS — production admin /giris 200; /destek ve /destek/[ticketId] unauthenticated istekleri login sınırında kaldı (1/1).
```

Tarayıcı bağlantısı olmadığı için UI doğrulaması repo Playwright Chromium ile yapıldı.

## Commits

```text
c2adf5f | feat(db): add clinic support ticket domain
d93c217 | feat(email): add support ticket notifications
95bc5c1 | feat(web): add clinic support workflow
bf95143 | feat(admin): add support triage operations
fa80a15 | test(support): cover permissions lifecycle and delivery
000d583 | docs(admin): document phase three support operations
```

Bu listenin ardından gelen `walktrough.md` son rapor commit'i, kendi hash'i dosya içeriğine self-reference olmadan yazılamayacağı için yukarıdaki implementation listesine dahil değildir; kesin hash teslim mesajında verilir.

## Push

```text
branch: master
implementation range: 74f60de..000d583
result: PASS — origin/master'a normal fast-forward push
force push: no
```

Bu walkthrough ayrı bir normal fast-forward dokümantasyon commit'iyle aynı branche gönderilir.

## Final state

Walkthrough push'undan ve disposable container temizliğinden sonra doğrulanan hedef durum:

```text
## master...origin/master
```

Tracked çalışma ağacı temizdir. Disposable `ogun-phase3-pg` container'ı `--rm` politikasıyla kaldırılmıştır. Uzak DB şeması değiştirilmemiştir.

---

# Ogun Operasyon / Admin Platform — Faz 2 Walkthrough ve Son Rapor

Tarih: 9 Eylül 2026

Bu bölüm Faz 2'nin nihai raporudur. Alttaki Faz 1 raporu tarihsel kayıt olarak korunmuştur.

## 1. Architecture

Faz 1'deki ayrı `apps/admin` auth/RBAC sınırı korunarak platform operasyon katmanı genişletildi. Klinik ve kullanıcı sorguları `@ogun/db`, transactional email altyapısı yeni `@ogun/email`, normal web auth/reset akışı `apps/web`, persistent kurulum kimliği ise Tauri/Stronghold sınırında tutuldu. Admin uygulaması normal web kaynaklarını import etmez ve normal `sessions` ile `admin_sessions` ayrımı bozulmaz.

## 2. Database

`device_status` (`active`, `revoked`) enum'u ile `devices`, `device_user_links` ve `device_sessions` tabloları eklendi. Migration toplam 5 foreign key ve 7 index oluşturur. Installation ID'nin yalnız SHA-256 hash'i saklanır; device-user ilişkisi çoktan çoğa uygundur, device-session bağı yalnız canonical normal `sessions` tablosunadır ve cascade silinir.

Platform sorgu katmanı klinik liste/detail, üyelik, normal oturum ve cihaz okumalarını; tek/tüm session revoke ile device revoke/reactivate mutasyonlarını içerir. Kritik business mutation ile success audit aynı DB transaction'ında yürür.

## 3. Clinic operations

`/klinikler` gerçek DB üzerinde `q`, `plan`, `status`, `billing` ve `onboarding` filtreleriyle ve 25/50/100 server-side pagination ile çalışır. Liste klinik adı, plan, abonelik durumu, faturalama döngüsü, onboarding, kullanıcı sayısı, son normal session aktivitesi ve oluşturma tarihini gösterir.

`/klinikler/[clinicId]` Genel, Kullanıcılar, Oturumlar, Cihazlar ve salt okunur Abonelik tablarını sunar. Tab bazında `clinics.read`, `users.read`, `devices.read` kontrolleri server component içinde tekrar yapılır; yetkisiz erişim HTTP 403 üretir.

## 4. User/session operations

`/kullanicilar/[userId]?clinicId=...` güvenli kullanıcı alanları, üyelikler, normal oturumlar ve cihazları gösterir. Tek session revoke ve tüm normal session revoke gerçek server action + DB transaction üzerinden geçti. Entegrasyon ve HTTP smoke sonucunda hedef normal oturumlar silindi; aynı kullanıcıya ait `admin_sessions` satırı korunmaya devam etti. Session tokenları hiçbir projection veya UI modeline dönmez.

## 5. Password reset

Admin, kullanıcı için parola seçmez ve token üretmez. Sabit, browser girdisinden türetilmeyen `OGUN_WEB_URL` origin'indeki resmi Better Auth 1.6.29 `POST /api/auth/request-password-reset` endpoint'ini `{ email, redirectTo }` gövdesiyle çağırır. Başarılı istekten sonra kullanıcı bazında 60 saniyelik server-side cooldown uygulanır; başarı ve hata ayrı audit outcome'larıdır.

Disposable PostgreSQL testinde resmi Better Auth akışı gerçek verification tokenı üretti, callback'i çağırdı, tokenı tüketti ve yeni credential'ı açık metin yerine hash olarak oluşturdu. Token/URL loglanmadı ve admin audit metadata'sına girmedi.

## 6. Email architecture

Gönderici sözleşmesi, Resend implementasyonu ve Türkçe password-reset HTML/metin şablonu `packages/email` içindeki `@ogun/email` paketine taşındı. Web'in davet ve plan paylaşım e-postaları da ortak sender'ı kullanır. Better Auth `sendResetPassword` callback'i provider hatasını yutmaz; başarısız gönderim başarılı reset/audit gibi raporlanmaz.

## 7. Device registry

Desktop ilk ihtiyaçta Rust `OsRng` ile 32 bayt/256 bit rastgele bir installation ID üretir ve `ogun-installation-id` adıyla Stronghold'da kalıcı tutar. Bu değer credential değildir, MAC adresi değildir ve hardware attestation/fingerprint değildir. Native istekler değeri `X-Ogun-Device-Id` başlığında bearer session ile yollar; server kullanıcı ve session kimliğini yalnız doğrulanmış Better Auth session'dan alır. Raw ID DB'ye yazılmaz veya admin UI'da gösterilmez; yalnız 10 karakterlik hash fingerprint görünür. Last-seen yazımı 10 dakikaya throttle edilir.

## 8. Device enforcement

Device revoke yalnız o cihaza `device_sessions` üzerinden bağlı normal session'ları siler, revoke reason/time/staff kaydeder ve audit oluşturur. Aynı installation ID ile sonraki native Better Auth isteği `FORBIDDEN` olur. Header göndermeyen normal browser login/device akışı bu kontrolden etkilenmez. Reactivate cihazı yeniden aktif yapar; eski revoke olayı append-only audit geçmişinde kalır ve yeni login'e izin verilir.

## 9. Security boundaries

Admin projection'larında aşağıdakiler bilinçli olarak yoktur:

- `accounts.password`, OAuth access/refresh/id tokenları
- `sessions.token`, verification/reset tokenları
- TOTP secret ve backup code'ları
- raw installation ID
- danışan, ölçüm, laboratuvar, tanı, klinik not ve diyet planı verileri

Authorization istemci menüsüne bırakılmaz; her page/action kendi canonical permission'ını server-side doğrular. Klinik bağlamından gelen cihaz mutasyonları ayrıca cihazın o kliniğin bir üyesiyle ilişkisini DB join'iyle doğrular.

## 10. Migration

Canonical migration: `packages/db/drizzle/0032_panoramic_lockjaw.sql`.

Disposable Docker PostgreSQL 16 üzerinde `pg_trgm` önkoşulundan sonra `0000`–`0032` migration zinciri geçti. Ana seed, clinical ETL (21.505 condition dahil), RxNorm mapping, Ogun food ETL ve E2E seed uygulandı; Faz 2 gerçek DB entegrasyonları geçti. Migration uzak veritabanına uygulanmadı: kök ortamındaki uzak hedefin production/dev sınıfı güvenle belirlenemedi. Doğru hedef ve yedek planı teyit edildikten sonra `pnpm --filter @ogun/db db:migrate` kontrollü çalıştırılmalıdır.

## 11. Tests

```text
pnpm typecheck
  PASS — 9/9 Turbo task

pnpm lint
  PASS — 3/3 Turbo task, hata/uyarı yok

PLATFORM_OPERATION_WRITE_TESTS=1 pnpm test
  PASS — 9/9 Turbo task
  886 passed, 7 skipped toplamı

pnpm --filter @ogun/db test
  PASS — 14 files, 70 passed, 5 skipped

pnpm --filter web test
  PASS — 66 files, 426 passed, 1 skipped

pnpm --filter admin test
  PASS — 5 files, 17 passed

pnpm --filter @ogun/e2e test
  PASS — 10 passed, 1 packaged-Tauri release testi skipped

pnpm --filter admin build
  PASS

pnpm --filter web build
  PASS — mevcut Sentry/Turbopack external uyarıları non-fatal

pnpm --filter desktop test:production
  PASS — 2/2

cargo check
  PASS

cargo test
  PASS — 73/73
```

Kök testin yoğun paralel koşusunda offline besin indeksi testinin önceki 5 saniyelik sınırı bir kez aşıldı; tekil koşuda ürün davranışı geçti. Workspace yüküne uygun 15 saniyelik test sınırı verildikten sonra tam kök komutu geçti.

## 12. Smoke

```text
Browser UI: NOT RUN — bu Codex oturumunda bağlanabilir in-app browser bulunamadı.
HTTP: PASS — gerçek admin auth cookie/session ve disposable PostgreSQL ile.
```

HTTP smoke; filtreli klinik listesi, klinik detail, kullanıcı detail, kısıtlı rolde 403, token/parola sızıntısı kontrolü, tek/tüm normal session revoke, admin session korunması, device revoke/reactivate ve reset success/cooldown action transport'unu kapsadı. Normal web için otomatik Playwright browser suite'i ayrıca 10/10 geçti.

## 13. Commits

```text
fe2449a | feat(db): add platform clinic operations and device registry
9064004 | refactor(email): share transactional email and enable password reset
70b8989 | feat(admin): add clinic user and session operations
e950ad6 | feat(desktop): register persistent Ogun device identity
491e97e | test(platform): harden operation authorization and integration coverage
879ef07 | docs(admin): document phase two operations
698a3d1 | test(web): stabilize offline index under workspace load
<bu rapor commit'i> | docs(admin): add phase two final walkthrough
```

## 14. Push

```text
branch: master
implementation range: 34a2eea..698a3d1
result: PASS — normal fast-forward push
force push: no
```

Bu walkthrough ayrıca ayrı bir normal fast-forward dokümantasyon commit'iyle gönderilir; kesin hash son kullanıcı mesajındaki commit listesinde yer alır.

## 15. Final status

Walkthrough push'undan sonra doğrulanan hedef durum:

```text
## master...origin/master
```

Tracked çalışma ağacı temizdir. Disposable `ogun-phase2-pg` doğrulama container'ı kapanışta durdurulup `--rm` politikasıyla kaldırılmıştır. Uzak DB şeması değiştirilmemiştir.

---

# Ogun Operasyon / Admin Platform — Faz 1 Walkthrough ve Son Rapor

Tarih: 8 Eylül 2026

## Son durum

Faz 1 uygulama kodu tamamlandı ve dört mantıksal commit halinde kaydedildi. Ayrı admin uygulaması, platform personeli yetkilendirmesi, ayrı admin session sınırı, zorunlu TOTP MFA, platform permission matrix'i, append-only platform audit altyapısı, dashboard, denetim ekranı, personel listesi, bootstrap CLI ve deployment dokümantasyonu hazırdır.

Görevin operasyonel kapanışı için iki bilinçli açık nokta vardır:

1. `.env` içindeki veritabanı uzak bir Neon instance'ıdır. Migration 0031 bu uzak veritabanına otomatik uygulanmadı.
2. `master`, `origin/master` önünde bu görevden önce oluşturulmuş sekiz commit dahil toplam on iki commit taşımaktadır. İlgisiz commitleri istemeden göndermemek için push yapılmadı.

Migration uygulanıp root test yeniden çalıştırılmadan ve güvenli push hedefi belirlenmeden Faz 1 tamamen kapatılmış kabul edilmemelidir.

## 1. Mimari olarak ne değişti?

Monorepoya bağımsız bir Next.js uygulaması eklendi:

```text
apps/web    → mevcut son kullanıcı/klinik uygulaması
apps/admin  → ayrı Ogun Operasyon uygulaması
```

`apps/admin`, `apps/web/src` altından hiçbir şey import etmez. Ortak veritabanı ve domain erişimi yalnızca `@ogun/db` üzerinden yapılır.

Admin uygulaması aynı canonical PostgreSQL veritabanındaki mevcut `users` ve credential `accounts` kimliğini kullanabilir. Buna karşılık aşağıdaki güvenlik sınırları ayrıdır:

- Ayrı Better Auth instance'ı
- Ayrı `ADMIN_BETTER_AUTH_SECRET`
- Ayrı `ADMIN_BETTER_AUTH_URL`
- `ogun-admin` cookie prefix'i
- Ayrı `admin_sessions` tablosu
- En fazla sekiz saatlik session
- Yalnızca e-posta/şifre ve TOTP
- Public signup kapalı
- Google OAuth, Tauri bearer auth, one-time token ve clinic session alanları yok

## 2. Eklenen ve değiştirilen ana dosyalar

### Veritabanı

- `packages/db/src/schema/platform-admin.ts`
- `packages/db/src/schema/tenancy.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/queries/platform-admin.ts`
- `packages/db/src/queries/index.ts`
- `packages/db/src/scripts/platform-admin.ts`
- `packages/db/drizzle/0031_overrated_layla_miller.sql`
- `packages/db/drizzle/meta/0031_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- `packages/db/package.json`

### Admin uygulaması

- `apps/admin/package.json`
- `apps/admin/next.config.ts`
- `apps/admin/tsconfig.json`
- `apps/admin/eslint.config.mjs`
- `apps/admin/vitest.config.ts`
- `apps/admin/postcss.config.mjs`
- `apps/admin/src/lib/auth.ts`
- `apps/admin/src/lib/auth-client.ts`
- `apps/admin/src/lib/platform-authz.ts`
- `apps/admin/src/lib/platform-access.ts`
- `apps/admin/src/lib/platform-permissions.ts`
- `apps/admin/src/lib/platform-audit.ts`
- `apps/admin/src/app/api/auth/[...all]/route.ts`
- `apps/admin/src/app/(auth)/giris/**`
- `apps/admin/src/app/(auth)/iki-asama/**`
- `apps/admin/src/app/guvenlik/iki-asama-kurulum/**`
- `apps/admin/src/app/(app)/layout.tsx`
- `apps/admin/src/app/(app)/page.tsx`
- `apps/admin/src/app/(app)/denetim/page.tsx`
- `apps/admin/src/app/(app)/platform-personeli/page.tsx`
- `apps/admin/src/components/admin-shell.tsx`
- `apps/admin/src/components/sign-out-button.tsx`
- `apps/admin/src/app/globals.css`

### Yapılandırma ve dokümantasyon

- `.env.example`
- `turbo.json`
- `pnpm-lock.yaml`
- `docs/admin-deployment.md`
- `docs/admin-phase-1-status.md`
- `walktrough.md`

## 3. Yeni DB tabloları ve enumlar

### `platform_staff_role`

```text
super_admin
support
clinical_ops
food_editor
billing_ops
read_only
```

### `platform_audit_outcome`

```text
success
failure
```

### `platform_staff`

Platform authorization için canonical kaynaktır. `clinic_members.role`, `owner` veya `clinical_admin` ile bağlantılı değildir.

Alanlar:

```text
id
user_id
role
is_active
created_by
deactivated_at
created_at
updated_at
```

Bir kullanıcı için en fazla bir platform personeli satırı bulunabilir. Kayıt silmek yerine devre dışı bırakılır.

### `admin_sessions`

Admin browser session'larını normal `sessions` tablosundan ayırır.

```text
id
token
user_id
expires_at
ip_address
user_agent
created_at
updated_at
```

### `two_factors`

Better Auth 1.6.29'un kurulu plugin şeması incelenerek oluşturuldu:

```text
id
secret
backup_codes
user_id
verified
failed_verification_count
locked_until
```

TOTP secret ve backup code'lar Better Auth tarafından şifrelenir. Custom plain-text MFA kolonları kullanılmaz.

`users` tablosuna Better Auth plugin'inin beklediği `two_factor_enabled` alanı eklendi. Admin plugin'inin etkin olması normal web uygulamasında MFA zorunluluğu oluşturmaz.

### `platform_audit_logs`

Clinic/sağlık verisi audit sisteminden tamamen ayrıdır ve append-only kabul edilir.

```text
id
actor_user_id
platform_staff_id
action
entity_type
entity_id
clinic_id
outcome
reason
ip_address
user_agent
metadata
created_at
```

DB query katmanından update veya delete fonksiyonu export edilmez.

## 4. Migration

Canonical migration:

```text
packages/db/drizzle/0031_overrated_layla_miller.sql
```

Uygulama komutu:

```bash
pnpm --filter @ogun/db db:migrate
```

Bu komut mevcut `.env` dosyasında uzak Neon bağlantısı bulunduğundan otomatik çalıştırılmadı. Uygulamadan önce doğru hedef veritabanı ayrıca teyit edilmelidir.

## 5. Auth ve MFA akışı

```text
/giris
  → email/password
  → platform_staff var mı ve aktif mi?
  → hayır: generic erişim reddi, session oluşturulmaz
  → evet: Better Auth credential doğrulaması
  → TOTP aktifse /iki-asama challenge
  → TOTP aktif değilse kısa admin session
  → protected layout MFA eksikliğini görür
  → /guvenlik/iki-asama-kurulum
  → şifre tekrar doğrulama
  → QR/TOTP URI ve tek seferlik backup code gösterimi
  → TOTP verify
  → dashboard
```

Savunma katmanları:

- Login endpoint'i çalışmadan önce personel DB kontrolü
- Session oluşturulurken yeniden aktif personel kontrolü
- Her protected route request'inde session + staff + active + MFA kontrolü
- Her server-side veri okuma veya action'da permission kontrolü
- Client menü görünürlüğü authorization kaynağı olarak kullanılmaz

## 6. Permission matrix

Canonical dosya:

```text
apps/admin/src/lib/platform-permissions.ts
```

- `super_admin`: tüm permission'lar
- `support`: dashboard, klinik/kullanıcı/cihaz okuma ve ticket yönetimi
- `clinical_ops`: reviewer ve clinical task yönetimi/yayınlama
- `food_editor`: besin okuma, yazma ve yayınlama
- `billing_ops`: klinik okuma ve abonelik yönetimi
- `read_only`: yalnızca `.read` permission'ları

Server-side yardımcılar:

```ts
requirePlatformStaff()
requirePlatformPermission(...)
withPlatformPermission(...)
```

## 7. Platform audit yaklaşımı

`recordPlatformAudit` request header'larından IP ve user-agent toplar. `withPlatformAudit` ise başarılı operasyonlarda `success`, hata atan operasyonlarda `failure` kaydı üretir ve orijinal hatayı tekrar fırlatır.

Audit descriptor üzerinden action, entity, entity id, clinic id ve metadata türetilebilir. Bu tasarım recorder dependency injection ile unit test edilebilir.

Dashboard dışındaki gerçek Faz 1 ekranı `/denetim` rotasıdır. Yalnızca `audit.read` permission'ı ile açılır ve 50 satırlık server-side pagination kullanır.

## 8. İlk super admin bootstrap

Belirtilen e-posta önceden `users` tablosunda bulunmalıdır:

```bash
pnpm --filter @ogun/db platform-admin:grant --email admin@example.com --role super_admin
```

Komut:

- Yeni kullanıcı veya parola üretmez.
- Secret basmaz.
- Rol değerini allowlist ile doğrular.
- Mevcut staff kaydını idempotent biçimde aktifleştirir/günceller.
- `source=bootstrap_cli` metadata'sıyla audit oluşturur.

Erişimi iptal etmek ve ilgili admin session'larını silmek için:

```bash
pnpm --filter @ogun/db platform-admin:revoke --email admin@example.com
```

## 9. Local admin çalıştırma

Kök `.env` dosyasına aşağıdaki değerler eklenmelidir:

```dotenv
ADMIN_BETTER_AUTH_SECRET=<en-az-32-byte-rastgele-deger>
ADMIN_BETTER_AUTH_URL=http://localhost:3001
```

Ardından:

```bash
pnpm install
pnpm --filter admin dev
```

Adres:

```text
http://localhost:3001
```

## 10. Vercel'de ikinci proje

Aynı GitHub repository üzerinden yeni bir Vercel Project oluşturulmalıdır:

```text
Root Directory: apps/admin
Framework: Next.js
Production domain: https://admin.example.com
```

Normal web ve admin projeleri farklı Better Auth secret'ları kullanmalıdır. Admin cookie'leri host-only bırakılmalı ve üst domain genelinde paylaşılmamalıdır.

Ayrıntılar `docs/admin-deployment.md` içindedir.

## 11. Environment variables

Zorunlu:

```text
DATABASE_URL
ADMIN_BETTER_AUTH_SECRET
ADMIN_BETTER_AUTH_URL
```

`ADMIN_BETTER_AUTH_SECRET` eksikse admin uygulaması fail-fast davranır. Normal `BETTER_AUTH_SECRET` değerine örtük fallback yapılmaz.

## 12. Çalıştırılan testler ve sonuçları

### Başarılı

```text
pnpm --filter @ogun/db typecheck
  geçti

pnpm --filter @ogun/db test
  22 test geçti, 50 mevcut koşullu test skip

pnpm --filter admin typecheck
  geçti

pnpm --filter admin lint
  geçti, uyarı yok

pnpm --filter admin test
  13 test geçti

pnpm --filter admin build
  production build geçti

pnpm typecheck
  8 task geçti

pnpm lint
  3 task geçti
```

Admin test kapsamı:

- unauthenticated erişim reddi
- normal kullanıcının platform erişiminin reddi
- inactive staff reddi
- MFA enrollment gating
- aktif staff + MFA kabulü
- role permission matrix regresyonları
- başarılı audit kaydı
- başarısız audit kaydı ve hata propagation

## 13. Operasyonel kapanış — final rapor

Bu bölüm 8 Eylül 2026 tarihli disposable PostgreSQL doğrulamasından sonraki nihai durumu gösterir ve önceki ara durum notlarının yerine geçer.

### A. Database

```text
Migration static validation: PASS
Migration test target: disposable Docker PostgreSQL 16 (`ogun-admin-phase1-test`)
Migration applied remotely: no
Reason: kök `.env` hedefi uzak Neon (`ep-calm-heart-…neon.tech`, DB `neondb`); production/dev ayrımı güvenle doğrulanamadı.
Root tests after migration: PASS — 8/8 Turbo task; 871 pass, 7 skip
```

`0031_overrated_layla_miller.sql` statik incelemesinde yalnızca beklenen iki enum, dört tablo, `users.two_factor_enabled`, yedi foreign key ve sekiz index bulundu. `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, destructive `ALTER` veya güvenli default'u olmayan yeni `NOT NULL` alan yoktur.

Boş DB migrasyon zinciri, dokümante edilmiş `pg_trgm` önkoşulu kurulduktan sonra 0000–0031 arasında başarıyla çalıştı. Mevcut kullanıcı senaryosu ayrıca `users.two_factor_enabled` alanı kaldırılıp kullanıcı eklendikten sonra migration'daki gerçek `ADD COLUMN ... DEFAULT false NOT NULL` ifadesiyle tekrar uygulandı; eski satır `false` aldı ve `NULL` oluşmadı. Normal web kullanıcısının parola girişi de `twoFactorRedirect=false` ile geçti.

Uzak hedefe hiçbir schema değişikliği uygulanmadı. Ortam sahibi hedefi doğruladıktan ve yedek/rollback planını hazırladıktan sonra çalıştırılacak komut:

```bash
pnpm --filter @ogun/db db:migrate
```

### B. Real auth smoke test

Bağlı UI tarayıcısı bulunamadığı için browser-driven görsel admin smoke testi `NOT RUN` kaldı. Bunun yerine disposable DB'ye bağlı gerçek Next.js admin sunucusunda aynı auth uçları ve korumalı sayfalar HTTP üzerinden uçtan uca çalıştırıldı:

```text
browser-driven UI smoke: NOT RUN — bu oturumda bağlı tarayıcı yüzeyi yok
password login: PASS
MFA enrollment: PASS
TOTP verify: PASS
second login challenge: PASS
logout: PASS
staff revoke: PASS
normal user denied: PASS
inactive staff denied: PASS
```

Ek doğrulamalar:

- MFA öncesi `/` isteği enrollment rotasına yönlendi; enrollment ve TOTP doğrulamasından sonra dashboard, `/denetim` ve `/platform-personeli` 200 döndü.
- Logout sonrasında admin session silindi ve `/` yeniden `/giris` rotasına yönlendi.
- Revoke işlemi mevcut `admin_sessions` satırını sildi; aynı cookie artık erişim sağlamadı ve yeni login genel 401 mesajıyla reddedildi.
- Admin login normal `sessions` tablosuna yazmadı; admin oturumları yalnız `admin_sessions` tablosunda oluştu.
- Cookie'ler `ogun-admin.*` prefix'i, `HttpOnly` ve `SameSite=Lax` kullandı. Test geliştirme HTTP ortamında olduğundan `Secure=false`; production build'de ayar `true` olur.
- TOTP secret ve backup code değerleri sunucu loglarına yazılmadı.
- Bootstrap grant/revoke işlemleri audit tablosuna kaydedildi ve transaction içinde yürüdü.

### C. Commit inventory

| Hash                    | Subject                                                                     | Ana dosyalar                                         | Feature                                        | Push kararı                                               |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| `5c4ed77`               | `fix(panel): align appointments and quick-start cards`                      | `panel-screen.tsx`, desktop layout testi             | Panel yerleşimi                                | Güvenli                                                   |
| `30b21af`               | `fix(settings): resolve desktop settings subroutes`                         | settings rotaları, desktop settings API/adapter      | Desktop ayar alt rotaları                      | Güvenli                                                   |
| `6fc94c4`               | `fix(sync): separate workspace and catalog health`                          | sync engine/diagnostics, Tauri local DB              | Workspace/catalog health ayrımı                | Güvenli                                                   |
| `445bc60`               | `feat(measurements): parse Tanita BC-601 exports`                           | Tanita CSV/PDF parser ve 165 KB test fixture'ı       | Tanita parse                                   | Güvenli; binary yalnız test fixture'ı                     |
| `da791c7`               | `feat(measurements): persist Tanita device metrics`                         | migration 0030, measurement query/schema, desktop DB | Tanita persistence                             | Güvenli; Drizzle snapshot beklenen generated schema kaydı |
| `9cab69e`               | `feat(measurements): integrate Tanita import into shared form`              | measurement form/view, import control                | Tanita UI entegrasyonu                         | Güvenli                                                   |
| `5fbd19d`               | `test(desktop): cover panel settings sync and Tanita import`                | desktop smoke/testler, doğrulama dokümanı            | Desktop regresyon kapsamı                      | Güvenli                                                   |
| `7103985`               | `chore(release): bump Ogun version to 0.3.5`                                | Tauri/package sürümleri, release manifesti           | 0.3.5 release metadata                         | Güvenli                                                   |
| `e4ac566`               | `feat(db): add platform staff and admin auth foundation`                    | migration 0031, admin schema/query/CLI               | Admin DB temeli                                | Güvenli                                                   |
| `4ed16df`               | `feat(admin): scaffold operations app with isolated authentication and MFA` | `apps/admin`, lockfile                               | Ayrı admin auth ve MFA                         | Güvenli                                                   |
| `df66e8f`               | `feat(admin): add platform RBAC and audit foundation`                       | audit/personel sayfaları ve yardımcıları             | RBAC ve audit                                  | Güvenli                                                   |
| `27ba86b`               | `test(admin): add admin security tests and deployment documentation`        | `.env.example`, admin docs, `turbo.json`             | Test/deployment dokümantasyonu                 | Güvenli; yalnız placeholder env değerleri                 |
| `60f126e`               | `docs(admin): add phase one walkthrough report`                             | `walktrough.md`                                      | Faz 1 raporu                                   | Güvenli                                                   |
| `d077583`               | `feat(etl): add clinical catalog import and verification`                   | clinical importer/verifier, `.gitignore`             | Clinical entegrasyon source'u                  | Güvenli                                                   |
| `540a2c2`               | `fix(admin): close platform staff CLI database connection`                  | admin bootstrap CLI                                  | CLI'nin işlem sonunda kapanması                | Güvenli                                                   |
| `2864679`               | `test(workspace): stabilize database integration validation`                | `turbo.json`, `rxnorm-db.test.ts`                    | Test DB env aktarımı ve kanıtlı timeout sınırı | Güvenli                                                   |
| `0462461`               | `test(web): refresh panel visual baselines`                                 | light/dark panel PNG snapshot'ları                   | Kasıtlı panel düzeni baseline'ı                | Güvenli                                                   |
| `fbd48c9`               | `docs(admin): finalize phase one operational walkthrough`                   | `walktrough.md`                                      | Nihai kapanış raporu                           | Güvenli                                                   |
| bu push-sonucu commit'i | `docs(admin): record phase one push result`                                 | `walktrough.md`                                      | Push sonucu ve senkron durum kaydı             | Güvenli                                                   |

Commit diffleri tek tek incelendi. Credential/private key yoktur; yalnız `.env.example` placeholder değerleri içerir. Büyük dosyalar iki Drizzle schema snapshot'ı ve kasıtlı Tanita/Playwright test fixture-baseline dosyalarıdır.

### D. Pre-existing/uncommitted changes

| Dosya                                                 | Sınıflandırma                                              | İşlem                                                             | Commit                          |
| ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| `.gitignore`                                          | Amaçlı clinical artifact politikası                        | Clinical source commit'ine alındı; bundle/script de ignore edildi | `d077583`                       |
| `packages/etl/src/importers/clinical.ts`              | Gerçek, package script'i tarafından çağrılan source        | Typecheck + disposable import sonrası commitlendi                 | `d077583`                       |
| `packages/etl/src/verify-clinical.ts`                 | Gerçek doğrulama source'u                                  | 21.505 condition / 23.348 ürün doğrulaması sonrası commitlendi    | `d077583`                       |
| `ogun-clinical-db-integration/`                       | Taşıma paketi + yaklaşık 13 MB generated veri kopyası      | Silinmedi; repo kökünde ignore edildi                             | `d077583` (`.gitignore`)        |
| `scripts/apply-clinical-integration.mjs`              | Değişiklikleri zaten uygulanmış tek seferlik taşıma betiği | Silinmedi; ignore edildi                                          | `d077583` (`.gitignore`)        |
| `CLINICAL_DB_INSTALL_TR.md`, `DATA_MERGE_AUDIT_TR.md` | Taşıma paketindeki yerel kurulum/audit kopyaları           | Kullanıcının mevcut ignore tercihi korundu                        | `d077583` (`.gitignore`)        |
| `walktrough.md`                                       | Proje kökünde istenen Faz 1 raporu                         | Korundu, operasyonel sonuçlarla güncellendi                       | `60f126e` + nihai docs commit'i |

### E. New commits created

```text
d077583 feat(etl): add clinical catalog import and verification
540a2c2 fix(admin): close platform staff CLI database connection
2864679 test(workspace): stabilize database integration validation
0462461 test(web): refresh panel visual baselines
fbd48c9 docs(admin): finalize phase one operational walkthrough
<current> docs(admin): record phase one push result
```

### F. Push

```text
branch pushed: master
remote: origin (https://github.com/mirhanayd/ogun.git)
result: PASS — 8b486e3..fbd48c9 master -> master
force push: no
```

Bu push-sonucu dokümantasyon commit'i ayrıca normal fast-forward push ile gönderilir; onun kesin hash'i kullanıcıya verilen son mesajdaki commit listesinde yer alır.

### G. Final repository state

Push-sonucu commit'inin normal fast-forward push'undan sonra doğrulanan hedef durum:

```text
## master...origin/master
```

Ignored yerel entegrasyon/veri paketleri diskte korunur fakat `git status --short` çıktısında görünmez ve push'a dahil değildir.

## 14. Kalan teknik borçlar

- Kritik platform mutasyonlarında business write ve platform audit write mümkün olduğunca aynı DB transaction içinde atomik yürütülmelidir.
- Faz 1 kapsamında staff mutation UI eklenmedi; `/platform-personeli` salt okunurdur.
- Better Auth/Drizzle peer sürümü planlı bir dependency upgrade ve regresyon çalışmasında ele alınmalıdır.
- Preview ortamları production veritabanını paylaşmamalı; ayrı preview DB kullanılmalıdır.
- Bağlı tarayıcı sağlandığında UI seviyesindeki admin login/enrollment/TOTP smoke’u ayrıca çalıştırılmalıdır.

---

# OGUN Admin — Faz 5 Final Walkthrough

Tarih: 10 Eylül 2026

## Architecture

Besin ve tarif backoffice'i aynı `foods.read / foods.write / foods.publish` yetki sınırını paylaşır fakat sahiplik ve canonical veri modelleri ayrıdır. Admin food yazmaları yalnız `isPlatformManaged=true + source=OGUN` kayıtlarına gider. Tarif editörü yalnız `clinicId=null + isPlatformManaged=true` global sistem tariflerini yönetir. Tarif nutrient sonucu materialize edilmez; `recipe_nutrients` eklenmedi. Canonical tarif gerçeği ingredient food referansları, gramlar, cooked yield, servings ve exact cooking semantics'tir; sonuç `@ogun/nutrition-core` tarafından hesaplanır.

Admin route'ları:

```text
/besinler
/besinler/yeni
/besinler/[foodId]
/tarifler
/tarifler/yeni
/tarifler/[recipeId]
```

Besin listesi server-side arama/filtreleme ve 25 satırlık varsayılan pagination kullanır. Sidebar'da `Besin Veritabanı → Besinler / Tarifler` açıldı. Dashboard gerçek draft/review/published food ve draft/review recipe sayımlarını yalnız `foods.read` olduğunda gösterir.

## External source policy

BLS4, USDA_FDN, USDA_SR, TURKOMP ve OFF kayıtları admin detayında salt okunurdur. DB operasyon katmanı external row mutation'ını reddeder; dolayısıyla external `food_nutrients.valuePer100g` overwrite edilemez. Imported/ETL kayıtları migration default'uyla `isPlatformManaged=false / published` kalır. `CUSTOM` tenant domain'ine dokunulmadı. Yeni admin food, gerçek `data_sources.code=OGUN` satırını çözer; hardcoded source UUID veya silent fallback yoktur.

## Editorial lifecycle

Canonical transition graph hem food hem global recipe için server-side uygulanır:

```text
draft → in_review
in_review → draft | published
published → archived
archived → draft
```

Yeni kayıtlar draft başlar. Food publish `isVerified=true` ve publish metadata'sını set eder. Editorial status görünürlük/workflow durumudur; `isVerified` veri kalitesi işaretidir ve ikisi birleştirilmedi. Recipe publish `isPublic=true`, diğer durumlar `false` olur.

## Nutrient editor

Editör canonical `nutrients` kayıtlarını Makrolar, Vitaminler, Mineraller, Yağ asitleri, Amino asitler ve Diğer gruplarıyla gösterir. Ad/kod/birim serbest metin değildir. Değerler server-side decimal parse edilir; yalnız finite ve `>= 0` kabul edilir, duplicate nutrient reddedilir. OGUN nutrient satırları OGUN source ve `isPreferred=true` ile yazılır. Publish validator seed'deki gerçek `ENERC_KCAL`, `PROCNT`, `CHOCDF`, `FAT` kodlarını çözer. Mikro kapsam `known / total` olarak görünür.

## Provenance

Food ve recipe için ayrı `*_source_references` tabloları başlık, citation, opsiyonel HTTP(S) URL, not, oluşturan platform staff ve zamanı saklar. En az bir reference olmadan publish engellenir. `data_sources` sistem sahipliğini, reference ise gerçek citation/provenance'ı temsil eder.

## Portion model

Canonical standart porsiyon `food_portions.isDefault=true` ile tutulur. Duplicate `standardPortionGrams` alanı eklenmedi. Server ve DB; pozitif gram, boş olmayan etiket ve food başına en fazla bir default uygular. OGUN food publish için default portion zorunludur.

## Recipe calculation

`calculateRecipeNutrition` ingredient contribution'larını `valuePer100g × amountGrams / 100` ile toplar ve aynı sonuçtan total, cooked yield üzerinden 100 g ve servings üzerinden tek porsiyon değerlerini üretir. Admin ikinci bir manual nutrient override sunmaz. DB adapter yalnız preferred food nutrient satırlarını calculator'a verir.

## Missing nutrient semantics

Boş food nutrient alanı DB'ye yazılmaz. Recipe calculator bir ingredient'ta bilinmeyen nutrient'ı sıfır saymaz; o ingredient'ın gramını known coverage dışında bırakır. Sonuç her nutrient için `coveragePercent` ve `complete` taşır. Golden testte bir food'da eksik nutrient'ın kısmi coverage verdiği ve toplama sahte sıfır katmadığı doğrulandı.

## Cooking/yield

Cooked total ağırlık explicit `totalYieldGrams` üzerinden per-100g paydayı belirler. Cooking method, mevcut `retention_factors.method` ile exact eşleşirse canonical nutrient factor'ları uygulanır. Eşleşme yoksa rastgele factor seçilmez; admin `hesap malzeme bazlıdır / retention factor bulunamadı` uyarısını görür.

## Publication

Food publish; geçerli Türkçe ad, platform-managed OGUN sahipliği, dört required macro, default portion, provenance ve geçerli numeric satırlar ister. Recipe publish; ad, `servings >= 1`, pozitif yield, en az bir pozitif gramlı eligible ingredient, geçerli food/portion referansları, provenance, hesaplanmış sonuç ve required macro'larda tam coverage ister. Düşük micronutrient coverage gösterilir ancak keyfi threshold ile bloklanmaz.

## User-facing visibility

Server food search, tam offline index, hafif search index, nutrient pack ve index version sorguları yalnız published platform food'ları dahil eder; imported food'lar görünür kalır. Draft ve archive yeni plan/search seçimlerine sızmaz. ID bazlı tarihsel detail çözümleme eski plan/PDF referanslarını kırmamak için korunur. Dedicated Chromium testi ayrı web context'inde published food'un göründüğünü, draft food'un görünmediğini doğruladı.

## Audit/history

Food ve recipe mutation'ları append-only domain event üretir; platform audit ayrı privileged operator kaydıdır ve kontrollü metadata taşır. Publish status mutation + domain event + platform audit tek DB transaction'ındadır. Hem food hem recipe için audit FK insert failure enjekte edilerek publish rollback doğrulandı. Published kayıtlar hard-delete edilmez. Published global recipe bağımlılığı bulunan food archive işlemi dependency sayısıyla bloklanır.

## Migration

```text
PostgreSQL: 16-alpine
Extension: pg_trgm
Migration: 0000 → 0035_exotic_otto_octavius
Result: PASS
```

Temiz disposable DB üzerinde ana seed, clinical ETL, RxNorm mapping ve OGUN ETL uygulandı. Food doğrulaması `119 food / 2380 preferred nutrient / 119 portion / 708 ingredient / 119 indexed food` geçti. Migration additive'dir; destructive DDL yoktur. Remote/Neon migration uygulanmadı. Adı ve image'i doğrulanmış disposable container finalde durdurulup `--rm` ile kaldırıldı.

## Tests

```text
pnpm typecheck
  PASS — 9/9 Turbo task

pnpm lint
  PASS — 3/3 Turbo task

pnpm test
  PASS — 9/9 Turbo task
  948 passed, 2 skipped

@ogun/db food-catalog-operations.test.ts
  PASS — 3/3

@ogun/nutrition-core recipe.test.ts
  PASS — 3/3

admin build
  PASS

web build
  PASS — mevcut Sentry/Turbopack external uyarıları non-fatal

cargo check
  PASS

cargo test
  PASS — 73/73
```

Final root toplamındaki iki skip: web analytics ortam-bağımlı vaka ve packaged-Tauri release senaryosudur. Mevcut testler kapatılmadı.

## Playwright

```text
Canonical suite: PASS — 11 passed, 1 packaged-Tauri skipped
Faz 5 food catalog suite: PASS — 1/1 gerçek Chromium
```

Faz 5 suite'i production admin/web build'lerinde `food_editor` login + MFA enrollment, food create, macro/micro edit, default portion, reference, review/publish, global recipe create, published ingredient/grams, yield/servings, total/100g/serving preview, recipe review/publish ve web visibility akışını tamamladı.

## Browser smoke

```text
Browser: NOT RUN — in-app Browser bağlantısı kullanılabilir tarayıcı döndürmedi.
HTTP: PASS — production admin/web sunucuları ve user-facing food search endpoint'i gerçek Chromium Playwright akışında doğrulandı.
```

## Commits

Faz 5 implementation ve status commit'leri (bu walkthrough handoff commit'i hariç):

```text
1d40086 | feat(db): add food catalog editorial lifecycle and provenance
6773f66 | feat(nutrition): calculate system recipe nutrition coverage
8c38593 | feat(db): add transactional food and recipe operations
2b9723d | refactor(web): enforce published food catalog visibility
b8cfe99 | feat(admin): add food catalog operations
c80c08e | feat(admin): add system recipe editor and food dashboard
4799636 | test(food): cover permissions and catalog browser flow
f9df263 | docs(admin): document phase five food operations
```

## Push

```text
branch: master
range: c3ac4a7..f9df263
result: PASS — normal fast-forward push to origin/master
force push: no
```

Bu walkthrough handoff commit'i ayrıca normal fast-forward push ile gönderilir; kesin hash'i kullanıcıya verilen son mesajdaki commit listesinde yer alır.

## Final state

Walkthrough commit'inin normal fast-forward push'undan sonra hedeflenen ve yeniden doğrulanan durum:

```text
## master...origin/master
```
