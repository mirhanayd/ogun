import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import postgres from 'postgres'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "Ürün görseli: plan
// editörünün GERÇEK ekran görüntüsü. UYDURMA GÖRSEL KULLANMA — demo seed
// verisiyle (pnpm db:seed:demo) gerçek ekranın görüntüsünü al,
// public/marketing/ altına koy."
//
// BU SCRIPT SAHTE GÖRSEL ÜRETMEZ. Gerçek bir Chromium açar, GERÇEK bir
// oturumla giriş yapar, demo kliniğinin GERÇEK bir planını GERÇEK plan
// editöründe açar ve ekranı yazar. Herhangi bir adım başarısız olursa
// AÇIKÇA hata verir ve dosya OLUŞMAZ — "yaklaşık doğru" bir mockup'a
// düşmez.
//
// ÇALIŞTIRMA (sırayla, hepsi zorunlu):
//   1. docker compose up -d postgres
//   2. pnpm --filter @ogun/db db:push && pnpm --filter @ogun/db db:seed
//   3. pnpm --filter @ogun/db db:seed:demo
//   4. apps/web içinde: npx next build   (--turbopack OLMADAN)
//      NEXT_PUBLIC_BETTER_AUTH_URL build'e GÖMÜLÜR: sunucuyu build'in
//      gömdüğü PORTLA başlatın, yoksa giriş sessizce asılı kalır.
//   5. pnpm --filter web exec next start -p 3100
//   6. pnpm --filter @ogun/e2e capture:plan-editor
//
// DEMO VERİSİNE YAPILAN TEK MÜDAHALE VE NEDENİ:
// #45'in demo seed'i plan kalemlerini BİLEREK `free_text` olarak yazıyor
// (bkz. packages/db/src/seed/demo.ts dosya başı notu) — yani hiçbir kalem
// gerçek bir `foods` kaydına bağlı DEĞİL ve canlı besin öğesi paneli
// hiçbir şey HESAPLAYAMAZ. Bu script, ekran görüntüsünü alacağı TEK planın
// kalemlerini, veritabanındaki GERÇEK BLS/USDA besin kayıtlarına bağlar
// (aşağıdaki ITEM_MAPPING) — yani bir diyetisyenin arama kutusundan besin
// SEÇMESİYLE oluşacak DURUMUN AYNISINI kurar, sadece UI yerine SQL ile.
// Besin öğesi DEĞERLERİ, hesaplama ve arayüz OLDUĞU GİBİ kalır; hiçbir
// sayı elle yazılmaz.
//
// BİLEREK YAPILMAYAN ŞEY: `foods.name_tr` DEĞİŞTİRİLMEZ. İçe aktarılan
// kayıtların adları hâlâ İngilizce/Almanca (bkz. packages/etl/src/importers/
// bls.ts `needsTranslation`) ve ekran görüntüsünde de öyle görünür. Adları
// "daha pazarlanabilir" hâle getirmek, ürünü olduğundan ileride göstermek
// olurdu — landing sayfası bu eksiği zaten AÇIKÇA yazıyor (bkz.
// app/_landing/content.ts SOURCE_CAVEATS).
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[capture] DATABASE_URL tanımlı değil.')
  process.exit(1)
}

const BASE_URL = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3100'
const DEMO_EMAIL = process.env.CAPTURE_EMAIL ?? 'elif.kaya@yesiladimdiyet.com'
const DEMO_PASSWORD = process.env.CAPTURE_PASSWORD ?? 'OgunDemo2026!'
// GitHub issue #61 — çıktı yolu ve tema artık ortam değişkeniyle
// EZİLEBİLİR. Gerekçe: bu script'in asıl işi (#60) landing sayfasının ürün
// görselini üretmek, ama plan editörünün YERLEŞİM değişikliklerini gözle
// doğrulamak için de aynı gerçek ekranı — açık VE koyu temada — çekmek
// gerekiyor. Varsayılanlar DEĞİŞMEDİ: değişkensiz çalıştırıldığında script
// eskisi gibi public/marketing/plan-editor.png'yi açık temada üretir.
const OUT_PATH = process.env.CAPTURE_OUT_PATH
  ? path.resolve(process.env.CAPTURE_OUT_PATH)
  : path.resolve(__dirname, '../../web/public/marketing/plan-editor.png')
