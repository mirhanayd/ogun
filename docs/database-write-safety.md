# Database Write Safety

Bu politika migration, schema push, seed, ETL, yönetim CLI'ı ve veritabanına yazan testlerin yanlış hedefe çalışmasını önler. CLI araçları kök `.env` dosyasını kendiliğinden yüklemez. `DATABASE_URL` komutu çalıştıran süreçte açıkça bulunmalıdır.

## Hedef sınıflandırması

Yalnız `localhost`, `127.0.0.1` ve `::1` local kabul edilir. Diğer tüm hostname'ler remote kabul edilir; branch adı, kullanıcı adı, provider veya hostname içindeki `dev`, `staging`, `prod` gibi kelimeler güven sinyali değildir.

Preflight yalnız `postgresql://host:port/database`, `local|remote` sınıfı ve kısa SHA-256 fingerprint gösterir. Kullanıcı adı, parola ve query parametreleri gösterilmez.

## Local geliştirme

PowerShell örneği:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/ogun'
pnpm --filter @ogun/db db:migrate:check
pnpm --filter @ogun/db db:migrate
pnpm --filter @ogun/db db:seed
```

`db:migrate:check` yalnız target ve policy kontrolü yapar; bağlantı açmaz. Local test, seed ve ETL komutları açık local `DATABASE_URL` ile çalıştırılmalıdır.

Temiz PostgreSQL kurulumu için `0000` migration'ından önce `pg_trgm` extension'ı yetkili operatör tarafından etkinleştirilmelidir; ilk migration'daki trigram GIN index'i `gin_trgm_ops` kullanır. Bu extension kontrolü production preflight ve backup/change record içinde açıkça kaydedilir.

## Remote migration/ETL

Remote yazma için aşağıdaki koşulların tamamı gerekir:

- `DB_ALLOW_REMOTE_WRITE` tam olarak `true` olmalı.
- `DB_WRITE_TARGET` tam olarak `staging` veya `production` olmalı.
- `DB_EXPECTED_HOST` parse edilen hostname ile birebir eşleşmeli.
- `DB_EXPECTED_DATABASE` parse edilen database adıyla birebir eşleşmeli.
- Production için `DB_PRODUCTION_WRITE_CONFIRM`, preflight'ta gösterilen fingerprint ile birebir eşleşmeli.

Önce `pnpm --filter @ogun/db db:migrate:check` çalıştırın. Production confirmation eksik olduğunda komut fingerprint'i gösterip reddeder; change record ve ikinci kişi kontrolünden sonra aynı fingerprint'i `DB_PRODUCTION_WRITE_CONFIRM` olarak verip check'i yeniden çalıştırın. Check başarılı olmadan gerçek `db:migrate` çalıştırmayın.

Remote `db:push`, `db:seed`, `db:seed:demo`, E2E/integration/write testleri her koşulda reddedilir. Remote seed veya push için override yoktur. Gereken şema değişikliği gözden geçirilebilir migration olarak üretilmelidir.

## ETL komut envanteri

| Komut grubu | DB davranışı | Policy |
| --- | --- | --- |
| `etl:bls`, `etl:usda`, `etl:ogun`, `etl:clinical` | DB write | Local veya explicit guarded remote ETL |
| `etl:rxnorm-mappings` | Varsayılan DB write; `--dry-run` read-only | Write modunda canonical guard |
| `clinical-review:sync-openfda` | Varsayılan DB write; `--dry-run` read-only | Write modunda canonical guard |
| `repair:nutrition --apply`, `etl:rxnorm:verify --apply` | DB write | Apply modunda canonical guard |
| `clinical-interactions.ts` doğrudan CLI | Varsayılan DB write; `--dry-run` read-only | Write modunda canonical guard |
| `etl:bls:headers`, `etl:usda:nutrients`, `etl:ogun:audit` | Dosya/audit read-only | DB write guard gerekmez |
| `etl:ogun:verify`, `audit:nutrition`, `etl:e2e`, `etl:clinical:verify` | DB read-only | Açık URL gerekir; mutation intent gerekmez |
| openFDA extract/download/verify ve bundle araçları | Dosya/network artifact; DB mutation yok | DB write guard gerekmez |

`platform-admin:grant`, `platform-admin:revoke` ve `db:translate-foods` da DB mutation yaptığı için aynı remote intent modelini kullanır. Seed ve bütün test fixture komutları yalnız local hedefte çalışır.

## `.env` yükleme sınırı

Next.js uygulama başlangıcında framework ortam yükleme davranışı korunur. DB client, Drizzle config, seed/ETL ve write-test CLI'ları ise kök `.env` keşfetmez veya yüklemez. Shell, CI secret store ya da açık `node --env-file=<onaylı-dosya>` kullanımı operatörün görünür tercihidir.
