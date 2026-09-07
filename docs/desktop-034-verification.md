# Desktop 0.3.4 doğrulaması

Bu patch, 0.3.3 local-first / ONE UI mimarisini korur. Kullanıcının mevcut ETL/clinical çalışma dosyaları bu patch'in commit kapsamına alınmaz.

## Gerçek runtime testi

`apps/desktop/scripts/tauri-runtime-smoke.mjs`, `target/release/ogun-desktop.exe` dosyasını açar; Electron/browser taklidi veya `layout-smoke` route'u kullanmaz. EXE'nin Windows ProductVersion ve SHA-256 değerlerini rapora yazar. WebView2 CDP yalnız test sırasında açılır. Gerçek Better Auth, PostgreSQL, native PIN/vault, şifreli SQLite, indexed catalog ve outbox çalışır.

Cloud origin istekleri testte localhost production Next sunucusuna taşınır; yanıtlar, repository veya selector callback'leri mock edilmez. Bu, canlı Vercel ortamının deployment testi değildir. Source veritabanından yalnız public reference catalog okunur; tüm sentetik kullanıcı/klinik/danışan yazmaları ayrı yerel `ogun_patch_034` veritabanına gider.

Hazırlık sırası:

1. Yerel PostgreSQL'de `ogun_patch_034` ve `pg_trgm` extension oluşturulur; mevcut Drizzle şeması uygulanır.
2. `DATABASE_URL` bu yerel veritabanına yöneltilerek `pnpm --filter @ogun/db db:seed` ve `pnpm --filter @ogun/e2e seed` çalıştırılır.
3. `CLINICAL_SOURCE_DATABASE_URL` gerçek canonical kaynak olarak ayarlanır veya hazırlayıcı kök `.env` kaynağını kullanır: `pnpm --filter @ogun/e2e exec tsx fixtures/prepare-desktop-smoke.ts`. Her runtime koşusundan önce yeni fixture hazırlanır.
4. Web build/test için `DATABASE_URL` yerel test veritabanı; `BETTER_AUTH_URL` ve `NEXT_PUBLIC_BETTER_AUTH_URL` `http://localhost:3100` olur.
5. `pnpm --filter web build` ve `pnpm --filter desktop build` çalıştırılır.
6. `OGUN_PACKAGED_SMOKE=1` ile `pnpm --filter @ogun/e2e test desktop-release.spec.ts` çalıştırılır. Playwright kendi production Next sunucusunu yönetir.

Test bitince yalnız kendi oluşturduğu native offline profil kaldırılır; önceki session token geri konur. Diğer kayıtlı hesaplar korunur ve ekran görüntülerinde maskelenir. Native provisioning'in mevcut Windows otomatik başlangıç davranışı Run kaydını test EXE'sine yöneltebilir; önceki değer `startup-before-smoke.json` içinde tutulur. Harness registry'yi elle değiştirmez. Testten sonra kurulu uygulamanın otomatik başlangıç hedefi ayrıca kontrol edilmelidir.

## A–AD kanıt eşlemesi

| Kabul | Otomatik kanıt |
| --- | --- |
| A–C | `desktop-login.presentation.test.ts`: gerçek DesktopLogin SSR, sıfır/bir profil ve email/password/saved section |
| D–F | `desktop-auth-state.test.ts`, source boundary testi; packaged offline submit, token mevcutken process restart, yanlış/doğru PIN ve unlock öncesi native read reddi |
| G–I | `local-clinical.test.ts`, batch clinical DB query testleri; gerçek cloud workspace → native badge ve legacy alanlarının ayrılığı |
| J–L | Rust SQLite clinical search testleri; packaged offline `diy`, `parol`, `metfor` sorguları |
| M–N | Gerçek offline ürün/substance autosave → process restart → outbox reconnect → gerçek web formu; web condition autosave → native pull |
| O–R | `local-branding.test.ts`, native queued-pull guard; packaged local logo/color save, shell güncellemesi, process restart, canonical pull |
| S–U | `client-list-activity.test.ts`, `local-client-list.test.ts`; gerçek measurement/appointment/dietitian içeren packaged tablo |
| V–Z | Native repository optimistic projection/role testleri, Rust role guard; gerçek owner assignment/outbox/replay, server dietitian/assistant reddi, gerçek web dietitian create self-assignment |
| AA–AD | Packaged ve web `keyboard-navigation.spec.ts`: tek görünür anchored panel, trigger geometrisi, modal yok, Ctrl+K, outside click, Escape, ArrowDown/Enter |

