# Desktop 0.3.5 doğrulaması

Bu patch, mevcut ONE UI ve local-first mimariyi koruyarak panel hizasını, explicit ayarlar rotalarını, core/katalog sync ayrımını ve ortak ölçüm formundaki Tanita BC-601 importunu doğrular.

## Gerçek runtime smoke

`apps/desktop/scripts/tauri-runtime-smoke.mjs` gerçek release EXE'sini ve WebView2'yi çalıştırır. Cloud-origin istekleri yalnız test sırasında localhost production Next sunucusuna yönlendirilir; Better Auth, PostgreSQL, şifreli native SQLite, outbox ve reconciliation gerçektir. Sentetik yazmalar yalnız `ogun_patch_035` yerel veritabanına gider.

Smoke şunları assert eder:

- Maksimize edilmiş 1440px+ packaged viewport'ta yaklaşan randevular ve hızlı başlangıç top-edge farkı en fazla 1px'tir.
- Ekip, hatırlatmalar, paylaşım ve veri güvenliği kartları distinct desktop route ve gerçek shared view açar.
- Core sync `Güncel` iken simüle edilen `clinical_catalog_version` HTTP 503 yalnız katalog uyarısı üretir; core state bozulmaz ve katalog bağımsız toparlanır.
- Gerçek `Başlıksız.csv`, shared MeasurementForm'u doldurur; dosya seçimi autosave yapmaz.
- Offline kaydetme encrypted local entity ve outbox üretir; aynı fingerprint engellenir, process restart sonrası kayıt kalır ve reconnect ile sunucuya senkronlanır.
- `rD` yalnız `dailyCalorieIntakeKcal`, `ww` yalnız `bodyWaterPct` olarak kalır; canonical BMR ve su-litresi alanları boş kalır.

Hazırlama ve çalışma:

```powershell
$env:DESKTOP_SMOKE_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/ogun_patch_035'
pnpm --filter @ogun/e2e exec tsx fixtures/prepare-desktop-smoke.ts

$env:DATABASE_URL=$env:DESKTOP_SMOKE_DATABASE_URL
$env:BETTER_AUTH_URL='http://localhost:3100'
$env:NEXT_PUBLIC_BETTER_AUTH_URL='http://localhost:3100'
pnpm --filter web build
pnpm --filter desktop build
$env:OGUN_PACKAGED_SMOKE='1'
pnpm --filter @ogun/e2e test desktop-release.spec.ts
```

## Production screenshots

Kök: `apps/desktop/src-tauri/target/release-smoke/`

- `panel-aligned-upcoming-quickstart.png`
- `settings-team.png`
- `settings-reminders.png`
- `settings-sharing.png`
- `sync-current.png`
- `sync-catalog-warning.png`
- `tanita-source-selected.png`
- `tanita-csv-imported.png`
- `tanita-device-details.png`

`report.json` yalnız bütün packaged assertion'lar geçince yazılır. Build ve smoke çıktıları `target/` altında kalır ve Git'e eklenmez.
