# 2026-09-11 Unintended Remote Migration

## Incident summary

Faz 7 doğrulamasının ilk aşamasında `pnpm --filter @ogun/db db:migrate` komutu, local `DATABASE_URL` açıkça verilmediği için `packages/db/drizzle.config.ts` tarafından kendiliğinden yüklenen kök `.env` içindeki remote Neon hedefini kullandı. `0037_cool_madripoor` beklenmeyen remote hedefe uygulandı.

Remote hedefin development, staging veya production olduğu güvenilir deployment metadata'sıyla doğrulanamadı. Sınıflandırma `UNKNOWN` olarak tutulur; hostname veya provider bilgisinden environment çıkarımı yapılmaz.

## Impact

- `0037_cool_madripoor` remote hedefte uygulanmış durumdadır.
- Migration additive tablolar, kolonlar, enum'lar ve index'ler ekledi.
- Olay sırasında `s7-*` test fixture'ları remote hedefe yazıldı ve daha sonra hedefli biçimde temizlendi.
- Business verisi silinmedi.

## What changed

Remote şemaya `0037` içindeki operasyon tabloları, teslimat durumu, nullable/default kolonlar ve index'ler eklendi. Faz 7 doğrulamasına ait `s7-*` fixture'ları geçici olarak oluştu, sonra hedefli transaction ile kaldırıldı. Kod tarafında Faz 7.1 ile DB mutation CLI'ları explicit target guard arkasına alındı.

## What did not change

- `0038_backfill-provider-event-namespace` remote DB'ye uygulanmadı.
- `0037` için `DROP`, rollback veya schema removal yapılmadı.
- Hedefli cleanup business satırlarını kapsamına almadı.
- Bu remediation sırasında remote DB'ye migration, seed, ETL, fixture veya test write çalıştırılmadı.

## Fixture cleanup

Yalnız Faz 7 test kimlikleriyle ilişkilendirilen `s7-*` kayıtları hedefli transaction ile temizlendi. 2026-09-11 salt-okunur yeniden doğrulamasında kullanıcı, klinik, üyelik, danışan, randevu, abonelik, SMS, subscription event/outbox, webhook receipt, finding ve job-run alanlarında aggregate kalıntı sayısı `0` bulundu. İsim, e-posta, telefon veya başka row-level PII seçilmedi ya da raporlanmadı.

## Why rollback was not performed

`0037` additive ve güncel kodla backward-compatible bir şema değişikliğidir. Rollback tablo/kolon düşürerek veri kaybı ve çalışan kodu bozma riski yaratır. Bu nedenle migration yerinde bırakıldı; gelecekte gereken değişiklikler forward-fix migration ile yapılacaktır.

## Root cause

Sistemik kök neden, DB CLI'ın root `.env` dosyasını sessizce yükleyerek implicit remote target seçimine izin vermesidir. Komutun hedefi çağrı noktasında açıkça belirtilmek zorunda değildi ve migration engine başlamadan önce local/remote target policy kontrolü yoktu.

## Contributing factors

- Operatör local `DATABASE_URL` override'ını vermedi.
- Normal `db:migrate` doğrudan `drizzle-kit migrate` çalıştırıyordu.
- Beklenen hostname/database eşleşmesi ve explicit remote-write intent modeli yoktu.
- Production confirmation veya credential içermeyen target fingerprint gösterilmiyordu.
- Seed, ETL ve test-write yollarında tek canonical target guard bulunmuyordu.

## Detection

Migration çıktısı ile remote migration journal ve oluşturulan fixture'ların incelenmesi hedef sapmasını görünür yaptı. Olay sonrası hedefli cleanup yapıldı ve durum Faz 7 raporunda acceptance istisnası olarak açıkça kaydedildi.

## Remediation

- Drizzle config, paylaşılan DB client, seed, demo seed, çeviri ve desktop smoke CLI'larından örtük kök `.env` yükleme kaldırıldı.
- `db:migrate` ve `db:push` safe wrapper arkasına alındı.
- `db:migrate:check` bağlantı açmadan sanitized preflight yapar.
- ETL mutation modları ile platform-admin yazmaları canonical guard kullanır.
- Web, admin, DB, ETL ve Playwright write-test girişleri remote targetı reddeder.

## Preventive controls

- Local yalnız `localhost`, `127.0.0.1` ve `::1` olarak tanınır; diğer hostlar remote'dur.
- Remote migration/ETL açık opt-in, explicit environment ve beklenen host/database eşleşmesi gerektirir.
- Production migration ayrıca gösterilen target fingerprint'in birebir confirmation değerini gerektirir.
- Remote `db:push`, seed, demo seed ve veritabanına yazan testler override olsa bile reddedilir.
- Preflight kullanıcı adı, parola ve query parametresi göstermez.
- Process regression testi, remote görünümlü kök `.env` varken explicit URL yoksa migration'ın network öncesinde durduğunu doğrular.

## Current remote migration state

`db:verify:phase7-incident` aracı `READ ONLY` transaction içinde migration dosyalarının SHA-256 hash'lerini `drizzle.__drizzle_migrations` ile karşılaştırdı, şema nesnelerinin varlığını denetledi ve yalnız aggregate fixture count hesapladı.

| Kontrol | Sonuç |
| --- | --- |
| Environment sınıfı | `UNKNOWN` |
| Hedef fingerprint | `2444-D8A3` |
| `0037_cool_madripoor` | Uygulanmış |
| `0038_backfill-provider-event-namespace` | Uygulanmamış |
| Faz 7 tabloları ve `subscription_events.provider` | Mevcut |
| Aggregate `s7-*` fixture kalıntısı | `0` |

Uyumluluk sonucu:

- `runtime requires 0038`: **no** — `0037` güncel kodun kullandığı şema nesnelerini sağlar ve yeni event'ler provider namespace ile yazılır.
- `historical correctness requires 0038`: **yes** — eski provider event'lerinde null namespace replay/idempotency boşluğu bırakır.
- `safe deployment before 0038`: **no** — runtime açılabilse de tarihsel provider event replay doğruluğu garanti edilmez.

## Remaining manual action

Yetkili insanlar önce remote hedefin gerçek environment'ını güvenilir provider/deployment metadata'sıyla doğrulamalıdır. Backup/checkpoint ve change record sonrasında `0038`, yalnız guarded migration akışıyla, explicit secure `DATABASE_URL`, environment, beklenen host/database ve production ise fingerprint confirmation kullanılarak uygulanmalıdır. Bu belge veya remediation otomatik `0038` uygulama yetkisi vermez.
