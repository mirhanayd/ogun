# OGUN Faz 7.1 — Final Walkthrough

## Root cause

Sistemik kök neden, DB mutation CLI'larının kök `.env` dosyasını sessizce yükleyip implicit remote target seçimine izin vermesiydi. Local `DATABASE_URL` override'ının verilmemesi katkıda bulunan operatör faktörüydü; asıl eksik kontrol explicit hedef zorunluluğu ve migration engine öncesi local/remote policy guard'ının bulunmamasıydı.

## Code-level remediation

`packages/db/drizzle.config.ts`, paylaşılan DB client, seed/demo/translation ve desktop smoke write yollarından implicit root `.env` yükleme kaldırıldı. Canonical `database-target` modülü PostgreSQL URL'sini parse eder, yalnız loopback hostları local sayar, credential içermeyen target/fingerprint üretir ve tüm mutation policy'lerini fail-closed uygular.

Normal `db:migrate` ve `db:push` artık wrapper üzerinden çalışır. `db:migrate:check` yalnız preflight yapar ve bağlantı açmaz. `platform-admin` yazmaları, ETL mutation modları, Vitest write suite'leri, Playwright config'leri ve E2E fixture scriptleri aynı hedef güvenliğiyle sınırlandırıldı.

## Migration command before/after

Önce:

```text
db:migrate -> drizzle-kit migrate
drizzle.config.ts -> ../../.env dosyasını implicit yükler
```

Sonra:

```text
db:migrate       -> tsx src/scripts/migrate.ts
db:migrate:check -> tsx src/scripts/migrate.ts --check
db:push          -> tsx src/scripts/push.ts
```

Wrapper explicit `DATABASE_URL` ister, sanitized preflight gösterir, policy geçmeden Drizzle'ı başlatmaz. Config yalnız `process.env.DATABASE_URL` kullanır ve eksikken `DATABASE_URL is not explicitly set` hatası verir.

## Seed/ETL safety

`db:seed` ve `db:seed:demo` yalnız explicit local targetta çalışır; remote override yoktur. BLS, USDA, Ogun, clinical, RxNorm, clinical-review sync, nutrition repair apply ve reviewed-interaction write modları canonical guard kullanır. Read-only/audit modları DB mutation intent istemez. Ayrıntılı sınıflandırma `docs/database-write-safety.md` içindedir.

## Remote write policy

Local allowlist yalnız `localhost`, `127.0.0.1`, `::1` değerleridir. Diğer tüm hostlar remote kabul edilir. Remote migration/ETL için aşağıdakilerin tamamı gerekir:

- `DB_ALLOW_REMOTE_WRITE=true`
- `DB_WRITE_TARGET=staging|production`
- parse edilen hedefle eşleşen `DB_EXPECTED_HOST`
- parse edilen hedefle eşleşen `DB_EXPECTED_DATABASE`
- production için doğru `DB_PRODUCTION_WRITE_CONFIRM`

Remote `db:push`, seed, demo seed ve write/integration testleri bu değerler verilse bile reddedilir. Branch, `NODE_ENV`, `APP_ENV`, hostname kelimeleri veya developer machine state güven sinyali değildir.

## Production migration confirmation model

Operatör önce secure secret injection ve expected host/database değerleriyle `db:migrate:check` çalıştırır. Preflight sanitized target ve kısa SHA-256 fingerprint gösterir. Production check, fingerprint confirmation eksikken sonucu gösterip reddeder. İkinci operatör targetı doğruladıktan sonra fingerprint birebir confirmation olarak verilir; check yeniden geçmeden gerçek migration başlatılmaz. Credential hiçbir preflight/log çıktısında gösterilmez.

## Remote DB read-only verification

2026-09-11 doğrulaması yalnız `READ ONLY` transaction ile yapıldı. Migration dosyalarının SHA-256 hash'leri journal ile karşılaştırıldı, şema nesnesi varlığı ve aggregate fixture sayısı okundu; row content veya PII seçilmedi.

```text
0037_cool_madripoor: applied
0038_backfill-provider-event-namespace: not applied
0037 schema objects: present
s7-* fixture aggregate count: 0
target fingerprint: 2444-D8A3
```

Bu görev sırasında remote hedefe migration, seed, ETL, fixture veya test mutation uygulanmadı.

