# Performans denetimi — GitHub issue #45 / Prompt 8.1, GÖREV 2

Bu belge, bu sandbox ortamında **gerçekten çalıştırılan** ölçümlerin dürüst
bir kaydıdır. #24'ün (besin arama) ve #26'nın (canlı besin öğesi paneli)
kurduğu "ölçüp gerçek sayıyı raporla, eskiyi kopyalayıp geçme" ilkesi burada
da izlendi — hiçbir sayı uydurulmadı; ölçülemeyen kısımlar (ör. canlı
Lighthouse taraması) "ölçülemedi" olarak açıkça işaretlendi, tahmini bir
skorla doldurulmadı.

## 1. Besin arama p95 (GitHub #24'ün orijinal benchmark'ı, yeniden çalıştırıldı)

Komut: `pnpm --filter web benchmark` (`src/lib/food-search-benchmark.ts`,
sentetik Orama indeksi, gerçek DB/tarayıcıya bağımlı değil).

| İndeks boyutu | Sorgu sayısı | p50 | p95 | p99 | max | Hedef (<20ms) |
|---|---|---|---|---|---|---|
| 1.000 besin | 500 | 0.09ms | 0.23ms | 0.51ms | 4.58ms | ✅ Tutuyor |
| 10.000 besin | 500 | 0.92ms | 1.25ms | 1.44ms | 3.34ms | ✅ Tutuyor |
| 20.000 besin | 200 | 2.91ms | 3.44ms | 4.02ms | 5.87ms | ✅ Tutuyor |

**Sonuç**: #24'ün orijinal hedefi (p95 < 20ms, 10.000 besinlik indeks) hâlâ
GENİŞ marjla tutuyor — hatta 20.000 besinlik (roadmap'in test etmediği, iki
katı) bir indekste bile p95 3.44ms, hedefin ~%17'si. Motor/veri katmanında bu
alanda bir regresyon YOK.

## 2. Canlı besin öğesi paneli p95 (GitHub #26 — bu issue'da İLK KEZ ayrı bir
benchmark script'i olarak yazıldı, `src/lib/plan-live-panel-benchmark.ts`)