// 'light' | 'dark' — next-themes tercihi localStorage'ta 'theme' anahtarında
// tutulur (bkz. apps/web/src/app/providers.tsx), sayfa yüklenmeden ÖNCE
// yazılır ki ilk boyamada doğru tema uygulansın.
const CAPTURE_THEME = process.env.CAPTURE_THEME === 'dark' ? 'dark' : 'light'

// Demo planının serbest metin kalemleri → veritabanındaki gerçek besin
// kaydı + gram miktarı. `match` serbest metinde aranan ipucu, `foodQuery`
// foods.search_text içinde aranan İngilizce ad parçası, `grams` diyetisyenin
// gireceği makul porsiyon.
// SIRAYA GÖRE uygulanır (öğün sort_order, ardından kalem sort_order) —
// serbest metne göre DEĞİL. Gerekçe: script TEKRAR ÇALIŞTIRILABİLİR olmalı;
// ilk koşudan sonra kalemlerin `free_text`i zaten NULL olur ve metne göre
// eşleme ikinci koşuda hiçbir şey yapamaz (porsiyonlar da güncellenemez).
// `seedHint`, demo seed'in (packages/db/src/seed/sample-plan-template.ts)
// aynı sıradaki serbest metnidir — sadece okunabilirlik için, eşlemede
// KULLANILMAZ; bir uyumsuzluk olursa aşağıdaki uzunluk kontrolü yakalar.
//
// PORSİYONLAR: hedef kaloriye (demo planda 1541 kcal) makul biçimde
// oturacak şekilde seçildi. Bu bir diyetisyenin yapacağı işin AYNISI;
// besin öğesi DEĞERLERİ hesaplanmaz, motor hesaplar.
//
// NOT: `foodQuery` NORMALLEŞTİRİLMİŞ metne (foods.search_text — noktalama
// ve yüzde işaretleri atılmış, küçük harf) göre aranır; "3.5 %" burada
// "3 5" olarak geçer (bkz. packages/etl/src/lib/normalize.ts).
const ITEM_MAPPING: Array<{ seedHint: string; foodQuery: string; grams: number }> = [
  { seedHint: '2 adet haşlanmış yumurta', foodQuery: 'chicken egg boiled', grams: 100 },
  { seedHint: '1 dilim tam buğday ekmeği', foodQuery: 'wholemeal wheat bread', grams: 50 },
  { seedHint: '1 kase yoğurt', foodQuery: 'yogurt min 3 5 fat lactose', grams: 150 },
  { seedHint: 'Domates, salatalık, yeşillik', foodQuery: 'tomato raw', grams: 150 },
  { seedHint: '1 orta boy elma', foodQuery: 'apple raw', grams: 150 },
  { seedHint: '5 adet badem', foodQuery: 'sweet almond', grams: 10 },
  { seedHint: '1 kase mercimek çorbası', foodQuery: 'lentil mature boiled', grams: 150 },
  { seedHint: '150 g ızgara tavuk göğsü', foodQuery: 'chicken breast fillet grilled', grams: 110 },
  { seedHint: '2 yemek kaşığı bulgur pilavı', foodQuery: 'bulgur cooked', grams: 120 },
  { seedHint: 'Mevsim salatası', foodQuery: 'cucumber raw', grams: 120 },
  { seedHint: '1 kase süzme yoğurt', foodQuery: 'yogurt min 3 5 fat lactose', grams: 120 },
  { seedHint: '1 tatlı kaşığı bal', foodQuery: 'honey', grams: 15 },
  { seedHint: '150 g fırında somon', foodQuery: 'salmon grilled', grams: 120 },
  { seedHint: 'Buharda sebze (brokoli, havuç)', foodQuery: 'broccoli stewed', grams: 200 },
  { seedHint: '1 kase yoğurt', foodQuery: 'yogurt min 3 5 fat lactose', grams: 120 },
]