## 0037 state

`0037` remote DB'de uygulanmış ve additive şema nesneleri mevcut durumdadır. `DROP`, rollback veya schema removal yapılmadı. Destructive rollback veri kaybı ve çalışan kodu bozma riski taşıdığı için migration yerinde bırakıldı; gerekli değişiklikler forward-fix olmalıdır.

## 0038 state

`0038` remote DB'ye uygulanmadı. Yetkili insanlar gerçek environment'ı güvenilir metadata ile doğrulayıp backup/change record hazırladıktan sonra ayrı guarded migration akışıyla uygulamalıdır.

## Remote environment classification

```text
Environment classification: UNKNOWN
```

Neon hostname'i veya connection string bilgisi development/staging/production ayrımı için yeterli ve güvenilir metadata değildir.

## 0037/0038 runtime compatibility

```text
runtime requires 0038: no
historical correctness requires 0038: yes
safe deployment before 0038: no
```

`0037` güncel uygulamanın kullandığı tablo/kolon/index şemasını sağlar; yeni provider event'leri namespace ile yazılır. `0038` ise eski provider event'lerindeki null namespace'i backfill eder. Uygulama açılabilse de `0038` öncesinde tarihsel webhook replay/idempotency doğruluğu tamamlanmış sayılmaz.

## Incident documentation

Postmortem `docs/incidents/2026-09-11-unintended-remote-migration.md` altında olay özeti, etki, değişen/değişmeyen durum, cleanup, rollback kararı, kök neden, katkı faktörleri, detection, remediation, preventive controls, remote migration state ve kalan manuel aksiyonlarla kaydedildi. Production operasyon ve backup/restore runbook'ları guarded akışla güncellendi.

## Tests

```text
database-target unit/process regression: 17/17 passed
root pnpm typecheck: 10/10 Turbo tasks passed
root pnpm lint: 3/3 Turbo tasks passed
root pnpm test: 10/10 Turbo tasks passed
  991 passed, 2 skipped
  tüm DB write flag'leri açık ve explicit disposable local target
canonical Playwright: 11 passed, 1 packaged Tauri native skip
```

Kritik process regression testi temp root `.env` içine fake unreachable remote URL yazdı, child process ortamından `DATABASE_URL` değerini kaldırdı ve gerçek migration wrapper'ının network/Drizzle başlangıcından önce fail ettiğini doğruladı. Explicit fake remote URL de opt-in eksikken network öncesinde reddedildi. İlk disposable E2E çağrısındaki eski fixture credential'ı local DB için yeniden seed edildi; ardından final kök/canonical koşu temiz geçti.

## Disposable migration

`postgres:16-alpine` ile yalnız `127.0.0.1:55471` üzerinde disposable `ogun_phase71` DB oluşturuldu. `pg_trgm`/`unaccent` ardından `0000 → 0038` zincirinin 39 migration kaydı geçti. Aynı hedefte:

```text
reference seed: 63 nutrient, 6 exchange group, 7 data source
clinical ETL: 21,505 condition, 90,259 alias, 23,348 medication product
RxNorm: 4,541 worklist, 3,548 distinct candidate
Ogun ETL: 119 food, 2,380 nutrient row, 119 portion, 708 ingredient
clinical review sync: 323 task
```

## Builds

```text
web production build: passed, 62 generated routes
admin production build: passed, 32 listed routes
cargo check: passed
cargo test: 73/73 passed
```

Web build'inde mevcut Sentry/Turbopack external-package ve Better Auth test-secret uyarıları non-fatal kaldı; derleme başarılıdır.

## Commits

Faz 7.1 implementasyon commitleri (bu walkthrough'u ekleyen finalizasyon commit'i hariç):

```text
c4c6c4d fix(db): require explicit targets for database writes
bdf5062 fix(etl): guard write tooling and test targets
301f4c5 test(db): prevent implicit remote migration regressions
f7290b4 docs(ops): close phase seven migration incident
```

## Push

`master`, force push kullanılmadan normal fast-forward ile `origin/master` üzerine gönderildi.

## Final git status

Final doğrulamada `master` ile `origin/master` aynı committe ve working tree temizdir. Disposable `ogun-phase71-validation-20260911` PostgreSQL konteyneri doğrulama tamamlandıktan sonra kaldırıldı.
