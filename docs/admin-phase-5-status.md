# Ogun Admin Faz 5 — Operasyonel Durum

Faz 5, global besin kataloğu ve sistem tarifleri için production-grade operasyon backoffice'ini tamamlar. Yönetim yüzeyi yalnız platform kapsamındadır; klinik danışan verileriyle join yapmaz ve tenant tariflerini açmaz.

## Food ownership ve external source policy

`foods.is_platform_managed` sahiplik sınırıdır. Mevcut ve gelecekteki ETL kayıtları varsayılan olarak `false / published` kalır. BLS4, USDA_FDN, USDA_SR, TURKOMP ve OFF kaynakları admin detayında görüntülenebilir ancak yazma fonksiyonları hem `isPlatformManaged=true` hem `data_sources.code=OGUN` koşulunu ister. Bu nedenle harici `food_nutrients.value_per_100g` satırları admin tarafından overwrite edilemez. `CUSTOM` klinik/kullanıcı domain'ine dokunulmaz.

Admin tarafından oluşturulan besinler server-side olarak OGUN kaynağını kodundan çözer, `isPlatformManaged=true`, `editorialStatus=draft`, `isVerified=false` başlar. OGUN kaynağı yoksa işlem kontrollü hata verir; UUID veya başka kaynağa fallback yoktur. `searchText`, mevcut Türkçe normalizasyon helper'ıyla server-side üretilir.

## Editorial lifecycle ve doğrulama

Besin ve global tarifler aynı canonical state machine'i kullanır:

```text
draft -> in_review
in_review -> draft | published
published -> archived
archived -> draft
```

Geçişler client değerine güvenmeden DB operasyon katmanında doğrulanır. `editorialStatus` editoryal görünürlüktür; `isVerified` mevcut veri kalitesi semantiğidir. Besin başarılı publish olduğunda ayrıca `isVerified=true`, `publishedAt` ve `publishedByPlatformStaffId` set edilir. Global tarif publish olduğunda `clinicId=null` korunur ve `isPublic=true`; draft/review/archive durumlarında `isPublic=false` olur.

## Nutrient editörü ve missing semantiği

Editör `nutrients` tablosundaki canonical tanımları kategori, kod ve birimleriyle gösterir; serbest nutrient adı veya birim kabul etmez. Değerler server-side decimal olarak parse edilir, virgül ondalık ayracı desteklenir, yalnız sonlu ve sıfırdan büyük/eşit değerler yazılır. Duplicate nutrient ID reddedilir. Boş alan hiç satır üretmez: missing/unknown değer otomatik sıfıra çevrilmez.

OGUN besin nutrient satırları gerçek `data_sources.code=OGUN` kaydıyla ve `isPreferred=true` yazılır. Publish validator canonical seed'den `ENERC_KCAL`, `PROCNT`, `CHOCDF` ve `FAT` kodlarını çözer. UI ayrıca makro dışı preferred nutrient sayısını toplam makro dışı tanım sayısına oranlayarak mikro besin kapsamını gösterir.

## Portion ve provenance modeli

Standart porsiyon yalnız `food_portions.is_default` ile temsil edilir; food üzerinde duplicate gram alanı yoktur. Uygulama ve DB katmanları `grams > 0`, boş olmayan etiket ve food başına en fazla bir default uygular. Published OGUN food en az bir default porsiyon taşımalıdır.

Food ve recipe provenance ayrı append-only reference tablolarında tutulur. Başlık ve citation zorunlu, URL opsiyoneldir ve verilirse HTTP(S) olmalıdır. Publish sırasında en az bir reference gerekir. `data_sources` kaynak sistemini, reference kaydı ise gerçek citation/not bilgisini temsil eder.

## Recipe calculation, yield ve retention

Admin yalnız `isPlatformManaged=true` ve `clinicId=null` global tarifleri yönetir. Malzeme seçimi canonical food'a bağlanır; imported food veya published platform food kullanılabilir, draft/archive platform food kullanılamaz. Gram pozitif olmalı ve opsiyonel portion aynı food'a ait olmalıdır.

Tarif nutrient sonucu tabloda saklanmaz ve `recipe_nutrients` oluşturulmaz. `packages/nutrition-core` içindeki tek calculator preferred food nutrient değerlerinden şu çıktıları üretir:

```text
ingredient contribution = valuePer100g * amountGrams / 100
total = ingredient contribution toplamı
per100g = total / cooked yield * 100
per serving = total / servings
```