async function main() {
  const sql = postgres(DATABASE_URL!, { max: 1 })

  try {
    const [clinic] = await sql<{ id: string }[]>`
      select id from clinics where name = 'Yeşil Adım Diyet ve Beslenme Kliniği' order by created_at desc limit 1
    `
    if (!clinic) throw new Error('Demo kliniği bulunamadı — önce `pnpm --filter @ogun/db db:seed:demo`.')

    const [member] = await sql<{ user_id: string; role: string }[]>`
      select cm.user_id, cm.role from clinic_members cm
      join users u on u.id = cm.user_id
      where cm.clinic_id = ${clinic.id} and u.email = ${DEMO_EMAIL}
      limit 1
    `
    if (!member) throw new Error(`Demo kullanıcısı (${DEMO_EMAIL}) bu klinikte üye değil.`)

    // En dolu planı seç — ekran görüntüsünde boş bir editör işe yaramaz.
    const [plan] = await sql<{ id: string; client_id: string; item_count: number }[]>`
      select dp.id, dp.client_id,
             (select count(*) from plan_days d
                join plan_meals m on m.day_id = d.id
                join plan_items i on i.meal_id = m.id
              where d.plan_id = dp.id)::int as item_count
      from diet_plans dp
      join clients c on c.id = dp.client_id
      where c.clinic_id = ${clinic.id}
      order by item_count desc, dp.created_at desc
      limit 1
    `
    if (!plan || plan.item_count === 0) throw new Error('Demo kliniğinde kalemli bir plan bulunamadı.')

    const items = await sql<{ id: string; free_text: string | null }[]>`
      select i.id, i.free_text from plan_days d
        join plan_meals m on m.day_id = d.id
        join plan_items i on i.meal_id = m.id
      where d.plan_id = ${plan.id}
      order by m.sort_order, i.sort_order
    `

    if (items.length !== ITEM_MAPPING.length) {
      throw new Error(
        `Plan ${items.length} kalem içeriyor ama ITEM_MAPPING ${ITEM_MAPPING.length} satır tanımlıyor — ` +
          'demo seed şablonu (packages/db/src/seed/sample-plan-template.ts) değişmiş olabilir; eşlemeyi güncelleyin.',
      )
    }

    let linked = 0
    for (const [index, item] of items.entries()) {
      const mapping = ITEM_MAPPING[index]!
      const [food] = await sql<{ id: string }[]>`
        select f.id from foods f
        where f.search_text like ${'%' + mapping.foodQuery.toLowerCase() + '%'}
          and exists (select 1 from food_nutrients fn where fn.food_id = f.id)
        order by length(f.name_tr) asc
        limit 1
      `
      if (!food) {
        console.warn(`[capture] Eşleşen besin bulunamadı: "${mapping.foodQuery}" (seed kalemi: ${mapping.seedHint})`)
        continue
      }
      await sql`
        update plan_items set food_id = ${food.id}, free_text = null, amount = ${mapping.grams}, portion_id = null
        where id = ${item.id}
      `
      linked += 1
    }
    // Eşleme SIRAYA göre ve koşulsuz uygulandığı için script tekrar
    // çalıştırılabilir: ikinci koşu aynı besinleri ve aynı porsiyonları
    // yeniden yazar. Yine de son durumu doğrula.
    const [linkedRow] = await sql<{ count: number }[]>`
      select count(*)::int as count from plan_days d
        join plan_meals m on m.day_id = d.id
        join plan_items i on i.meal_id = m.id
      where d.plan_id = ${plan.id} and i.food_id is not null
    `
    const linkedTotal = linkedRow?.count ?? 0
    console.log(
      `[capture] Bu koşuda ${linked} kalem bağlandı; planda toplam ${linkedTotal}/${items.length} kalem gerçek besin kaydına bağlı.`,
    )
    if (linkedTotal === 0) {
      throw new Error(
        'Hiçbir kalem gerçek besin kaydına bağlanamadı — besin veri tabanı içe aktarılmamış olabilir (pnpm --filter @ogun/etl ...).',
      )
    }

    const browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: CAPTURE_THEME,
    })
    // next-themes'in kendi tercihini de yaz — `colorScheme` yalnızca
    // prefers-color-scheme medya sorgusunu etkiler, uygulamanın varsayılanı
    // "system" olduğu için ikisi birlikte tutarlı davranır; tercih açıkça
    // yazıldığında tema geçişi ilk boyamada kesinleşir.
    await context.addInitScript(`window.localStorage.setItem('theme', '${CAPTURE_THEME}')`)
    const page = await context.newPage()

    try {
      await page.goto(`${BASE_URL}/giris`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('E-posta', { exact: true }).fill(DEMO_EMAIL)
      await page.getByLabel('Şifre', { exact: true }).fill(DEMO_PASSWORD)
      await page.getByRole('button', { name: 'Giriş yap' }).click()
      await page.waitForURL(/\/(panel|kurulum)/, { timeout: 120_000 })

      // Demo kullanıcısının oturumu, giriş anında bir AKTİF KLİNİĞE bağlı
      // DEĞİL (bkz. apps/web/src/lib/authz.ts setActiveClinic — bunu yalnızca
      // onboarding'in son adımı ve klinik seçici yapar), bu yüzden uygulama
      // /kurulum'a yönlendirir. Onboarding sihirbazını yeniden çalıştırmak
      // YENİ bir taslak klinik yaratır ve demo verisini ıskalar; oturumu
      // doğrudan mevcut demo kliniğine bağlamak, klinik seçicinin
      // yapacağının AYNISI (aynı iki sütun) ve demo verisini KORUR.
      await sql`
        update sessions set active_clinic_id = ${clinic.id}, role = ${member.role}
        where user_id = ${member.user_id}
      `

      const editorUrl = `${BASE_URL}/danisanlar/${plan.client_id}/planlar/${plan.id}`
      await page.goto(editorUrl, { waitUntil: 'domcontentloaded' })

      // İlk girişte 4 adımlı ürün turu diyaloğu açılıyor (#47, bkz.
      // app/(app)/_components/product-tour.tsx) ve sayfayı bulanıklaştırıyor.
      // Gerçek kullanıcının yaptığını yap: "Turu atla".
      const skipTour = page.getByRole('button', { name: 'Turu atla' })
      if (await skipTour.isVisible({ timeout: 15_000 }).catch(() => false)) {
        await skipTour.click()
        await page.waitForTimeout(1_500)
      }

      // Aşağıdaki döngü, ekran görüntüsü alınmadan ÖNCE sayfanın GERÇEKTEN
      // hazır olduğunu doğrular. Tek bir `waitForFunction` yerine AÇIK bir
      // yoklama döngüsü tercih edildi: her adımı LOGLUYOR, böylece
      // başarısızlıkta "neyi bekliyordu" sorusu tahmin gerektirmiyor.
      //
      // İKİ DURUM BEKLENİYOR:
      //   a) Besin indeksi tarayıcıdaki Dexie veritabanına YAZILMIŞ olmalı
      //      (/api/foods/index — bu ortamda ~14 MB ham, ~20-30 sn).
      //   b) Kalemler ÇÖZÜLMÜŞ ("Bilinmeyen besin" kalmamış) ve panel
      //      SIFIRDAN BÜYÜK bir enerji hesaplamış olmalı. Hesaplamamış bir
      //      panelin görüntüsü ürünü YANLIŞ gösterirdi.
      //
      // GitHub issue #61 — BU DÖNGÜ ARTIK SAYFAYI YENİLEMİYOR. #60'ta buraya
      // "indeks yerele yazıldıktan sonra bir kez yenile" geçici çözümü
      // konmuştu, çünkü store'un `resolveFoodMacros()`u yalnızca mount'ta bir
      // kez çalışıyor ve Dexie BOŞKEN yapılan İLK açılışta hiçbir kalemi
      // çözemiyordu (kalemler "Bilinmeyen besin" olarak kalıyordu). O hata
      // #61'de KAYNAĞINDA düzeltildi: `resolveFoodMacros`/`resolveExchangeInfo`
      // artık okumadan önce indeksin hazır olmasını bekliyor (bkz.
      // apps/web/src/lib/food-index.ts whenFoodIndexReady). Yenilemenin
      // kaldırılması bu düzeltmenin CANLI DOĞRULAMASI: script tek bir açılışta
      // hazır duruma gelmiyorsa hata geri gelmiş demektir.
      const READY_DEADLINE_MS = 420_000
      const startedAt = Date.now()
      let ready = false

      while (Date.now() - startedAt < READY_DEADLINE_MS) {
        const state = await page.evaluate(async () => {
          // Tarayıcı bağlamı — apps/e2e'nin tsconfig'inde DOM lib'i YOK
          // (bu bir Node script'i), bu yüzden globalThis üzerinden
          // daraltılmış tiplerle okunuyor.
          const g = globalThis as unknown as {
            document: { body: { innerText: string } }
            indexedDB: { open: (name: string) => Record<string, unknown> }
          }
          const text = g.document.body.innerText
          const foodRows = await new Promise<number>((resolve) => {
            const request = g.indexedDB.open('ogun-food-index') as {
              onsuccess: (() => void) | null
              onerror: (() => void) | null
              result: {
                transaction: (
                  store: string,
                  mode: string,
                ) => {
                  objectStore: (name: string) => {
                    count: () => { result: number; onsuccess: (() => void) | null; onerror: (() => void) | null }
                  }
                }
              }
            }
            request.onerror = () => resolve(-1)
            request.onsuccess = () => {
              try {
                const countRequest = request.result.transaction('foods', 'readonly').objectStore('foods').count()
                countRequest.onsuccess = () => resolve(countRequest.result)
                countRequest.onerror = () => resolve(-1)
              } catch {
                resolve(-1)
              }
            }
            setTimeout(() => resolve(-1), 5_000)
          })
          return {
            foodRows,
            unresolved: text.split('Bilinmeyen besin').length - 1,
            stillLoading: text.includes('Besin indeksi yükleniyor'),
            hasNonZeroKcal: /[1-9][\d.]*\s*kcal/.test(text),
          }
        })

        const elapsed = Math.round((Date.now() - startedAt) / 1000)
        console.log(
          `[capture] t=${elapsed}s indeks=${state.foodRows} çözülmemiş=${state.unresolved} ` +
            `yükleniyor=${state.stillLoading} enerji>0=${state.hasNonZeroKcal}`,
        )

        if (state.unresolved === 0 && !state.stillLoading && state.hasNonZeroKcal) {
          ready = true
          break
        }
        await page.waitForTimeout(5_000)
      }

      if (!ready) {
        throw new Error(
          'Plan editörü ekran görüntüsü için HAZIR duruma gelmedi (besin indeksi yüklenmedi ya da panel hesaplamadı). ' +
            'Yukarıdaki t=... satırları hangi koşulun tutmadığını gösterir.',
        )
      }

      // Panelin son yeniden hesaplaması ve animasyonlar otursun.
      await page.waitForTimeout(3_000)

      mkdirSync(path.dirname(OUT_PATH), { recursive: true })
      await page.screenshot({ path: OUT_PATH })
      console.log(`[capture] Ekran görüntüsü yazıldı: ${OUT_PATH}`)
    } finally {
      // NOT: `browser.close()` bu Windows sandbox'ında DÖNMÜYOR (ölçüldü —
      // ekran görüntüsü diske yazıldıktan sonra süreç süresiz asılı kaldı).
      // Kapatmayı 10 saniyeyle sınırla: dosya ZATEN yazılmış oluyor, tek
      // atımlık bir asset script'inin kapanışı için bu yeterli.
      await Promise.race([
        browser.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ])
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  // Playwright'ın kapanmayan yardımcı süreçleri Node'un olay döngüsünü
  // açık tutabiliyor — script işini bitirdi, açıkça çık.
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('[capture] BAŞARISIZ — ekran görüntüsü ÜRETİLMEDİ (sahte görsel yazılmaz).')
  console.error(error)
  process.exit(1)
})
