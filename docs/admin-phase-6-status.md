# Ogun Admin Faz 6 — Abonelik Operasyonları

Faz 6, Ogun → Klinik SaaS aboneliklerinin operasyonel yönetimini `apps/admin` içine ekler. Klinik → danışan tahsilatları, seans paketleri, klinik gelir/giderleri, charge, refund, invoice ve ödeme yöntemi operasyonları bilinçli olarak kapsam dışıdır.

## Shared plan definitions

`PLAN_DEFINITIONS`, trial limitleri, fiyat etiketleri, downgrade preflight, status transition ve deterministic drift policy artık `@ogun/subscription-core` içindedir. Web ve admin aynı canonical kaynağı kullanır; admin-editable plan tablosu oluşturulmadı. `kurumsal` planın sıfır katalog fiyatı UI'da “Özel fiyatlandırma” olarak gösterilir.

## Current state ve event history

`clinics.subscriptionStatus` ve `clinics.trialEndsAt` erişim/current-state kaynağıdır. Klinik başına tek `subscriptions` satırı plan, billing cycle, provider, dönem ve iptal bayrağını taşır. Append-only `subscription_events` geçmişi artık `clinic_user`, `platform_staff`, `provider`, `system` source semantiği; nullable actor alanları ve nullable unique provider event ID içerir.

Web plan seçimi ve iptal isteği transaction-aware DB servislerine taşındı. Provider webhook durumu ve unique provider event kaydı aynı transaction'da işlenir. Admin detail timeline'ı actor/source bilgisini ve yalnız bilinen güvenli metadata'yı gösterir; recursive redaction token, secret, authorization, card, paymentCard, apiKey ve checkoutToken anahtarlarını maskeler.

## Liste, detail ve usage

`/abonelikler` route'u `subscriptions.read` ister, 25 varsayılanlı server-side pagination ve URL query parametreli search/plan/status/billing/provider/cancel/trial-soon/drift filtreleri sunar. Hızlı filtreler aktif, trial, yakında bitecek trial, past due, iptal bekleyen, iptal edilmiş ve tutarsız kayıtları kapsar.

`/abonelikler/[clinicId]` klinik/current-state, dönemler, masked provider referansları, aktif kullanıcı, aktif danışan, canonical dönemden SMS kullanımı, limitler, event timeline ve consistency sonucunu gösterir. `checkoutToken` hiçbir platform projection'a seçilmez. Klinik detail abonelik tabı canonical yönetim sayfasına bağlanır.

## Manual vs external provider safety

Yalnız `manuel` provider için ayrı ve açık operasyonlar vardır: trial uzatma, plan değişimi, billing-cycle değişimi, aktivasyon, dönem sonu iptal, iptal talebi geri alma ve kontrollü status düzeltmesi. Provider/providerCustomerId/providerSubscriptionId/checkoutToken için editable form yoktur. Iyzico/PayTR satırlarında DB-only mutation butonları gösterilmez ve server operation katmanı ayrıca `external_provider` hatasıyla fail-closed davranır.

## Trial, plan, cancellation ve status

Trial uzatma doğrudan `clinics.trialEndsAt` üzerinde çalışır, abonelik satırı gerektirmez, 1–90 tam gün sınırı ve 5–500 karakter gerekçe uygular. Plan downgrade öncesi aktif danışan/kullanıcı sayıları canonical limitlere karşı kontrol edilir; limit aşımı force edilemez. `cancelAtPeriodEnd` erişimi anında kesmez ve yeni subscription satırı açmadan geri alınır. Status düzeltmeleri explicit state machine ile doğrulanır; `cancelAtPeriodEnd` bir status değildir.

## Reconciliation

Injectable clock kullanan saf policy şu durumları raporlar:

- aktif klinik + eksik subscription satırı;
- süresi geçmiş trial;
- dönem sonu geçmiş cancel-pending aktif abonelik;
- manuel provider için eksik teknik subscription reference uyarısı.

Generic fix/sync/repair-all aksiyonu yoktur. Her düzeltme domain-aware explicit action'dır.

## Notifications ve audit

Anlamlı admin değişiklikleri için en eski `joinedAt`, ardından ID sırasıyla ilk owner deterministic recipient seçilir. `subscription_email_notifications` pending/sent/failed outbox'ı event ile aynı business transaction'da oluşturulur; gönderim transaction sonrasında yapılır. Provider hatası abonelik değişikliğini rollback etmez, failed delivery daha sonra yeniden denenebilir. E-posta allow-list business alanları kullanır ve provider ID/secret içermez.

Admin business state + subscription event + platform audit aynı DB transaction'ındadır. Audit veya event insert failure enjekte edildiğinde state rollback olur. Audit action'ları trial, plan, billing cycle, cancel request/reversal ve status correction operasyonlarını ayrı kaydeder.

## Permissions

Liste/detail `subscriptions.read`, tüm mutation action'ları `subscriptions.manage` ile server-side korunur. `billing_ops` iki izne sahiptir; `support` ikisine de sahip değildir; `read_only` yalnız read alır. Hem permission unit testi hem gerçek Chromium support-denied akışı mevcuttur.

## Migration ve doğrulama

Canonical generator `0036_cold_glorian.sql` migrasyonunu üretti. Migration additive'dir: iki enum, subscription event actor/source/idempotency alanları ve owner notification outbox'ı ekler. Remote/Neon migration uygulanmadı.

Disposable `postgres:16-alpine` üzerinde `pg_trgm` ve `unaccent` kurulup `0000 → 0036` zinciri geçti. Ardından ana seed, clinical catalog ETL (21.505 condition), RxNorm mapping (4.541 worklist / 3.548 candidate) ve OGUN food ETL (119 food / 2.380 nutrient / 119 portion / 708 ingredient) çalıştırıldı. Container kapanışta kaldırıldı.

## Test özeti

- Root typecheck: 10/10 Turbo task.
- Root lint: 3/3 Turbo task.
- Root test, tüm integration bayrakları açık: 960 passed, 2 skipped.
- Subscription DB integration: 5/5.
- Subscription e-mail integration: 1/1.
- Canonical Playwright Chromium: 11 passed, 1 packaged-Tauri skipped.
- Faz 6 Playwright Chromium: 1/1.
- Admin production build: PASS.
- Web production build: PASS; mevcut Sentry/Turbopack external warnings non-fatal.
- Cargo check: PASS.
- Cargo test: 73/73.
- In-app Browser UI: NOT RUN; bağlı browser sağlanmadı. Production HTTP/UI smoke gerçek Chromium Playwright ile kapsandı.