Bir nutrient'ı bilinmeyen ingredient hesaba sıfır olarak girmez. Sonuç, bilinen ingredient gramının toplam ingredient gramına oranından coverage üretir ve tam/kısmi durumunu taşır. Yield pozitif, servings pozitif tam sayı olmalıdır. Cooking method ancak exact canonical retention factor eşleşmesi varsa uygulanır; eşleşme yoksa rastgele factor seçilmez ve admin preview uyarı gösterir.

Recipe publish; ad, porsiyon, pozitif cooked yield, en az bir geçerli ingredient, pozitif gramlar, reference, başarılı hesap ve dört required macro için yüzde 100 coverage ister. Düşük mikro coverage gösterilir fakat gerekçesiz eşik ile bloklanmaz.

## User-facing visibility ve archive

Platform-managed food için yalnız `published` kayıtlar server search, tam offline indeks, hafif search indeks, nutrient pack ve cache version sorgularına girer. Imported katalog davranışı `(isPlatformManaged=false)` dalıyla korunur. Tarihsel plan/PDF çözümleme, eski referansları kırmamak için ID bazlı detay yolunu korur.

Published global recipe'de kullanılan food archive edilemez; hata aktif bağımlılık sayısını verir. Archive hard delete yapmaz, ilişkileri ve geçmişi korur, kaydı yeni seçimlerden çıkarır. Published food/recipe için hard-delete admin action'ı yoktur.

## Permissions, audit ve history

Route ve server action'lar canonical matrisi kullanır:

- `foods.read`: liste ve detay
- `foods.write`: draft oluşturma, içerik düzenleme, review'a gönderme
- `foods.publish`: publish, archive, review'dan draft'a dönüş

`food_editor` üç izne de sahiptir; `support` ve `clinical_ops` food izinlerine sahip değildir; `read_only` yalnız `foods.read` alır. Rol stringleri action içinde hardcode edilmez.

Food ve recipe mutation'ları append-only domain event üretir. Platform audit yalnız privileged operator action ve sınırlı metadata taşır. Publish için status/isVerified veya isPublic mutation'ı, domain event ve platform audit aynı transaction'dadır. Audit FK insert'i başarısız olduğunda food ve recipe publish rollback testleri bunu doğrular.

## Migration ve disposable PostgreSQL

Canonical Drizzle migration `0035_exotic_otto_octavius.sql` ve generator snapshot'ı eklendi. Migration additive'dir; existing row default'u `is_platform_managed=false / editorial_status=published` olduğu için mevcut ETL kataloğu güvenle görünür kalır. Destructive `DROP`, `TRUNCATE` veya remote migration uygulanmadı.

Disposable `postgres:16-alpine` üzerinde `pg_trgm` kuruldu ve temiz veritabanında `0000 -> 0035` zinciri geçti. Ardından ana seed, clinical ETL, RxNorm mapping ve OGUN ETL uygulandı. OGUN doğrulaması:

```text
63 nutrient / 6 exchange group / 7 data source
119 food / 2380 preferred nutrient / 119 portion / 708 ingredient
offline index: 119 / 119
```

Container test sonunda durdurulup `--rm` davranışıyla kaldırılır.

## Validation sonucu

```text
pnpm typecheck
  PASS — 9/9

pnpm lint
  PASS — 3/3

pnpm test
  PASS — 9/9 Turbo task
  948 passed, 2 skipped
  canonical Playwright: 11 passed, 1 packaged-Tauri skipped

food catalog DB integration
  PASS — 3/3

nutrition-core recipe golden test
  PASS — 3/3

food catalog Playwright
  PASS — 1/1 gerçek Chromium

admin production build
  PASS

web production build
  PASS — mevcut Sentry/Turbopack uyarıları non-fatal

cargo check
  PASS

cargo test
  PASS — 73/73
```

Dedicated Chromium akışı; food_editor MFA enrollment, canonical macro + micronutrient, default portion, provenance, review/publish, global recipe ingredient/yield/servings, calculated total/100g/serving preview, recipe provenance/publish ve ayrı web context'inde published-visible/draft-hidden aramasını doğrular.

In-app Browser bağlantısı oturumda tarayıcı sunmadığı için bağımsız browser smoke çalıştırılamadı. Production HTTP ve UI yolu gerçek Chromium Playwright'ın ayağa kaldırdığı admin/web production server'larında başarıyla doğrulandı.