Source regex testleri runtime kanıtı yerine sayılmaz. Sıfır profilli form SSR/state testleriyle; gerçek native veri sınırı ayrıca Rust ve packaged process testleriyle korunur. Desktop offline dietitian self-assignment, gerçek repository metodunun optimistic transaction/outbox girdilerini inceleyen unit testle doğrulanır.

Canonical referans kopyasında 21.505 condition, 23.348 medication product ve 4.014 substance vardır. Aktif/seçilebilir snapshot 18.990 condition, 18.307 product ve 4.014 substance içerir; smoke küçük bir uydurma katalog kullanmaz ve snapshot sürümü/sayılarını native SQLite ile eşleştirir.

## Regresyon komutları

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `pnpm typecheck`
- `pnpm lint`
- Yerel DB environment ve `CLINICAL_WRITE_TESTS=1` ile `pnpm exec turbo run test --concurrency=1 --env-mode=loose --force`
- `pnpm --filter desktop test:production`
- Yukarıdaki ayrı packaged E2E komutu

Turbo test environment'ını açıkça geçirmek, testlerin kök `.env` veritabanına geri düşmesini önler. Tek paket concurrency'si, aynı makinede Rust/Next/Vitest/Chrome yükünün kısa DB test timeout'larını tüketmesini önler; assertion'lar gevşetilmez.

Eski analytics round-trip testi global ortalamanın yalnız kendi iki olayından oluştuğunu varsayıyordu. Artık repeatable-read transaction içinde mevcut duration'ları da hesaba katar; diğer test/kullanıcı olayları silinmez. Native OAuth unit testi de kendi cloud origin'ini açıkça stub eder ve test sonunda environment'ı geri alır.

Web suite'indeki tek `it.skip`, `analytics/track.test.ts` içindeki yalnız derleme zamanı negatif tip testidir; typecheck bunun `@ts-expect-error` sözleşmesini kontrol eder. Packaged test normal browser suite'inde opt-in nedeniyle atlanır ve ayrıca gerçek EXE ile çalıştırılır.

## Görsel referans incelemesi

Eski Win32 referansları `ab89361` commit'indeki UI'a aitti. Marketing `0211b54` ve sonraki commit'lerle, uygulama da shared screens ile önceden değişmişti. Bu patch landing tasarımını değiştirmez. Eski panel/finans/tarifler readiness metinleri güncel ekran karşılıklarına taşındı. Açık/koyu temadaki 18 değişen referans tek tek görsel incelendi; 404 referansları değişmedi. Panelde yalnız canlı selamlama/tarih maskelenir; besin arama ekranında indeks hazır olmadan screenshot alınmaz. Snapshot güncelleme koşusu tek başına PASS kanıtı değildir; normal karşılaştırma ayrıca çalıştırılır.

## Production screenshot dosyaları

Kök: `apps/desktop/src-tauri/target/release-smoke/`

1. `01-login-email-password-saved-account.png`
2. `02-offline-login-notice.png`
3. `03-anamnesis-canonical-condition.png`
4. `04-offline-disease-search.png`
5. `05-offline-medication-search.png`
6. `06-settings-clinic-logo.png`
7. `07-settings-custom-brand-color.png`
8. `08-restart-same-branding.png`
9. `09-clients-real-activity-dietitian.png`
10. `10-owner-dietitian-assignment-dialog.png`
11. `11-search-anchored-under-topbar.png`

`report.json` yalnız bütün packaged assertion'lar geçince yazılır. PNG/fixture/raporlar build target altında kalır; kişisel local veritabanı Git'e eklenmez.