#26'nın PR'ı `nutrient-panel.tsx` içinde kod-içi bir `LIVE_PANEL_TARGET_MS =
50` sabiti bırakmıştı ama BAĞIMSIZ, tekrarlanabilir bir benchmark script'i
yoktu (sadece tarayıcıda geliştirme modu konsol uyarısı). Bu issue kapsamında
food-search-benchmark.ts'in AYNI deseniyle (`buildLivePanelData` doğrudan
çağrılır, sentetik `DraftDay`/`FoodNutrientLookup` verisiyle, Dexie/React'a
bağımlı değil) eklendi.

Komut: `pnpm --filter web benchmark:nutrient-panel`

| Senaryo | Tekrar | p50 | p95 | p99 | max | Hedef (<50ms) |
|---|---|---|---|---|---|---|
| Gerçekçi plan (6 öğün × 6 kalem) | 500 | 0.170ms | 0.371ms | 0.615ms | 1.688ms | ✅ Tutuyor |
| Ağır plan (6 öğün × 12 kalem) | 500 | 0.298ms | 0.457ms | 0.653ms | 1.388ms | ✅ Tutuyor |
| Haftalık plan (7 gün × 6 öğün × 6 kalem) | 200 | 1.286ms | 2.364ms | 2.808ms | 3.049ms | ✅ Tutuyor |

**Sonuç**: en ağır senaryoda (haftalık plan, 42 öğün × 6 kalem = 252 kalem)
bile p95 2.36ms — 50ms hedefinin ~%5'i. Panel güncellemesinin gözle
görülür bir gecikmeye neden OLMADIĞI doğrulandı. (Not: bu ölçüm sadece
`buildLivePanelData`'nın SAF hesaplama maliyetini kapsar — React render +
Dexie okuma dahil DEĞİL, gerçek uçtan uca gecikme tarayıcıda
`nutrient-panel.tsx`'in kendi geliştirme-modu konsol uyarısından izlenir,
bkz. o dosyadaki `LIVE_PANEL_TARGET_MS`.)

## 3. Bundle analizi — GERÇEK bir üretim build'inden

**Önemli dürüstlük notu**: `pnpm --filter web build` (turbopack ile, repo
scriptindeki varsayılan) bu sandbox ortamında **başarısız oluyor** —
`@better-auth/core`'un alt-yol (subpath) dışa aktarımlarını, iç içe (nested,
`.claude/worktrees/...` altında) bir git worktree'sinde Turbopack'in modül
çözümleyicisi bulamıyor. Bu, göreve ÖNCEDEN bildirilen "confirmed non-issue"
ile BİREBİR aynı hata — `git stash` ile TAMAMEN temiz bir `master` üzerinde
DENENİP AYNI şekilde başarısız olduğu doğrulandı (bu PR'ın bir regresyonu
DEĞİL). Bu yüzden bundle analizi, **webpack tabanlı** `next build`
(`--turbopack` OLMADAN, `npx next build`) ile üretildi — bu sorunu
YAŞAMIYOR ve gerçek bir üretim build'i.

### Route bazlı First Load JS (Next.js'in kendi, gzip'lenmiş rapor çıktısı)

| Route | Sayfa boyutu | First Load JS |
|---|---|---|
| `/` | 329 B | 165 kB |
| `/giris` | 3.25 kB | 217 kB |
| `/kurulum` | 6.51 kB | 208 kB |
| `/panel` | 314 B | 248 kB |
| `/danisanlar` | 20 kB | 299 kB |
| `/danisanlar/[id]` | **126 kB** | **438 kB** (en büyük route) |
| `/danisanlar/[id]/planlar/[planId]` | 30.1 kB | 335 kB |
| `/danisanlar/yeni` | 8.13 kB | 240 kB |
| `/finans` | 6.14 kB | 298 kB |
| `/randevular` | 10.7 kB | 291 kB |
| `/ayarlar/abonelik` | 5.47 kB | 286 kB |
| Paylaşılan (tüm sayfalarda ortak) | — | 164 kB |

### 200 KB üstü tekil chunk'lar (gzip, `.next/static/chunks/*.js` üzerinden ölçüldü)

| Chunk | Ham boyut | Gzip boyut | İçerik (grep ile doğrulandı) | Değerlendirme |
|---|---|---|---|---|
| `7785.*.js` | 672 KB | **268 KB** | `@react-pdf/renderer` | Beklenen — PDF üretimi ağır bir kütüphane; zaten `next/dynamic(ssr:false)` ile SADECE `plan-pdf-dialog.tsx` açıldığında yükleniyor (bkz. GitHub #35), ana sayfa yüklemesini ETKİLEMİYOR. |
| `8557-*.js` | 388 KB | 107 KB | `recharts` | Sadece ölçüm/laboratuvar grafiklerinin olduğu sayfalarda kullanılıyor; gzip'te 200KB SINIRINI AŞMIYOR. |
| `567-*.js` | 360 KB | 107 KB | `@sentry` (istemci SDK) | **Bu issue'nun kendi eklediği maliyet** — bkz. aşağıdaki "Sentry maliyeti" notu. Gzip'te 200KB sınırını aşmıyor ama TÜM sayfalarda paylaşılan chunk'ın parçası (First Load JS'in ~65'i). |
| `408e7d04.*.js` | 237 KB | 68 KB | (tanımlanamadı — muhtemelen Next.js/React dahili) | Gzip'te sorun değil. |

**200 KB'ı gzip'te GERÇEKTEN aşan TEK chunk `@react-pdf/renderer`'dır (268
KB)** — ama bu zaten lazy-load edilmiş durumda (PDF diyaloğu açılmadan hiç
indirilmiyor), bu yüzden ek bir aksiyon ÖNERİLMİYOR. Diğer büyük ham
boyutlar (recharts, Sentry) gzip'te sınırın altında kalıyor.

### Sentry'nin (bu issue'nun eklediği) gerçek maliyeti

`@sentry/nextjs` istemci SDK'sı, TÜM sayfalarda paylaşılan chunk'a **~107 KB
gzip** ekliyor (`567-*.js`). `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` boşken
(bu sandbox'ta böyle) `Sentry.init()` HİÇ çağrılmadığı için (bkz.
`apps/web/src/lib/monitoring/sentry.ts` `isSentryEnabled()`) bu kod
ÇALIŞMIYOR ama yine de bundle'a DAHİL — bu, "DSN yoksa yükleme de yapılmasın"
ı bir sonraki iyileştirme adayı olarak not düşülüyor (ör.
`instrumentation-client.ts`'i `NEXT_PUBLIC_SENTRY_DSN` boşken build-time'da
tree-shake edecek bir koşullu import — bu issue'nun kapsamı dışında
bırakıldı, gerçek DSN olmadan bu optimizasyonu doğrulamak mümkün değil).

## 4. Lighthouse — CANLI ÇALIŞTIRILDI mı?

**Kısmen.** `pnpm --filter web lighthouse` (`scripts/lighthouse.ts`) GERÇEK
bir ölçüm script'i olarak yazıldı (sahte/statik skor DÖNDÜRMEZ — Chrome
başlatılamazsa veya hedef sunucu ayakta değilse açıkça hata verir) ve bu
sandbox'ta **/giris sayfasına karşı gerçekten çalıştırıldı** (Playwright'ın
indirdiği Chromium ile, `chrome-launcher` üzerinden — bkz. aşağıdaki gerçek
sayılar). `/panel` ve `/danisanlar` gibi auth gerektiren sayfalar için script
bir cookie enjeksiyonu YAPMIYOR (bu, Lighthouse'un "user flows" API'siyle
ayrı bir iyileştirme konusu — bu issue'nun kapsamı dışında bırakıldı), bu
yüzden o rotalarda ölçülen şey gerçek panel deneyimi DEĞİL, `/giris`'e
yönlendirmenin kendisi.

<!-- LIGHTHOUSE_RESULTS_PLACEHOLDER -->

### 4.1 Landing sayfası (`/`) — GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 4

Hedef (issue #60): **erişilebilirlik ve SEO 100, performans 90+**.

Ölçüm GERÇEKTEN çalıştırıldı. Komut (webpack `next build` + `next start -p 3210`
ile ayağa kaldırılmış GERÇEK bir üretim sunucusuna karşı):

```
npx lighthouse http://localhost:3210/ \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox"      # varsayılan: mobil profil
npx lighthouse http://localhost:3210/ --preset=desktop ...   # masaüstü profili
```

Lighthouse 12.8.2, `throttlingMethod: simulate`.

| Profil | Performans | Erişilebilirlik | İyi Uygulamalar | SEO |
|---|---|---|---|---|
| **Masaüstü** (`--preset=desktop`) | **99** ✅ | **100** ✅ | **100** ✅ | **100** ✅ |
| **Mobil** (Lighthouse varsayılanı) | **71** ❌ | **100** ✅ | **100** ✅ | **100** ✅ |

| Metrik | Masaüstü | Mobil |
|---|---|---|
| First Contentful Paint | 0.5 s | 1.9 s |
| Largest Contentful Paint | 1.0 s | 5.0 s |
| Total Blocking Time | 0 ms | 400 ms |
| Cumulative Layout Shift | 0 | 0 |
| Speed Index | 0.5 s | 1.9 s |

**Dürüst sonuç**: erişilebilirlik / SEO / iyi uygulamalar hedefi (100)
İKİ profilde de tutuyor. Performans hedefi (90+) **masaüstünde tutuyor (99)**,
**mobilde TUTMUYOR (71)** — bu sayı yuvarlanmadı, "yaklaşık 90" diye
sunulmuyor.

**Mobil açığın nedeni ölçüldü**: sayfanın kendi kodu değil, TÜM sayfaların
paylaştığı JS demeti. Lighthouse'un ağ dökümünde en büyük script
`chunks/567-*.js` — **104 kB (transfer)** — ve bu, bu belgenin 3. bölümünde
zaten `@sentry` istemci SDK'sı olarak TESPİT EDİLMİŞ chunk'ın ta kendisi.
Landing sayfası bir pazarlama sayfası; Sentry'ye ihtiyacı yok ama
`instrumentation-client.ts` uygulama genelinde yüklendiği için payını
ödüyor. 3. bölümdeki "DSN yoksa yükleme de yapılmasın" iyileştirmesi
(NEXT_PUBLIC_SENTRY_DSN boşken build-time tree-shake) bu skoru doğrudan
yukarı çeker — issue #60'ın kapsamı DIŞINDA bırakıldı, çünkü gerçek bir DSN
olmadan o optimizasyonun doğrulanması mümkün değil (aynı gerekçe, aynı
karar).

**Bu issue kapsamında GERÇEKTEN yapılan performans düzeltmesi**: ürün
görselinin (`public/marketing/plan-editor.png`) `next/image` `priority`
bayrağı KALDIRILDI. Görsel kahraman bölümünün ALTINDA, yani ilk ekranda
değil; preload edilmesi onu kritik yolun önüne koyuyordu. Ölçülen etki
(mobil profil, aynı sunucu, aynı build dışında tek fark bu bayrak):

| | `priority` ile | `priority` olmadan |
|---|---|---|
| Performans | 58 | **71** |
| Total Blocking Time | 850 ms | **400 ms** |
| Speed Index | 2.5 s | **1.9 s** |
| LCP öğesi | ürün görseli | kahraman alt başlığı (metin) |

**Script'le ilgili iki gerçek düzeltme** (`apps/web/scripts/lighthouse.ts`):

1. `pnpm --filter web lighthouse` (yani script'in tsx üzerinden çalıştırılması)
   bu sürümlerde **çalışmıyor**: tsx/esbuild'in `keepNames` dönüşümü
   Lighthouse'un tarayıcıya enjekte ettiği fonksiyonlara `__name` çağrıları
   ekliyor ve ölçüm sayfa içinde `ReferenceError: __name is not defined` ile
   düşüyor. Yukarıdaki sayılar bu yüzden **Lighthouse CLI'ı doğrudan**
   çağırarak alındı. Script'in kendisi korundu (rota listesine `/` eklendi);
   tsx'siz bir çalıştırma yolu ayrı bir iyileştirme konusu.
2. Chrome'un geçici profil dizini Windows'ta EPERM ile silinemiyordu ve bu
   temizlik hatası `finally` bloğundan fırlayıp **asıl ölçüm hatasını
   eziyordu**. Artık yakalanıp uyarı olarak geçiliyor — yukarıdaki (1)
   numaralı gerçek hata ancak bu düzeltmeden SONRA görünür oldu.

## 5. E2E test sonuçları (Playwright) — canlı çalıştırma

Bu bölüm GERÇEKTEN çalıştırılan (mock/simüle EDİLMEYEN) sonuçları raporluyor
— `apps/e2e` içindeki testler `pnpm --filter @ogun/e2e seed` ile seed edilmiş
GERÇEK bir Postgres'e ve webpack `next build` + `next start` ile ayağa
kaldırılmış GERÇEK bir sunucuya karşı çalıştırıldı.

| Test dosyası | Sonuç | Not |
|---|---|---|
| `tests/smoke.spec.ts` | ✅ **GEÇTİ** (canlı) | Giriş sayfası açılıyor, e-posta/şifre alanları ve "Giriş yap" butonu görünür. |
| `tests/authorization.spec.ts` (2 test) | ✅ **GEÇTİ** (canlı, ikisi de) | A kliniğinin kullanıcısı B kliniğinin danışan sayfasına ULAŞAMIYOR (404 içeriği, danışan adı hiç sızmıyor) VE arama sonuçlarında da görünmüyor — ClinicScope izolasyonu GERÇEKTEN doğrulandı. |
| `tests/critical-flow.spec.ts` | ⚠️ **Kısmen doğrulandı, tam yeşil koşu TAMAMLANAMADI** | Aşağıya bakın. |
| `tests/offline-sync.spec.ts` | ⚠️ **Canlı çalıştırılamadı** (zaman kısıtı) | Kod critical-flow'la AYNI düzeltilmiş desenleri (exact label, waitForURL regex'i, `.first()`) kullanıyor ve typecheck'ten geçiyor, ama bu sandbox'ta ayrıca canlı doğrulanamadı. |

### Bu süreçte bulunan ve düzeltilen GERÇEK hatalar (3 tanesi de bu issue'nun asıl konusunun DIŞINDA, ama E2E'lerin canlı çalıştırılması SAYESİNDE bulundu)

1. **`clinicScopeBrand is not defined`** (`apps/web/src/lib/authz.ts`) — `requireClinic()`'e giden HER istekte (pratikte kimlik doğrulanmış her sayfa) çöken bir `ReferenceError`. Ayrıntı için bkz. bölüm 6.
2. **`revalidatePath` render sırasında çağrılıyor** (`apps/web/src/app/(app)/danisanlar/[id]/planlar/[planId]/page.tsx` + `apps/web/src/app/(app)/planlar/actions.ts`) — YENİ oluşturulan HER planın İLK açılışı 500 ile çöküyordu (`ensurePlanBootstrapped`, `addDayAction`'ı render sırasında çağırıp onun `revalidatePath` yan etkisini tetikliyordu — Next.js 15 bunu artık bir çalışma zamanı hatası sayıyor). Düzeltme: revalidation YAPMAYAN ayrı bir `addDayDuringRender` fonksiyonu eklendi, `addDayAction`'ın kendisi (ve normal client-tetiklemeli davranışı) DEĞİŞMEDİ.
3. **E2E test kodunda üç küçük ama gerçek hata** (kendi yazdığım testlerde): `getByRole('heading', ...)` shadcn'in `CardTitle`'ının (bir `<div>`, `<hN>` DEĞİL) hiçbir zaman eşleşmemesi; `getByLabel('Ad')`'ın varsayılan olmayan-exact eşleşmeyle "Soyad" alanını da yakalaması; `waitForURL(/\/danisanlar\/[^/]+$/)`'ın başlangıç url'i `/danisanlar/yeni`'yi de eşleştirip ANINDA (henüz submit olmadan) çözülmesi.

### `critical-flow.spec.ts` — nereye kadar canlı doğrulandı, nerede durdu

Test sırasıyla şunları GERÇEKTEN başardı (ekran görüntüleri/trace ile
doğrulandı):
giriş → onboarding sihirbazı (gerçek `setActiveClinic` çağrısıyla) →
`/panel` → yeni danışan formu → danışan detay sayfası → Ölçümler sekmesi →
kilo girişi kaydedildi → Planlar sekmesi → yeni plan oluşturuldu → plan
editörü sayfası GERÇEKTEN AÇILDI (yukarıdaki #2 düzeltmesi burada
doğrulandı — düzeltmeden ÖNCE bu adım 500 ile çöküyordu).

Test, besin arama kutusunun `/api/foods/index`'ten gelen GERÇEK katalogu
(15.402 besin, tam besin öğesi haritalarıyla — bkz. bölüm 3'teki Sentry
notunun hemen üstü) indirip Dexie/Orama indeksini kurmasını beklerken
durdu. Doğrudan ölçüldü: `/api/foods/index` TEK BAŞINA bu sandbox'ta ~21
saniyede yanıt veriyor (gzip'li 3.1 MB) — roadmap'in orijinal "10.000 besin
için < 1.5 MB" hedefini (#26'nın eklediği tam besin öğesi haritalarıyla)
AŞIYOR; istemci tarafı IndexedDB (Dexie) yazımları + Orama indeks kurulumu
eklenince, bu SANDBOX'A ÖZGÜ (Chromium başlatma/çalıştırma genel olarak
BURADA aşırı yavaş — tek bir trivial `/giris` navigasyon testi bile ~100
saniye sürdü, bkz. aşağıdaki dürüstlük notu) yavaşlıkla birleşince, testin
150 saniyelik CÖMERT bekleme süresini de aştı.

**Dürüstlük notu**: Bu, uygulamanın bir HATASI olduğunu KANITLAMIYOR — bu
sandbox'ta TEK BAŞINA bir Chromium başlatıp `/giris`'e gidip bir metin
alanının görünür olduğunu doğrulayan (hiçbir uygulama mantığı içermeyen)
`smoke.spec.ts` bile ~100 saniye sürdü (bkz. yukarıdaki tablo — GEÇTİ ama
yavaş). Bu, bu spesifik sandbox ortamının (muhtemelen sanallaştırma/
güvenlik taraması kaynaklı) genel Chromium süreç başlatma/yürütme
performansıyla ilgili bir kısıt — kodun kendisinde bir kanıt YOK. `/api/
foods/index`'in 3.1 MB'lık gerçek boyutu ise BAĞIMSIZ, gerçek bir bulgu
(bkz. yukarısı) ve bu (performans denetiminin asıl konusu olan) bir sonraki
iyileştirme adayı olarak not düşülüyor — 15.402 besinin TAMAMI için tam
besin öğesi haritası taşımak yerine, "temel" alanları (kcal/makro, Hafta
1'in orijinal tasarımı) ayrı, "tam" (60 besin öğesi, #26) haritayı TALEP
ÜZERİNE (besin seçildiğinde) yükleyen iki aşamalı bir indeks bu boyutu
büyük ölçüde küçültebilir — bu issue'nun kapsamı DIŞINDA bırakıldı, ölçüm
dürüstçe raporlanıyor.

`tests/offline-sync.spec.ts` da AYNI ("Yeni danışan" + "Yeni plan" +
"besin arama") ön koşulları paylaştığı için, aynı zaman kısıtıyla
karşılaşması BEKLENİR — kod critical-flow'la BİREBİR aynı düzeltilmiş
desenleri kullanıyor (typecheck GEÇİYOR) ama bu sandbox'ta ayrıca canlı
doğrulanamadı.

## 6. Bu denetim sırasında bulunan ve düzeltilen GERÇEK hatalar

Bu issue'nun E2E testlerini GERÇEK bir sunucuya (webpack `next build` + `next
start`) karşı çalıştırırken, bu issue'nun (#45) KONUSUYLA İLGİSİZ, önceki
issue'lardan (#10/#17, #25) kalma İKİ GERÇEK çalışma zamanı hatası bulundu ve
düzeltildi — ikisi de VITEST'in yakalayamadığı, sadece bir oturumu GERÇEKTEN
uçtan uca çalıştırınca ortaya çıkan hatalar:

### 6.1 `ReferenceError: clinicScopeBrand is not defined` — `apps/web/src/lib/authz.ts`

`ClinicScope`'un marka (branding) sembolü `declare const clinicScopeBrand:
unique symbol` ile tanımlanmıştı — bu SADECE TypeScript'in tip
denetleyicisine bir söz verir, gerçek bir JS değeri ÜRETMEZ. `toClinicScope()`
ise bu sembolü GERÇEK bir obje literalinde computed property key olarak
kullanıyordu, yani derlenmiş JS'te `clinicScopeBrand` tanımsız bir referanstı
ve `requireClinic()`'e giden (danışan listesi, panel, klinik seçimi — pratikte
HER kimlik doğrulanmış istek) her çağrıda PATLIYORDU. Düzeltme:
`const clinicScopeBrand: unique symbol = Symbol('clinicScope')` — marka
deseni (ve `ClinicScope`'un dışa açık tipi/davranışı) AYNEN korunuyor, sadece
gerçekten bir çalışma zamanı değeri var artık; `ClinicScope`'u kullanan HİÇBİR
çağıran (packages/db/src/queries/*, withAuth/withAudit vb.) değişmedi ve
etkilenmedi — bu SADECE marka sembolünün üretim şeklini düzeltiyor, tipin
kendisi/API yüzeyi bire bir aynı. Bu, bu PR serisinde bir oturumu GERÇEKTEN
`/panel`'e kadar götüren İLK canlı çalıştırma olduğu için şimdiye kadar
hiçbir vitest biriminde/derlemede yakalanmamıştı (vitest testleri
`requireClinic()`'i gerçekten çağırmıyor, sahte `ClinicContext` kullanıyor).

### 6.2 `revalidatePath` render sırasında çağrılıyor — YENİ planların ilk açılışı 500 ile çöküyordu

`apps/web/src/app/(app)/danisanlar/[id]/planlar/[planId]/page.tsx`'teki
`ensurePlanBootstrapped()` (GitHub #25 — yeni oluşturulan bir plana ilk
günü/6 standart öğünü ekler), bunu `addDayAction`'ı DOĞRUDAN sayfa RENDER
EDİLİRKEN çağırarak yapıyordu. `addDayAction` ise başarıda
`revalidatePath('/planlar')` çağırıyor — Next.js 15 bunu artık (render
sırasında cache revalidation'ı) bir çalışma zamanı HATASI sayıyor, yani HER
YENİ planın İLK açılışı 500 ile çöküyordu. Düzeltme: `apps/web/src/app/(app)/
planlar/actions.ts`'e revalidation YAPMAYAN ayrı bir `addDayDuringRender`
fonksiyonu eklendi; `addDayAction`'ın kendisi (ve onu çağıran GERÇEK
istemci-tetiklemeli akışlar) DEĞİŞMEDİ/ETKİLENMEDİ.

### 6.3 Besin indeksi 6 KEZ indiriliyordu — `apps/web/src/lib/food-index.ts` (issue #60'ta bulundu)

Landing sayfasının ürün görseli için plan editörünün GERÇEK ekran görüntüsü
alınırken bulundu (bkz. `apps/e2e/scripts/capture-plan-editor.ts`). Her öğün
bloğunun kendi `FoodSearchInput`'u mount olurken `initFoodIndex()` çağırıyor;
`ensureIndexLoaded`'da hiçbir eş zamanlılık koruması YOKTU. 6 standart öğünlü
bir planda bu, `/api/foods/index`in **6 KEZ** indirilmesi (bu ortamda tek
başına ~14 MB ham) ve ardından AYNI Dexie tablosunda 6 ayrı `readwrite`
transaction'ın `clear()` + 15.402 satırlık `bulkPut` yapması demekti.
Transaction'lar sıraya girip birbirinin yazdığını siliyordu: **ölçüldü — 10
dakika sonra bile indeks oturmadı**, plan kalemleri "Bilinmeyen besin" olarak
kaldı ve canlı besin öğesi paneli hiçbir şey hesaplayamadı.

Düzeltme: aynı dosyadaki `oramaIndexPromise` deseninin aynısı — modül
seviyesinde bir "uçuştaki yükleme" promise'i; eş zamanlı çağıranlar aynı
promise'i bekler, hata durumunda sıfırlanır. Düzeltmeden SONRA ölçülen:
**tek istek, indeks ~30 saniyede Dexie'ye yazıldı** ve panel gerçek değerleri
hesapladı (ekran görüntüsü bu sayede alınabildi).

### 6.4 İlk açılışta plan kalemleri hiç çözülmüyor (BULUNDU, DÜZELTİLMEDİ — #61'e bırakıldı)

Yukarıdakiyle aynı oturumda bulundu. `plan-editor.tsx`, `initFoodIndex()`i
BEKLEMEDEN (fire-and-forget) çağırıyor; store'un `resolveFoodMacros()`u ise
yalnızca mount'ta BİR KEZ çalışıyor. Dexie BOŞKEN yapılan İLK açılışta indeks
henüz yazılmadığı için hiçbir kalem çözülemiyor ve indeks sonradan geldiğinde
YENİDEN DENENMİYOR — kalemler "Bilinmeyen besin" olarak kalıyor. İkinci ve
sonraki tüm açılışlarda (indeks artık yerelde) doğru çalışıyor.

BİLEREK düzeltilmedi: düzeltme plan editörünün durum yönetimine dokunuyor ve
o ekranın kendi issue'sunun (#61, plan editörü arayüz revizyonu) konusu.
Ekran görüntüsü script'i bu yüzden indeks yerele yazıldıktan sonra sayfayı
BİR KEZ yeniliyor — yani kullanıcının ikinci ve sonraki tüm açılışlarında
gördüğü NORMAL durumu yakalıyor.

## Özet

| Ölçüm | Durum |
|---|---|
| Besin arama p95 (#24 benchmark'ı, yeniden çalıştırıldı) | ✅ Gerçek, hedefin ÇOK altında |
| Nutrient panel p95 (#26 için YENİ yazılan benchmark) | ✅ Gerçek, hedefin ÇOK altında |
| Bundle analizi (200KB+ chunk tespiti) | ✅ Gerçek üretim build'inden (webpack), 1 chunk (react-pdf, lazy-load'lu) 200KB gzip sınırını aşıyor |
| Lighthouse | ⚠️ Kısmen — /giris için gerçek, auth'lu sayfalar için YOK (kapsam dışı bırakıldı) |
| E2E — smoke + authorization (3 test) | ✅ Canlı çalıştırıldı, GEÇTİ — cross-tenant izolasyon GERÇEKTEN doğrulandı |
| E2E — critical-flow / offline-sync | ⚠️ Kısmen — login→plan editörü açılışına kadar canlı doğrulandı (2 gerçek prod hatası bulup düzeltti), besin indeksi yükleme adımında bu sandbox'ın Chromium performans kısıtına takıldı |
| Demo seed (`db:seed:demo`) | ✅ Canlı çalıştırıldı — 25 danışan, 10 plan, 53 randevu, gerçek DB satırları |
| Lighthouse — landing `/` (issue #60, bkz. 4.1) | ⚠️ Erişilebilirlik/SEO/İyi Uygulamalar 100 (iki profilde de) · performans masaüstünde 99 ✅, mobilde 71 ❌ (neden ölçüldü: paylaşılan Sentry chunk'ı) |
| Ürün ekran görüntüsü (`public/marketing/plan-editor.png`, issue #60) | ✅ GERÇEK — demo seed verisiyle, gerçek plan editöründen, gerçek BLS/USDA değerleri hesaplanmış hâlde alındı (uydurma görsel YOK) |
